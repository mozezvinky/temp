import { isSqlBackend, logDataMode } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { archiveLocalNotification, deleteLocalNotification, listLocalApplications, listLocalNotificationArchives, listLocalNotificationDeletes, listLocalNotifications, markLocalNotificationRead, restoreLocalNotification } from "@/lib/local-sql";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    logDataMode();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(token);
    const archivedView = request.nextUrl.searchParams.get("archived") === "true";

    if (isSqlBackend()) {
      const savedNotifications = listLocalNotifications(decoded.uid);
      const applicationAlerts = listLocalApplications(decoded.uid, "client").map(application => ({
        id: `application-alert-${application.id}`,
        userId: decoded.uid,
        title: "New application",
        body: `A worker applied for ${application.jobTitle ?? "your job"}.`,
        read: false,
        href: `/applications?application=${application.id}`,
        createdAt: application.createdAt
      }));
      const archives = listLocalNotificationArchives(decoded.uid);
      const deletes = listLocalNotificationDeletes(decoded.uid);
      return NextResponse.json({ notifications: filterArchived(mergeNotifications(savedNotifications, applicationAlerts), archives, archivedView, deletes) });
    }

    const db = adminDb();
    const [notificationSnapshot, archiveSnapshot, deleteSnapshot] = await Promise.all([
      db.collection("notifications").where("userId", "==", decoded.uid).limit(80).get(),
      db.collection("notificationArchives").where("userId", "==", decoded.uid).limit(200).get(),
      db.collection("notificationDeletes").where("userId", "==", decoded.uid).limit(200).get()
    ]);
    const notifications = notificationSnapshot.docs
      .map<Record<string, unknown>>(doc => ({ id: doc.id, ...doc.data() }))
    const archives = archiveSnapshot.docs.map(doc => ({ id: String(doc.data().notificationId ?? doc.id), archivedAt: doc.data().archivedAt }));
    const deletes = deleteSnapshot.docs.map(doc => ({ id: String(doc.data().notificationId ?? doc.id), deletedAt: doc.data().deletedAt }));
    return NextResponse.json({ notifications: filterArchived(mergeNotifications(notifications, []), archives, archivedView, deletes) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load alerts.";
    console.error("[api/notifications] load failed", error);
    if (message.includes("RESOURCE_EXHAUSTED") || message.includes("Quota exceeded")) {
      return NextResponse.json({ notifications: [], degraded: true, reason: "quota" });
    }
    return NextResponse.json({ success: false, notifications: [], message: "Unable to load alerts.", error: "Unable to load alerts." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const decoded = await adminAuth().verifyIdToken(token);
    const body = await request.json().catch(() => ({}));
    const notificationId = String(body.notificationId ?? "").trim();
    const action = String(body.action ?? "");
    if (!notificationId || !["archive", "restore", "delete", "read"].includes(action)) return NextResponse.json({ error: "Invalid alert action." }, { status: 400 });
    if (isSqlBackend()) {
      if (action === "archive") archiveLocalNotification(decoded.uid, notificationId);
      else if (action === "delete") deleteLocalNotification(decoded.uid, notificationId);
      else if (action === "read") markLocalNotificationRead(decoded.uid, notificationId);
      else restoreLocalNotification(decoded.uid, notificationId);
      return NextResponse.json({ success: true });
    }
    const archiveRef = adminDb().collection("notificationArchives").doc(`${decoded.uid}_${notificationId}`.replaceAll("/", "_"));
    const deleteRef = adminDb().collection("notificationDeletes").doc(`${decoded.uid}_${notificationId}`.replaceAll("/", "_"));
    if (action === "archive") await archiveRef.set({ userId: decoded.uid, notificationId, archivedAt: FieldValue.serverTimestamp() });
    else if (action === "delete") {
      const db = adminDb();
      const notificationSnap = await db.collection("notifications").doc(notificationId).get();
      await Promise.all([
        deleteRef.set({ userId: decoded.uid, notificationId, deletedAt: FieldValue.serverTimestamp() }),
        archiveRef.delete(),
        notificationSnap.exists && notificationSnap.data()?.userId === decoded.uid ? notificationSnap.ref.delete() : Promise.resolve()
      ]);
    }
    else if (action === "read") {
      const notificationRef = adminDb().collection("notifications").doc(notificationId);
      const notificationSnap = await notificationRef.get();
      if (notificationSnap.exists && notificationSnap.data()?.userId === decoded.uid) await notificationRef.set({ read: true }, { merge: true });
    }
    else await archiveRef.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update this alert." }, { status: 500 });
  }
}

function mergeNotifications(primary: Array<Record<string, unknown>>, derived: Array<Record<string, unknown>>) {
  const seen = new Set<string>();
  return [...primary, ...derived]
    .filter(item => {
      const key = `${item.title}-${item.body}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
}

function timestampMillis(value: unknown) {
  if (typeof value === "string") return Date.parse(value) || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value && "_seconds" in value) return Number((value as { _seconds: unknown })._seconds) * 1000;
  return typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? (value as { toMillis: () => number }).toMillis()
    : 0;
}

function filterArchived(items: Array<Record<string, unknown>>, archives: Array<{ id: string; archivedAt: unknown }>, archivedView: boolean, deletes: Array<{ id: string; deletedAt: unknown }> = []) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeArchives = new Map(archives.filter(item => timestampMillis(item.archivedAt) >= weekAgo).map(item => [item.id, item.archivedAt]));
  const deletedIds = new Set(deletes.map(item => item.id));
  return items
    .filter(item => !deletedIds.has(String(item.id)))
    .filter(item => archivedView ? activeArchives.has(String(item.id)) : !activeArchives.has(String(item.id)))
    .map(item => ({ ...item, archived: activeArchives.has(String(item.id)), archivedAt: activeArchives.get(String(item.id)) ?? null }));
}
