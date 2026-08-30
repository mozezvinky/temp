import { isSqlBackend } from "@/lib/data-backend";
import { adminAuth, adminDb, adminStorage } from "@/lib/firebase-admin";
import { firebaseStorageBucketCandidates } from "@/lib/firebase-storage-bucket";
import { createLocalMessage, getLocalConversation, listLocalConversations, listLocalMessages } from "@/lib/local-sql";
import { sendNotificationEmailsAfterCommit, setNotification } from "@/lib/notifications-server";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_CHAT_IMAGE_TYPES: ReadonlyMap<string, string> = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
] as const);

export async function GET(request: NextRequest) {
  try {
    const decoded = await requireDecodedUser(request);
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");

    if (isSqlBackend()) {
      if (conversationId) {
        const conversation = getLocalConversation(conversationId);
        if (!conversation || conversation.locked || !conversation.participants.includes(decoded.uid)) return NextResponse.json({ messages: [] });
        return NextResponse.json({ messages: await signMessageImages(listLocalMessages(conversationId)) });
      }
      return NextResponse.json({ conversations: listLocalConversations(decoded.uid) });
    }

    const db = adminDb();
    await ensureFirestoreConversations(decoded.uid);
    if (conversationId) {
      const conversationSnap = await db.collection("messages").doc(conversationId).get();
      const participants = Array.isArray(conversationSnap.data()?.participants) ? conversationSnap.data()?.participants as string[] : [];
      if (!conversationSnap.exists || conversationSnap.data()?.locked === true || !participants.includes(decoded.uid) || await isCompletedConversation(conversationSnap.data() ?? {})) {
        if (conversationSnap.exists && conversationSnap.data()?.locked !== true) await conversationSnap.ref.set({ locked: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return NextResponse.json({ messages: [] });
      }
      const snapshot = await db.collection("messages").doc(conversationId).collection("items").orderBy("createdAt", "asc").limit(120).get();
      return NextResponse.json({ messages: await signMessageImages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))) });
    }
    const snapshot = await db.collection("messages").where("participants", "array-contains", decoded.uid).limit(40).get();
    const availableDocs = [];
    for (const doc of snapshot.docs) {
      if (doc.data().locked === true || await isCompletedConversation(doc.data())) continue;
      availableDocs.push(doc);
    }
    const conversations = await enrichConversations(availableDocs.map<Record<string, unknown>>(doc => ({ id: doc.id, ...doc.data() })));
    return NextResponse.json({ conversations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load chat.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function ensureFirestoreConversations(userId: string) {
  const db = adminDb();
  const [clientApps, workerApps] = await Promise.all([
    db.collection("applications").where("clientId", "==", userId).limit(80).get(),
    db.collection("applications").where("workerId", "==", userId).limit(80).get()
  ]);
  const accepted = [...clientApps.docs, ...workerApps.docs]
    .map<Record<string, unknown>>(doc => ({ id: doc.id, ...doc.data() }))
    .filter(app => app.status === "accepted" && typeof app.jobId === "string" && typeof app.clientId === "string" && typeof app.workerId === "string");
  if (!accepted.length) return;

  const jobSnaps = await Promise.all(accepted.map(app => db.collection("jobs").doc(String(app.jobId)).get()));
  const batch = db.batch();
  let writes = 0;
  accepted.forEach((app, index) => {
    const jobStatus = String(jobSnaps[index].data()?.status ?? "");
    if (!["open", "live", "assigned", "active"].includes(jobStatus)) return;
    const conversationRef = db.collection("messages").doc(`${app.jobId}_${app.workerId}`);
    batch.set(conversationRef, {
      id: conversationRef.id,
      jobId: app.jobId,
      clientId: app.clientId,
      workerId: app.workerId,
      locked: false,
      participants: [app.clientId, app.workerId],
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    writes += 1;
  });
  if (writes) await batch.commit();
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await requireDecodedUser(request);
    const input = await parseMessageInput(request);
    const conversationId = input.conversationId;
    const text = input.text;
    const imageFile = input.imageFile;
    if (!conversationId || (!text && !imageFile)) return NextResponse.json({ error: "Enter a message or choose an image." }, { status: 400 });

    if (isSqlBackend()) {
      const conversation = getLocalConversation(conversationId);
      if (!conversation || conversation.locked || !conversation.participants.includes(decoded.uid)) {
        return NextResponse.json({ error: "Chat is not available for this job." }, { status: 403 });
      }
      const imageUrl = imageFile ? await saveChatImage(conversationId, decoded.uid, imageFile) : undefined;
      const message = createLocalMessage(conversationId, decoded.uid, text, imageUrl);
      if (!message) return NextResponse.json({ error: "Chat is not available for this job." }, { status: 403 });
      return NextResponse.json({ success: true, message });
    }

    const db = adminDb();
    const conversationRef = db.collection("messages").doc(conversationId);
    const conversationSnap = await conversationRef.get();
    const conversation = conversationSnap.data();
    const participants = Array.isArray(conversation?.participants) ? conversation.participants as string[] : [];
    if (!conversationSnap.exists || conversation?.locked === true || !participants.includes(decoded.uid) || await isCompletedConversation(conversation ?? {})) {
      if (conversationSnap.exists && conversation?.locked !== true) await conversationRef.set({ locked: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ error: "Chat is not available for this job." }, { status: 403 });
    }
    const imageUrl = imageFile ? await saveChatImage(conversationId, decoded.uid, imageFile) : undefined;
    const messageRef = conversationRef.collection("items").doc();
    const receiverId = participants.find(id => id !== decoded.uid);
    const senderSnap = await db.collection("users").doc(decoded.uid).get();
    const senderName = typeof senderSnap.data()?.displayName === "string" ? senderSnap.data()?.displayName : "Someone";
    await db.runTransaction(async transaction => {
      transaction.set(messageRef, {
        id: messageRef.id,
        conversationId,
        senderId: decoded.uid,
        body: text,
        imageUrl: imageUrl ?? null,
        readBy: [decoded.uid],
        createdAt: FieldValue.serverTimestamp()
      });
      transaction.set(conversationRef, { lastMessage: text || "Image message", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (receiverId) {
        setNotification(transaction, db, {
          userId: receiverId,
          type: "chat_message_received",
          title: "New chat message",
          message: `You have a new message from ${senderName}.`,
          link: "/chat",
          emailSubject: "New message on COPIC",
          eventId: `message:${messageRef.id}:received`
        });
      }
    });
    if (receiverId) {
      await sendNotificationEmailsAfterCommit(db, [{
        userId: receiverId,
        type: "chat_message_received",
        title: "New chat message",
        message: `You have a new message from ${senderName}.`,
        link: "/chat",
        emailSubject: "New message on COPIC",
        eventId: `message:${messageRef.id}:received`
      }]);
    }
    return NextResponse.json({ success: true, message: { id: messageRef.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send message.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function parseMessageInput(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const body = await request.json().catch(() => ({}));
    return {
      conversationId: typeof body.conversationId === "string" ? body.conversationId : "",
      text: typeof body.body === "string" ? body.body.trim() : "",
      imageFile: undefined as File | undefined
    };
  }

  const form = await request.formData();
  const conversationId = String(form.get("conversationId") ?? "");
  const text = String(form.get("body") ?? "").trim();
  const file = form.get("image");
  return { conversationId, text, imageFile: file instanceof File ? file : undefined };
}

async function saveChatImage(conversationId: string, senderId: string, file: File) {
  const extension = ALLOWED_CHAT_IMAGE_TYPES.get(file.type);
  if (!extension) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size <= 0 || file.size > MAX_CHAT_IMAGE_BYTES) throw new Error("Chat images must be under 5 MB.");
  const safeConversationId = conversationId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeConversationId) throw new Error("Invalid chat upload path.");
  const uploadPath = `messages/${safeConversationId}/${crypto.randomUUID()}.${extension}`;
  const candidates = firebaseStorageBucketCandidates();
  if (!candidates.length) throw new Error("Firebase Storage bucket is not configured.");
  const buffer = Buffer.from(await file.arrayBuffer());
  let lastError: unknown = null;
  for (const bucketName of candidates) {
    try {
      await adminStorage().bucket(bucketName).file(uploadPath).save(buffer, {
        resumable: false,
        contentType: file.type,
        metadata: {
          cacheControl: "private, max-age=0, no-transform",
          metadata: { senderId, conversationId: safeConversationId }
        }
      });
      return uploadPath;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("bucket") && !message.includes("does not exist") && !message.includes("not found")) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Firebase Storage bucket was not found.");
}

async function signMessageImages(messages: Array<Record<string, unknown>>) {
  return Promise.all(messages.map(async message => ({
    ...message,
    imageUrl: typeof message.imageUrl === "string" ? await signedStorageUrl(message.imageUrl) : message.imageUrl ?? null
  })));
}

async function signedStorageUrl(path: string) {
  if (!path.startsWith("messages/")) return path;
  const expires = Date.now() + 15 * 60 * 1000;
  for (const bucketName of firebaseStorageBucketCandidates()) {
    try {
      const [url] = await adminStorage().bucket(bucketName).file(path).getSignedUrl({ action: "read", expires });
      return url;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("bucket") && !message.includes("does not exist") && !message.includes("not found")) throw error;
    }
  }
  return "";
}

async function isCompletedConversation(conversation: Record<string, unknown>) {
  const jobId = typeof conversation.jobId === "string" ? conversation.jobId : "";
  const workerId = typeof conversation.workerId === "string" ? conversation.workerId : "";
  if (!jobId) return true;
  const db = adminDb();
  const [jobSnap, applicationSnap] = await Promise.all([
    db.collection("jobs").doc(jobId).get(),
    workerId ? db.collection("applications").where("jobId", "==", jobId).where("workerId", "==", workerId).limit(1).get() : Promise.resolve(null)
  ]);
  if (!jobSnap.exists || ["completed", "cancelled"].includes(String(jobSnap.data()?.status))) return true;
  return applicationSnap ? applicationSnap.docs.some(doc => doc.data().status === "completed") : false;
}

async function enrichConversations(conversations: Array<Record<string, unknown>>) {
  const db = adminDb();
  const userIds = [...new Set(conversations.flatMap(item => [item.clientId, item.workerId]).filter((id): id is string => typeof id === "string"))];
  const userSnaps = await Promise.all(userIds.map(id => db.collection("users").doc(id).get()));
  const users = new Map(userSnaps.map(snap => [snap.id, snap.data() ?? {}]));
  return conversations
    .map<Record<string, unknown>>(conversation => {
      const client = typeof conversation.clientId === "string" ? users.get(conversation.clientId) : undefined;
      const worker = typeof conversation.workerId === "string" ? users.get(conversation.workerId) : undefined;
      return {
        ...conversation,
        clientName: typeof client?.displayName === "string" ? client.displayName : undefined,
        workerName: typeof worker?.displayName === "string" ? worker.displayName : undefined
      };
    })
    .sort((a, b) => timestampMillis(b.updatedAt) - timestampMillis(a.updatedAt));
}

async function requireDecodedUser(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new Error("Sign in is required.");
  return adminAuth().verifyIdToken(token);
}

function timestampMillis(value: unknown) {
  return typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? (value as { toMillis: () => number }).toMillis()
    : 0;
}
