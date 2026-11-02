import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { verifyVerifiedIdToken } from "@/lib/verified-auth";
import { requireAdmin } from "@/lib/admin-security";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const user = await verifyVerifiedIdToken(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
    if (Number(request.headers.get("content-length")) > 9 * 1024 * 1024) throw new Error("File exceeds 8 MB.");
    const form = await request.formData();
    const file = form.get("file"), kind = form.get("kind");
    if (!(file instanceof File) || !["catalogue", "inspiration", "certificate"].includes(String(kind))) throw new Error("Choose a file and upload purpose.");
    if (kind === "catalogue") {
      const profile = (await adminDb().doc(`users/${user.uid}`).get()).data();
      if (profile?.role !== "worker" && !profile?.roles?.includes("worker")) throw new Error("Worker access required.");
    }
    if (file.size > 8 * 1024 * 1024 || !file.size) throw new Error("Files must be between 1 byte and 8 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const webp = bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
    const pdf = kind === "certificate" && bytes.toString("ascii",0,5) === "%PDF-";
    const mime = jpeg ? "image/jpeg" : png ? "image/png" : webp ? "image/webp" : pdf ? "application/pdf" : "";
    if (!mime || mime !== file.type) throw new Error("Upload a valid JPEG, PNG, WebP or certificate PDF.");
    const id = crypto.randomUUID(), path = `service-media/${user.uid}/${id}`;
    await adminStorage().bucket().file(path).save(bytes, { resumable: false, metadata: { contentType: mime, cacheControl: "private, no-store" } });
    await adminDb().doc(`serviceMedia/${id}`).set({ ownerId: user.uid, kind, path, mime, createdAt: new Date().toISOString() });
    return NextResponse.json({ url: `/api/service-media?id=${id}` });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 }); }
}
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return new NextResponse(null, { status: 404 });
    const snap = await adminDb().doc(`serviceMedia/${id}`).get();
    if (!snap.exists) return new NextResponse(null, { status: 404 });
    const media = snap.data()!;
    if (media.kind !== "catalogue") {
      const user = await verifyVerifiedIdToken(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
      if (media.ownerId !== user.uid) {
        if (media.kind === "certificate") await requireAdmin(request, "users:read");
        else {
          const profile = await adminDb().doc(`users/${user.uid}`).get();
          if (profile.data()?.role !== "admin") {
            if (profile.data()?.role !== "worker" && !profile.data()?.roles?.includes("worker")) throw new Error("Access denied.");
            const url = `/api/service-media?id=${id}`;
            const [jobs, applications] = await Promise.all([
              adminDb().collection("jobs").where("servicePreferences.inspirationImages", "array-contains", url).limit(20).get(),
              adminDb().collection("applications").where("serviceBooking.inspirationImages", "array-contains", url).limit(20).get()
            ]);
            if (!jobs.docs.some(doc => doc.data().status === "open" || doc.data().assignedWorkerId === user.uid) && !applications.docs.some(doc => doc.data().workerId === user.uid)) throw new Error("Access denied.");
          }
        }
      }
    }
    const [bytes] = await adminStorage().bucket().file(media.path).download();
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": media.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch { return new NextResponse(null, { status: 403 }); }
}
