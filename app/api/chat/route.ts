import { isSqlBackend } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { createLocalMessage, getLocalConversation, listLocalConversations, listLocalMessages } from "@/lib/local-sql";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const decoded = await requireDecodedUser(request);
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");

    if (isSqlBackend()) {
      if (conversationId) {
        const conversation = getLocalConversation(conversationId);
        if (!conversation || conversation.locked || !conversation.participants.includes(decoded.uid)) return NextResponse.json({ messages: [] });
        return NextResponse.json({ messages: listLocalMessages(conversationId) });
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
      return NextResponse.json({ messages: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
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
    const imageUrl = input.imageUrl;
    if (!conversationId || (!text && !imageUrl)) return NextResponse.json({ error: "Enter a message or choose an image." }, { status: 400 });

    if (isSqlBackend()) {
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
    const messageRef = conversationRef.collection("items").doc();
    const receiverId = participants.find(id => id !== decoded.uid);
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
        const notificationRef = db.collection("notifications").doc();
        transaction.set(notificationRef, {
          id: notificationRef.id,
          userId: receiverId,
          title: "New chat message",
          body: text || "Image message",
          read: false,
          href: "/chat",
          createdAt: FieldValue.serverTimestamp()
        });
      }
    });
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
      imageUrl: undefined as string | undefined
    };
  }

  const form = await request.formData();
  const conversationId = String(form.get("conversationId") ?? "");
  const text = String(form.get("body") ?? "").trim();
  const file = form.get("image");
  const imageUrl = file instanceof File ? await saveChatImage(conversationId, file) : undefined;
  return { conversationId, text, imageUrl };
}

async function saveChatImage(conversationId: string, file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error("Chat images must be under 5 MB.");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const safeConversationId = conversationId.replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const uploadDir = join(process.cwd(), "public", "uploads", "chat", safeConversationId || "general");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
  return `/uploads/chat/${safeConversationId || "general"}/${fileName}`;
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
