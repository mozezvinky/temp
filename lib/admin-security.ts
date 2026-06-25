import "server-only";

import { isSqlBackend } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getLocalUser, localDb } from "@/lib/local-sql";
import type { AdminPermission, AdminRole, UserProfile } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";

const MAIN_ADMIN_EMAIL = "kelvinodiambo@gmail.com";

export const adminRolePermissions: Record<AdminRole, AdminPermission[]> = {
  super_admin: ["tickets:read", "tickets:write", "users:read", "users:write", "jobs:write", "applications:write", "kyc:write", "finance:read", "finance:adjust", "audit:read", "admins:manage", "moderation:write"],
  support_admin: ["tickets:read", "tickets:write", "users:read"],
  finance_admin: ["tickets:read", "tickets:write", "users:read", "finance:read"],
  kyc_admin: ["tickets:read", "users:read", "kyc:write"],
  moderator: ["tickets:read", "users:read", "moderation:write"]
};

export class AdminAccessError extends Error {
  constructor(message: string, public status = 403) {
    super(message);
  }
}

export type AdminActor = {
  uid: string;
  email: string;
  role: AdminRole;
  permissions: AdminPermission[];
  profile: UserProfile | Record<string, unknown>;
};

export function isMainAdmin(user: { email?: string | null } | null | undefined) {
  return user?.email?.toLowerCase() === MAIN_ADMIN_EMAIL;
}

export async function requireAdmin(request: NextRequest, permission?: AdminPermission): Promise<AdminActor> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new AdminAccessError("Admin sign in is required.", 401);
  const decoded = await adminAuth().verifyIdToken(token);
  const email = decoded.email ?? "";
  const profile: Record<string, unknown> | null = isSqlBackend()
    ? getLocalUser(decoded.uid) as unknown as Record<string, unknown> | null
    : await adminDb().collection("users").doc(decoded.uid).get().then(snapshot => snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as Record<string, unknown>) : null);
  if (!profile || profile.role !== "admin") throw new AdminAccessError("Admin access required.", 403);
  const mainAdmin = isMainAdmin({ email });
  const role = mainAdmin ? "super_admin" : normalizeAdminRole("adminRole" in profile ? profile.adminRole : undefined);
  const configured = Array.isArray("adminPermissions" in profile ? profile.adminPermissions : undefined)
    ? ("adminPermissions" in profile ? profile.adminPermissions : []) as AdminPermission[]
    : [];
  const permissions = mainAdmin
    ? adminRolePermissions.super_admin
    : Array.from(new Set([...adminRolePermissions[role], ...configured]));
  if (permission && !permissions.includes(permission)) throw new AdminAccessError("This admin role cannot perform that action.", 403);
  return { uid: decoded.uid, email, role, permissions, profile };
}

export function normalizeAdminRole(value: unknown): AdminRole {
  return value === "support_admin" || value === "finance_admin" || value === "kyc_admin" || value === "moderator" || value === "super_admin"
    ? value
    : "support_admin";
}

export function adminErrorStatus(error: unknown) {
  return error instanceof AdminAccessError ? error.status : 500;
}

export async function writeAdminAuditLog(request: NextRequest, input: {
  admin: AdminActor;
  targetUserId?: string | null;
  actionType: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason: string;
  linkedTicketId?: string | null;
}) {
  const userAgent = request.headers.get("user-agent");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
  const id = crypto.randomUUID();
  const payload = {
    id,
    adminId: input.admin.uid,
    adminEmail: input.admin.email,
    adminRole: input.admin.role,
    targetUserId: input.targetUserId ?? null,
    actionType: input.actionType,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    reason: input.reason,
    linkedTicketId: input.linkedTicketId ?? null,
    ip: ip ?? null,
    userAgent: userAgent ?? null
  };

  if (isSqlBackend()) {
    localDb().prepare(`
      INSERT INTO admin_audit_logs (id, adminId, adminEmail, adminRole, targetUserId, actionType, oldValue, newValue, reason, linkedTicketId, ip, userAgent, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.admin.uid, input.admin.email, input.admin.role, input.targetUserId ?? null, input.actionType, JSON.stringify(input.oldValue ?? null), JSON.stringify(input.newValue ?? null), input.reason, input.linkedTicketId ?? null, ip ?? null, userAgent ?? null, new Date().toISOString());
    return;
  }

  await adminDb().collection("admin_audit_logs").doc(id).set({
    ...payload,
    createdAt: FieldValue.serverTimestamp()
  });
}
