import { adminAuth, adminDb, adminStorage } from "@/lib/firebase-admin";
import { missingProductionEnvVars } from "@/lib/production-env";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Check = {
  label: string;
  ok: boolean;
  message: string;
};

export async function GET() {
  const checks: Check[] = [];
  const missingEnv = missingProductionEnvVars();
  checks.push({
    label: "Configuration",
    ok: missingEnv.length === 0,
    message: missingEnv.length ? `Missing ${missingEnv.join(", ")}` : "Production configuration ready"
  });

  try {
    await adminDb().collection("__health").limit(1).get();
    checks.push({ label: "Database", ok: true, message: "Database Connected" });
    checks.push({ label: "Firestore", ok: true, message: "Firestore Connected" });
  } catch (error) {
    checks.push({ label: "Database", ok: false, message: error instanceof Error ? error.message : "Database connection failed" });
    checks.push({ label: "Firestore", ok: false, message: "Firestore connection failed" });
  }

  try {
    adminAuth();
    checks.push({ label: "Authentication", ok: true, message: "Authentication Ready" });
  } catch (error) {
    checks.push({ label: "Authentication", ok: false, message: error instanceof Error ? error.message : "Authentication failed" });
  }

  try {
    adminStorage();
    checks.push({ label: "Storage", ok: true, message: "Storage Ready" });
  } catch (error) {
    checks.push({ label: "Storage", ok: false, message: error instanceof Error ? error.message : "Storage failed" });
  }

  const ok = checks.every(check => check.ok);
  return NextResponse.json({ success: ok, checks }, { status: ok ? 200 : 503 });
}
