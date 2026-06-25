import { isSqlBackend } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { updateLocalProfilePhoto } from "@/lib/local-sql";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(token);
    const body = await request.json().catch(() => ({}));
    const photoURL = typeof body.photoURL === "string" ? body.photoURL.trim() : "";
    const photoPositionX = clampPosition(body.photoPositionX);
    const photoPositionY = clampPosition(body.photoPositionY);
    const photoZoom = clampZoom(body.photoZoom);
    if (!photoURL || !(/^(https?:\/\/|data:image\/)/.test(photoURL))) return NextResponse.json({ error: "A valid profile picture is required." }, { status: 400 });
    if (photoURL.startsWith("data:image/") && photoURL.length > 900_000) return NextResponse.json({ error: "Profile picture is too large after compression." }, { status: 400 });

    if (isSqlBackend()) {
      const profile = updateLocalProfilePhoto(decoded.uid, photoURL, photoPositionX, photoPositionY, photoZoom);
      if (!profile) return NextResponse.json({ error: "Account profile was not found." }, { status: 404 });
      return NextResponse.json({ success: true, profile });
    }

    const userRef = adminDb().collection("users").doc(decoded.uid);
    await userRef.set({ photoURL, photoPositionX, photoPositionY, photoZoom, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const userSnap = await userRef.get();
    return NextResponse.json({ success: true, profile: { id: userSnap.id, ...userSnap.data() } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update profile picture." }, { status: 500 });
  }
}

function clampPosition(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 50;
}

function clampZoom(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(3, Math.max(1, number)) : 1;
}
