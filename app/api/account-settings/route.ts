import { isSqlBackend } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getLocalUser, updateLocalAccountSettings } from "@/lib/local-sql";
import { normalizeKenyanPhone } from "@/utils/phone";
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
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phoneInput = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
    const phoneNumber = phoneInput ? normalizeKenyanPhone(phoneInput) : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (phoneInput && !phoneNumber) return NextResponse.json({ error: "Enter a valid Kenyan phone number." }, { status: 400 });
    const authUpdate: { email?: string; phoneNumber?: string | null } = { email };
    authUpdate.phoneNumber = phoneNumber ? `+${phoneNumber}` : null;
    await adminAuth().updateUser(decoded.uid, authUpdate);

    if (isSqlBackend()) {
      const existing = getLocalUser(decoded.uid);
      if (!existing) return NextResponse.json({ error: "Account profile was not found." }, { status: 404 });
      const profile = updateLocalAccountSettings(decoded.uid, { email, phoneNumber: phoneNumber || null });
      return NextResponse.json({ success: true, profile });
    }

    const userRef = adminDb().collection("users").doc(decoded.uid);
    await userRef.set({ email, phoneNumber: phoneNumber || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const userSnap = await userRef.get();
    return NextResponse.json({ success: true, profile: { id: userSnap.id, ...userSnap.data() } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update account settings." }, { status: 500 });
  }
}
