import { isSqlBackend } from "@/lib/data-backend";
import { adminDb } from "@/lib/firebase-admin";
import { localDb } from "@/lib/local-sql";
import { adminErrorStatus, requireAdmin } from "@/lib/admin-security";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (isSqlBackend()) {
      const count = (table: string, where = "") => Number(localDb().prepare(`SELECT COUNT(*) AS total FROM ${table} ${where}`).get()?.total ?? 0);
      return NextResponse.json({
        users: count("users"),
        activeJobs: count("jobs", "WHERE status = 'open'"),
        serviceFeePayments: count("service_fee_payments"),
        reports: 0,
        auditLogs: count("admin_audit_logs"),
        pendingVerifications: count("identity_verifications", "WHERE status = 'pending'"),
        revenue: Number(localDb().prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM service_fee_payments WHERE status = 'approved'").get()?.total ?? 0)
      });
    }
    const db = adminDb();
    const [users, activeJobs, serviceFeePayments, reports, auditLogs, pendingVerifications, fees] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("jobs").where("status", "==", "open").count().get(),
      db.collection("service_fee_payments").count().get(),
      db.collection("reports").count().get(),
      db.collection("admin_audit_logs").count().get(),
      db.collection("verifications").where("status", "==", "pending").count().get(),
      db.collection("service_fee_payments").where("status", "==", "approved").get()
    ]);
    const revenue = fees.docs.reduce((sum, item) => sum + Number(item.data().amount ?? 0), 0);
    return NextResponse.json({
      users: users.data().count,
      activeJobs: activeJobs.data().count,
      serviceFeePayments: serviceFeePayments.data().count,
      reports: reports.data().count,
      auditLogs: auditLogs.data().count,
      pendingVerifications: pendingVerifications.data().count,
      revenue
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load platform revenue." }, { status: adminErrorStatus(error) });
  }
}
