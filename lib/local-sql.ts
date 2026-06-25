import "server-only";

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Job, LocationFields, Role, ServiceFeePayment, UserProfile, WorkerSkillProfile } from "@/types";
import { calculateServiceFee } from "@/utils/money";

type SqlValue = string | number | bigint | null | Uint8Array;
type SqlStatement = {
  run: (...values: SqlValue[]) => unknown;
  get: (...values: SqlValue[]) => Record<string, unknown> | undefined;
  all: (...values: SqlValue[]) => Array<Record<string, unknown>>;
};
type SqlDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqlStatement;
  close?: () => void;
};

const dbPath = process.env.LOCAL_SQLITE_PATH ?? join(process.cwd(), "data", "temp-local.sqlite");

let database: SqlDatabase | null = null;

export function localDb() {
  if (database) return database;
  mkdirSync(dirname(dbPath), { recursive: true });
  console.log(`[local-sql] opening database connection at ${dbPath}`);
  database = new Database(dbPath) as unknown as SqlDatabase;
  database.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      email TEXT,
      displayName TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('client','worker','admin')),
      roles TEXT NOT NULL DEFAULT '[]',
      phoneNumber TEXT,
      photoURL TEXT,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      verificationStatus TEXT NOT NULL DEFAULT 'not_submitted',
      profileCompleted INTEGER NOT NULL DEFAULT 0,
      skills TEXT NOT NULL DEFAULT '[]',
      skillProfiles TEXT NOT NULL DEFAULT '[]',
      certificates TEXT NOT NULL DEFAULT '[]',
      workHistory TEXT NOT NULL DEFAULT '[]',
      ratingAverage REAL NOT NULL DEFAULT 0,
      ratingCount INTEGER NOT NULL DEFAULT 0,
      completedJobs INTEGER NOT NULL DEFAULT 0,
      isLocked INTEGER NOT NULL DEFAULT 0,
      outstandingServiceFee REAL NOT NULL DEFAULT 0,
      badges TEXT NOT NULL DEFAULT '[]',
      location TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      clientName TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      county TEXT NOT NULL,
      locationDetails TEXT NOT NULL,
      payAmount REAL NOT NULL,
      payType TEXT NOT NULL,
      duration TEXT NOT NULL,
      durationHours REAL NOT NULL,
      durationValue REAL,
      durationUnit TEXT,
      totalPeriods INTEGER NOT NULL DEFAULT 1,
      completedPeriods INTEGER NOT NULL DEFAULT 0,
      recurrenceStatus TEXT,
      rehireOfJobId TEXT,
      rehireWorkerId TEXT,
      rehireStartDate TEXT,
      nextPaymentDate TEXT,
      cancelledAfterPeriods INTEGER,
      workersNeeded INTEGER NOT NULL DEFAULT 1,
      quantity REAL,
      unit TEXT,
      customUnit TEXT,
      paymentMethod TEXT NOT NULL DEFAULT 'mpesa',
      requiredSkills TEXT NOT NULL,
      applicants TEXT NOT NULL DEFAULT '[]',
      assignedWorkerId TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      rateType TEXT,
      rateAmount REAL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      role TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      relatedId TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      jobId TEXT NOT NULL,
      workerId TEXT NOT NULL,
      clientId TEXT NOT NULL,
      jobTitle TEXT,
      coverNote TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'application',
      requestLocation TEXT,
      requestStartDate TEXT,
      requestDuration TEXT,
      requestDescription TEXT,
      clientRating INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS worker_cancellation_days (
      workerId TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY(workerId, day)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      href TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notification_archives (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      archivedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notification_deletes (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      deletedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ratings (
      id TEXT PRIMARY KEY,
      jobId TEXT NOT NULL,
      fromUserId TEXT NOT NULL,
      toUserId TEXT NOT NULL,
      stars INTEGER NOT NULL,
      review TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      userName TEXT NOT NULL,
      userEmail TEXT,
      userPhone TEXT,
      userRole TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      assignedAdminId TEXT,
      relatedJobId TEXT,
      relatedApplicationId TEXT,
      relatedPaymentId TEXT,
      lastMessage TEXT,
      unreadForUser INTEGER NOT NULL DEFAULT 0,
      unreadForAdmin INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id TEXT PRIMARY KEY,
      ticketId TEXT NOT NULL,
      senderId TEXT NOT NULL,
      senderRole TEXT NOT NULL,
      body TEXT NOT NULL,
      attachments TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_internal_notes (
      id TEXT PRIMARY KEY,
      ticketId TEXT NOT NULL,
      adminId TEXT NOT NULL,
      body TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      adminId TEXT NOT NULL,
      adminEmail TEXT,
      adminRole TEXT,
      targetUserId TEXT,
      actionType TEXT NOT NULL,
      oldValue TEXT,
      newValue TEXT,
      reason TEXT NOT NULL,
      linkedTicketId TEXT,
      ip TEXT,
      userAgent TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS service_fee_payments (
      id TEXT PRIMARY KEY,
      workerId TEXT NOT NULL,
      username TEXT NOT NULL,
      transactionCode TEXT NOT NULL,
      screenshotUrl TEXT,
      status TEXT NOT NULL DEFAULT 'payment_pending_verification',
      amount REAL NOT NULL DEFAULT 100,
      jobId TEXT,
      applicationId TEXT,
      rejectionReason TEXT,
      matchedMpesaRecordId TEXT,
      submittedAt TEXT NOT NULL,
      reviewedAt TEXT,
      reviewedBy TEXT
    );
    CREATE TABLE IF NOT EXISTS mpesa_payment_records (
      id TEXT PRIMARY KEY,
      accountNumber TEXT NOT NULL,
      transactionCode TEXT NOT NULL,
      amount REAL NOT NULL,
      paymentDate TEXT NOT NULL,
      rawPayload TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      success INTEGER NOT NULL,
      ip TEXT,
      userAgent TEXT,
      reason TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      adminId TEXT NOT NULL,
      ip TEXT,
      userAgent TEXT,
      revoked INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      lastSeenAt TEXT,
      expiresAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS identity_verifications (
      userId TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      fullName TEXT NOT NULL,
      email TEXT NOT NULL,
      phoneNumber TEXT NOT NULL,
      username TEXT NOT NULL,
      nationalIdHash TEXT NOT NULL,
      idFrontUrl TEXT NOT NULL,
      idBackUrl TEXT NOT NULL,
      selfieWithIdUrl TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      rejectionReason TEXT,
      reviewedBy TEXT,
      submittedAt TEXT NOT NULL,
      reviewedAt TEXT,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      jobId TEXT NOT NULL,
      clientId TEXT NOT NULL,
      workerId TEXT NOT NULL,
      participants TEXT NOT NULL,
      locked INTEGER NOT NULL DEFAULT 0,
      lastMessage TEXT,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      senderId TEXT NOT NULL,
      body TEXT NOT NULL,
      readBy TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, createdAt);
    CREATE INDEX IF NOT EXISTS idx_jobs_client_created ON jobs(clientId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_applications_worker_created ON applications(workerId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_applications_client_created ON applications(clientId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(userId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, updatedAt);
    CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticketId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(createdAt);
    CREATE INDEX IF NOT EXISTS idx_identity_verifications_status ON identity_verifications(status, submittedAt);
    CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(clientId, updatedAt);
    CREATE INDEX IF NOT EXISTS idx_conversations_worker ON conversations(workerId, updatedAt);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversationId, createdAt);
  `);
  ensureColumn("jobs", "workersNeeded", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("jobs", "quantity", "REAL");
  ensureColumn("jobs", "unit", "TEXT");
  ensureColumn("jobs", "customUnit", "TEXT");
  ensureColumn("jobs", "paymentMethod", "TEXT NOT NULL DEFAULT 'mpesa'");
  ensureColumn("jobs", "durationValue", "REAL");
  ensureColumn("jobs", "durationUnit", "TEXT");
  ensureColumn("jobs", "totalPeriods", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("jobs", "completedPeriods", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("jobs", "recurrenceStatus", "TEXT");
  ensureColumn("jobs", "rehireOfJobId", "TEXT");
  ensureColumn("jobs", "rehireWorkerId", "TEXT");
  ensureColumn("jobs", "rehireStartDate", "TEXT");
  ensureColumn("jobs", "nextPaymentDate", "TEXT");
  ensureColumn("jobs", "cancelledAfterPeriods", "INTEGER");
  ensureColumn("applications", "clientRating", "INTEGER");
  ensureColumn("applications", "source", "TEXT NOT NULL DEFAULT 'application'");
  ensureColumn("applications", "requestLocation", "TEXT");
  ensureColumn("applications", "requestStartDate", "TEXT");
  ensureColumn("applications", "requestDuration", "TEXT");
  ensureColumn("applications", "requestDescription", "TEXT");
  ensureColumn("users", "skillProfiles", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("users", "roles", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("users", "photoURL", "TEXT");
  ensureColumn("users", "photoPositionX", "REAL NOT NULL DEFAULT 50");
  ensureColumn("users", "photoPositionY", "REAL NOT NULL DEFAULT 50");
  ensureColumn("users", "photoZoom", "REAL NOT NULL DEFAULT 1");
  ensureColumn("users", "bio", "TEXT");
  ensureColumn("users", "companyName", "TEXT");
  ensureColumn("users", "availability", "TEXT");
  ensureColumn("users", "lockReason", "TEXT");
  ensureColumn("users", "adminRole", "TEXT");
  ensureColumn("users", "adminPermissions", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("admin_sessions", "ip", "TEXT");
  ensureColumn("admin_sessions", "userAgent", "TEXT");
  ensureColumn("admin_sessions", "lastSeenAt", "TEXT");
  return database;
}

function ensureColumn(table: string, column: string, definition: string) {
  const exists = localDb().prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column);
  if (!exists) localDb().exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function nowIso() {
  return new Date().toISOString();
}

function jsonString(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function rowToUser(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.uid),
    uid: String(row.uid),
    role: row.role as Role,
    roles: parseJson<Role[]>(row.roles, [row.role as Role]),
    adminRole: typeof row.adminRole === "string" ? row.adminRole as UserProfile["adminRole"] : undefined,
    adminPermissions: parseJson<UserProfile["adminPermissions"]>(row.adminPermissions, []),
    displayName: String(row.displayName ?? "Copic user"),
    email: typeof row.email === "string" ? row.email : undefined,
    emailVerified: Number(row.emailVerified ?? 0) === 1,
    emailVerifiedAt: null,
    phoneNumber: typeof row.phoneNumber === "string" ? row.phoneNumber : undefined,
    photoURL: typeof row.photoURL === "string" ? row.photoURL : undefined,
    photoPositionX: Number(row.photoPositionX ?? 50),
    photoPositionY: Number(row.photoPositionY ?? 50),
    photoZoom: Number(row.photoZoom ?? 1),
    bio: typeof row.bio === "string" ? row.bio : undefined,
    companyName: typeof row.companyName === "string" ? row.companyName : undefined,
    availability: typeof row.availability === "string" ? row.availability : undefined,
    location: parseJson<LocationFields | undefined>(row.location, undefined),
    skills: parseJson<string[]>(row.skills, []),
    skillProfiles: parseJson<WorkerSkillProfile[]>(row.skillProfiles, []),
    certificates: parseJson<string[]>(row.certificates, []),
    workHistory: parseJson<string[]>(row.workHistory, []),
    ratingAverage: Number(row.ratingAverage ?? 0),
    ratingCount: Number(row.ratingCount ?? 0),
    completedJobs: Number(row.completedJobs ?? 0),
    verificationStatus: String(row.verificationStatus ?? "not_submitted") as UserProfile["verificationStatus"],
    profileCompleted: Number(row.profileCompleted ?? 0) === 1,
    isLocked: Number(row.isLocked ?? 0) === 1,
    lockReason: typeof row.lockReason === "string" ? row.lockReason : undefined,
    outstandingServiceFee: Number(row.outstandingServiceFee ?? 0),
    badges: parseJson<string[]>(row.badges, []),
    createdAt: null,
    updatedAt: null as unknown as UserProfile["updatedAt"]
  };
}

function rowToJob(row: Record<string, unknown>): Job {
  const durationValue = Number(row.durationValue ?? row.durationHours ?? 0);
  const durationUnit = String(row.durationUnit ?? "hours") as Job["durationUnit"];
  const storedTotalPeriods = Number(row.totalPeriods ?? 1);
  const rehireTotalPeriods = typeof row.rehireOfJobId === "string" && durationUnit === "months" && Number.isFinite(durationValue) && durationValue > 0
    ? durationValue
    : storedTotalPeriods;
  const totalPeriods = Math.max(1, Number.isFinite(rehireTotalPeriods) ? rehireTotalPeriods : 1);
  const completedPeriods = Math.min(totalPeriods, Math.max(0, Number(row.completedPeriods ?? 0)));
  return {
    id: String(row.id),
    clientId: String(row.clientId),
    clientName: String(row.clientName),
    createdBy: String(row.createdBy),
    title: String(row.title),
    description: String(row.description),
    category: String(row.category),
    location: String(row.location),
    county: String(row.county),
    locationDetails: parseJson<LocationFields | undefined>(row.locationDetails, undefined),
    payAmount: Number(row.payAmount ?? 0),
    payType: String(row.payType) as Job["payType"],
    duration: String(row.duration),
    durationHours: Number(row.durationHours ?? 0),
    durationValue,
    durationUnit,
    totalPeriods,
    completedPeriods,
    recurrenceStatus: typeof row.recurrenceStatus === "string" ? row.recurrenceStatus as Job["recurrenceStatus"] : undefined,
    rehireOfJobId: typeof row.rehireOfJobId === "string" ? row.rehireOfJobId : undefined,
    rehireWorkerId: typeof row.rehireWorkerId === "string" ? row.rehireWorkerId : undefined,
    rehireStartDate: typeof row.rehireStartDate === "string" ? row.rehireStartDate : undefined,
    nextPaymentDate: typeof row.nextPaymentDate === "string" ? row.nextPaymentDate : undefined,
    cancelledAfterPeriods: row.cancelledAfterPeriods == null ? undefined : Number(row.cancelledAfterPeriods),
    workersNeeded: Number(row.workersNeeded ?? 1),
    acceptedCount: Number(row.acceptedCount ?? 0),
    quantity: row.quantity == null ? null : Number(row.quantity),
    unit: typeof row.unit === "string" ? row.unit : null,
    customUnit: typeof row.customUnit === "string" ? row.customUnit : null,
    paymentMethod: String(row.paymentMethod ?? "mpesa") as Job["paymentMethod"],
    requiredSkills: parseJson<string[]>(row.requiredSkills, []),
    applicants: parseJson<string[]>(row.applicants, []),
    assignedWorkerId: typeof row.assignedWorkerId === "string" ? row.assignedWorkerId : null,
    status: String(row.status ?? "open") as Job["status"],
    rateType: row.rateType as Job["rateType"],
    rateAmount: Number(row.rateAmount ?? row.payAmount ?? 0),
    createdAt: null,
    updatedAt: null as unknown as Job["updatedAt"]
  };
}

export function getLocalUser(uid: string) {
  const row = localDb().prepare("SELECT * FROM users WHERE uid = ?").get(uid);
  return row ? rowToUser(row) : null;
}

export function getLocalUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const row = localDb().prepare("SELECT * FROM users WHERE lower(email) = ? LIMIT 1").get(normalized);
  return row ? rowToUser(row) : null;
}

export function linkLocalUserUidByEmail(email: string, uid: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !uid.trim()) return null;
  const existing = getLocalUserByEmail(normalized);
  if (!existing || existing.uid) return existing;
  localDb().prepare("UPDATE users SET uid = ?, updatedAt = ? WHERE lower(email) = ? AND (uid IS NULL OR uid = '')").run(uid, nowIso(), normalized);
  return getLocalUser(uid) ?? getLocalUserByEmail(normalized);
}

export function upsertLocalUser(input: {
  uid: string;
  email?: string | null;
  displayName: string;
  role: Role;
  phoneNumber?: string | null;
  emailVerified?: boolean;
}) {
  const existing = getLocalUser(input.uid);
  const createdAt = existing ? new Date().toISOString() : nowIso();
  const existingRoles = existing?.roles?.length ? existing.roles : existing ? [existing.role] : [];
  const roles = Array.from(new Set([...existingRoles, input.role]));
  localDb().prepare(`
    INSERT INTO users (uid, email, displayName, role, roles, phoneNumber, emailVerified, badges, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uid) DO UPDATE SET
      email = excluded.email,
      displayName = COALESCE(users.displayName, excluded.displayName),
      role = excluded.role,
      roles = excluded.roles,
      phoneNumber = COALESCE(excluded.phoneNumber, users.phoneNumber),
      emailVerified = CASE WHEN users.emailVerified = 1 THEN 1 ELSE excluded.emailVerified END,
      badges = CASE WHEN users.badges = '[]' AND excluded.role = 'worker' THEN excluded.badges ELSE users.badges END,
      updatedAt = excluded.updatedAt
  `).run(
    input.uid,
    input.email ?? null,
    input.displayName,
    input.role,
    jsonString(roles),
    input.phoneNumber ?? null,
    input.emailVerified ? 1 : 0,
    jsonString(input.role === "worker" ? ["Trial Worker"] : []),
    createdAt,
    nowIso()
  );
  return getLocalUser(input.uid);
}

export function markLocalEmailVerified(uid: string) {
  localDb().prepare("UPDATE users SET emailVerified = 1, updatedAt = ? WHERE uid = ?").run(nowIso(), uid);
}

export function createLocalJob(input: {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  description: string;
  category: string;
  location: string;
  county: string;
  locationDetails: LocationFields;
  payAmount: number;
  payType: Job["payType"];
  duration: string;
  durationValue: number;
  durationUnit: Job["durationUnit"];
  durationHours: number;
  workersNeeded?: number;
  quantity?: number;
  unit?: string;
  customUnit?: string;
  paymentMethod?: Job["paymentMethod"];
  requiredSkills: string[];
}) {
  const createdAt = nowIso();
  const rateType = input.payType;
  localDb().prepare(`
    INSERT INTO jobs (
      id, clientId, clientName, createdBy, title, description, category, location, county, locationDetails,
      payAmount, payType, duration, durationHours, durationValue, durationUnit, workersNeeded, quantity, unit, customUnit, paymentMethod, requiredSkills, applicants, assignedWorkerId, status,
      rateType, rateAmount, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL, 'open', ?, ?, ?, ?)
  `).run(
    input.id,
    input.clientId,
    input.clientName,
    input.clientId,
    input.title,
    input.description,
    input.category,
    input.location,
    input.county,
    jsonString(input.locationDetails),
    input.payAmount,
    input.payType,
    input.duration,
    input.durationHours,
    input.durationValue,
    input.durationUnit ?? "hours",
    input.workersNeeded ?? 1,
    input.quantity ?? null,
    input.unit ?? null,
    input.customUnit ?? null,
    input.paymentMethod ?? "mpesa",
    jsonString(input.requiredSkills),
    rateType,
    input.payAmount,
    createdAt,
    createdAt
  );
  localDb().prepare(`
    INSERT INTO activities (id, userId, role, type, title, description, relatedId, read, createdAt)
    VALUES (?, ?, 'client', 'job_posted', 'Job posted', ?, ?, 0, ?)
  `).run(`activity-${input.id}`, input.clientId, `${input.title} is open for applications.`, input.id, createdAt);
  return getLocalJob(input.id);
}

export function getLocalJob(id: string) {
  const row = localDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  return row ? rowToJob(row) : null;
}

export function listLocalOpenJobs() {
  return localDb().prepare(`
    SELECT jobs.*, COUNT(applications.id) as acceptedCount
    FROM jobs
    LEFT JOIN applications ON applications.jobId = jobs.id AND applications.status IN ('accepted', 'completion_requested', 'payment_sent')
    WHERE jobs.status = 'open'
    GROUP BY jobs.id
    ORDER BY jobs.createdAt DESC
    LIMIT 80
  `).all().map(rowToJob);
}

export function listLocalClientJobs(clientId: string) {
  return localDb().prepare(`
    SELECT jobs.*, COUNT(applications.id) as acceptedCount
    FROM jobs
    LEFT JOIN applications ON applications.jobId = jobs.id AND applications.status IN ('accepted', 'completion_requested', 'payment_sent')
    WHERE jobs.clientId = ?
    GROUP BY jobs.id
    ORDER BY jobs.createdAt DESC
    LIMIT 80
  `).all(clientId).map(rowToJob);
}

export function updateLocalJob(id: string, clientId: string, patch: Partial<Pick<Job, "title" | "description" | "category" | "payAmount" | "payType" | "duration" | "durationValue" | "durationUnit" | "durationHours" | "workersNeeded" | "quantity" | "unit" | "customUnit" | "paymentMethod" | "status">>) {
  const existing = getLocalJob(id);
  if (!existing || existing.clientId !== clientId) return null;
  const next = {
    title: patch.title ?? existing.title,
    description: patch.description ?? existing.description,
    category: patch.category ?? existing.category,
    payAmount: patch.payAmount ?? existing.payAmount,
    payType: patch.payType ?? existing.payType,
    duration: patch.duration ?? existing.duration,
    durationValue: patch.durationValue ?? existing.durationValue ?? existing.durationHours ?? 0,
    durationUnit: patch.durationUnit ?? existing.durationUnit ?? "hours",
    durationHours: patch.durationHours ?? existing.durationHours ?? 0,
    workersNeeded: patch.workersNeeded ?? existing.workersNeeded ?? 1,
    quantity: patch.quantity ?? existing.quantity ?? null,
    unit: patch.unit ?? existing.unit ?? null,
    customUnit: patch.customUnit ?? existing.customUnit ?? null,
    paymentMethod: patch.paymentMethod ?? existing.paymentMethod ?? "mpesa",
    status: patch.status ?? existing.status
  };
  localDb().prepare(`
    UPDATE jobs
    SET title = ?, description = ?, category = ?, payAmount = ?, payType = ?, duration = ?, durationHours = ?, durationValue = ?, durationUnit = ?, workersNeeded = ?, quantity = ?, unit = ?, customUnit = ?, paymentMethod = ?, status = ?, rateAmount = ?, updatedAt = ?
    WHERE id = ? AND clientId = ?
  `).run(
    next.title,
    next.description,
    next.category,
    next.payAmount,
    next.payType,
    next.duration,
    next.durationHours,
    next.durationValue,
    next.durationUnit,
    next.workersNeeded,
    next.quantity,
    next.unit,
    next.customUnit,
    next.paymentMethod,
    next.status,
    next.payAmount,
    nowIso(),
    id,
    clientId
  );
  return getLocalJob(id);
}

export function deleteLocalJob(id: string, clientId: string) {
  localDb().prepare("DELETE FROM activities WHERE relatedId = ? AND userId = ?").run(id, clientId);
  localDb().prepare("DELETE FROM jobs WHERE id = ? AND clientId = ?").run(id, clientId);
  return true;
}

function rowToApplication(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    jobId: String(row.jobId),
    workerId: String(row.workerId),
    clientId: String(row.clientId),
    jobTitle: typeof row.jobTitle === "string" ? row.jobTitle : undefined,
    jobCategory: typeof row.jobCategory === "string" ? row.jobCategory : undefined,
    jobStatus: typeof row.jobStatus === "string" ? row.jobStatus : undefined,
    jobAmount: row.jobAmount == null ? undefined : Number(row.jobAmount),
    workerName: typeof row.workerName === "string" ? row.workerName : undefined,
    workerEmail: typeof row.workerEmail === "string" ? row.workerEmail : undefined,
    workerPhoneNumber: typeof row.workerPhoneNumber === "string" ? row.workerPhoneNumber : undefined,
    workerSkills: parseJson<string[]>(row.workerSkills, []),
    workerCompletedJobs: Number(row.workerCompletedJobs ?? 0),
    workerRatingAverage: Number(row.workerRatingAverage ?? 0),
    workerRatingCount: Number(row.workerRatingCount ?? 0),
    workerVerificationStatus: String(row.workerVerificationStatus ?? "not_submitted") as UserProfile["verificationStatus"],
    clientName: typeof row.clientName === "string" ? row.clientName : undefined,
    clientRatingAverage: Number(row.clientRatingAverage ?? 0),
    clientRatingCount: Number(row.clientRatingCount ?? 0),
    clientRating: row.clientRating == null ? undefined : Number(row.clientRating),
    source: String(row.source ?? "application") as "application" | "direct_hire",
    requestTitle: typeof row.jobTitle === "string" ? row.jobTitle : undefined,
    requestLocation: typeof row.requestLocation === "string" ? row.requestLocation : undefined,
    requestStartDate: typeof row.requestStartDate === "string" ? row.requestStartDate : undefined,
    requestDuration: typeof row.requestDuration === "string" ? row.requestDuration : undefined,
    requestDescription: typeof row.requestDescription === "string" ? row.requestDescription : undefined,
    coverNote: String(row.coverNote ?? ""),
    status: String(row.status ?? "pending"),
    createdAt: null,
    updatedAt: null
  };
}

function rowToServiceFeePayment(row: Record<string, unknown>): ServiceFeePayment {
  return {
    id: String(row.id),
    workerId: String(row.workerId),
    workerName: typeof row.workerName === "string" ? row.workerName : undefined,
    username: String(row.username),
    transactionCode: String(row.transactionCode),
    screenshotUrl: typeof row.screenshotUrl === "string" ? row.screenshotUrl : null,
    status: String(row.status) as ServiceFeePayment["status"],
    amount: Number(row.amount ?? 100),
    jobId: typeof row.jobId === "string" ? row.jobId : undefined,
    applicationId: typeof row.applicationId === "string" ? row.applicationId : undefined,
    rejectionReason: typeof row.rejectionReason === "string" ? row.rejectionReason : null,
    matchedMpesaRecordId: typeof row.matchedMpesaRecordId === "string" ? row.matchedMpesaRecordId : null,
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: typeof row.reviewedBy === "string" ? row.reviewedBy : null
  };
}

export function createLocalApplication(input: {
  id: string;
  jobId: string;
  workerId: string;
  clientId: string;
  jobTitle: string;
  coverNote?: string;
}) {
  const existing = localDb().prepare("SELECT * FROM applications WHERE jobId = ? AND workerId = ? LIMIT 1").get(input.jobId, input.workerId);
  if (existing) return rowToApplication(existing);
  const createdAt = nowIso();
  localDb().prepare(`
    INSERT INTO applications (id, jobId, workerId, clientId, jobTitle, coverNote, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(input.id, input.jobId, input.workerId, input.clientId, input.jobTitle, input.coverNote ?? "", createdAt, createdAt);
  localDb().prepare(`
    INSERT INTO activities (id, userId, role, type, title, description, relatedId, read, createdAt)
    VALUES (?, ?, 'worker', 'application_submitted', 'Application sent', ?, ?, 0, ?)
  `).run(`activity-${input.id}`, input.workerId, `You applied for ${input.jobTitle}.`, input.id, createdAt);
  localDb().prepare(`
    INSERT INTO activities (id, userId, role, type, title, description, relatedId, read, createdAt)
    VALUES (?, ?, 'client', 'application_received', 'New application', ?, ?, 0, ?)
  `).run(`activity-client-${input.id}`, input.clientId, `A worker applied for ${input.jobTitle}.`, input.id, createdAt);
  localDb().prepare(`
    INSERT INTO notifications (id, userId, title, body, read, href, createdAt)
    VALUES (?, ?, 'New application', ?, 0, ?, ?)
  `).run(`notification-${input.id}`, input.clientId, `A worker applied for ${input.jobTitle}.`, `/applications?application=${input.id}`, createdAt);
  const created = localDb().prepare("SELECT * FROM applications WHERE id = ?").get(input.id);
  return created ? rowToApplication(created) : null;
}

export function createLocalDirectHireRequest(input: {
  id: string;
  jobId: string;
  clientId: string;
  clientName: string;
  workerId: string;
  title: string;
  category: string;
  payAmount: number;
  location: string;
  startDate: string;
  duration: string;
  description?: string;
}) {
  if (input.workerId === input.clientId) throw new Error("You cannot hire yourself.");
  const worker = getLocalUser(input.workerId);
  if (!worker || worker.role !== "worker") throw new Error("Choose a valid worker.");
  if (worker.isLocked) throw new Error("This worker is not available for new jobs.");
  if (countLocalActiveAcceptedApplications(input.workerId) > 0) throw new Error("This worker is occupied on another job right now.");
  const createdAt = nowIso();
  localDb().exec("BEGIN IMMEDIATE");
  try {
    localDb().prepare(`
      INSERT INTO jobs (
        id, clientId, clientName, createdBy, title, description, category, location, county, locationDetails,
        payAmount, payType, duration, durationHours, durationValue, durationUnit, workersNeeded, quantity, unit, customUnit, paymentMethod, requiredSkills, applicants, assignedWorkerId, status,
        rateType, rateAmount, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '{}', ?, 'fixed', ?, 0, 1, 'days', 1, NULL, NULL, NULL, 'mpesa', '[]', '[]', NULL, 'pending', 'fixed', ?, ?, ?)
    `).run(
      input.jobId,
      input.clientId,
      input.clientName,
      input.clientId,
      input.title,
      input.description ?? "",
      input.category,
      input.location,
      input.payAmount,
      input.duration,
      input.payAmount,
      createdAt,
      createdAt
    );
    localDb().prepare(`
      INSERT INTO applications (id, jobId, workerId, clientId, jobTitle, coverNote, status, source, requestLocation, requestStartDate, requestDuration, requestDescription, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', 'direct_hire', ?, ?, ?, ?, ?, ?)
    `).run(input.id, input.jobId, input.workerId, input.clientId, input.title, "Direct hire request", input.location, input.startDate, input.duration, input.description ?? "", createdAt, createdAt);
    localDb().prepare(`
      INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
      VALUES (?, ?, 'Direct hire request', ?, 0, '/dashboard', ?)
    `).run(`notification-direct-hire-${input.id}`, input.workerId, `${input.clientName} sent you a direct hire request for ${input.title}.`, createdAt);
    localDb().exec("COMMIT");
  } catch (error) {
    localDb().exec("ROLLBACK");
    throw error;
  }
  const created = localDb().prepare(`
    SELECT applications.*, jobs.category as jobCategory, jobs.status as jobStatus, jobs.payAmount as jobAmount
    FROM applications
    LEFT JOIN jobs ON jobs.id = applications.jobId
    WHERE applications.id = ?
  `).get(input.id);
  return created ? rowToApplication(created) : null;
}

export function respondLocalDirectHireRequest(applicationId: string, workerId: string, response: "accept" | "reject") {
  const row = localDb().prepare("SELECT * FROM applications WHERE id = ? AND workerId = ?").get(applicationId, workerId);
  if (!row) return null;
  const application = rowToApplication(row);
  if (application.source !== "direct_hire") throw new Error("This is not a direct hire request.");
  if (application.status !== "pending") throw new Error("This request has already been answered.");
  const now = nowIso();
  if (response === "reject") {
    localDb().prepare("UPDATE applications SET status = 'rejected', updatedAt = ? WHERE id = ?").run(now, applicationId);
    localDb().prepare("UPDATE jobs SET status = 'cancelled', updatedAt = ? WHERE id = ?").run(now, application.jobId);
    localDb().prepare(`
      INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
      VALUES (?, ?, 'Direct hire rejected', ?, 0, '/workers', ?)
    `).run(`notification-direct-hire-rejected-${applicationId}`, application.clientId, `${application.workerName ?? "The worker"} rejected your direct hire request for ${application.jobTitle ?? "the job"}.`, now);
  } else {
    localDb().exec("BEGIN IMMEDIATE");
    try {
      localDb().prepare("UPDATE applications SET status = 'accepted', updatedAt = ? WHERE id = ?").run(now, applicationId);
      localDb().prepare("UPDATE jobs SET status = 'live', assignedWorkerId = ?, updatedAt = ? WHERE id = ?").run(workerId, now, application.jobId);
      upsertLocalConversation(application.jobId, application.clientId, workerId);
      localDb().prepare(`
        INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
        VALUES (?, ?, 'Direct hire accepted', ?, 0, '/find-work', ?)
      `).run(`notification-direct-hire-accepted-${applicationId}`, application.clientId, `${application.workerName ?? "The worker"} accepted your direct hire request for ${application.jobTitle ?? "the job"}.`, now);
      localDb().exec("COMMIT");
    } catch (error) {
      localDb().exec("ROLLBACK");
      throw error;
    }
  }
  const updated = localDb().prepare(`
    SELECT applications.*, jobs.category as jobCategory, jobs.status as jobStatus, jobs.payAmount as jobAmount
    FROM applications
    LEFT JOIN jobs ON jobs.id = applications.jobId
    WHERE applications.id = ?
  `).get(applicationId);
  return updated ? rowToApplication(updated) : null;
}

export function countLocalWorkerApplications(workerId: string) {
  const row = localDb().prepare("SELECT COUNT(*) as count FROM applications WHERE workerId = ?").get(workerId);
  return Number(row?.count ?? 0);
}

export function countLocalAcceptedApplications(jobId: string) {
  const row = localDb().prepare("SELECT COUNT(*) as count FROM applications WHERE jobId = ? AND status IN ('accepted', 'completion_requested', 'payment_sent')").get(jobId);
  return Number(row?.count ?? 0);
}

export function acceptLocalApplication(applicationId: string, clientId: string) {
  const row = localDb().prepare("SELECT * FROM applications WHERE id = ? AND clientId = ?").get(applicationId, clientId);
  if (!row) return null;
  const application = rowToApplication(row);
  const job = getLocalJob(application.jobId);
  if (!job || job.clientId !== clientId) return null;
  const acceptedBefore = countLocalAcceptedApplications(job.id);
  if (application.status !== "accepted" && acceptedBefore >= (job.workersNeeded ?? 1)) {
    throw new Error("This job already has enough accepted workers.");
  }
  if (application.status !== "accepted") {
    const now = nowIso();
    localDb().prepare("UPDATE applications SET status = 'accepted', updatedAt = ? WHERE id = ?").run(now, applicationId);
  }
  upsertLocalConversation(job.id, clientId, application.workerId);
  const acceptedCount = countLocalAcceptedApplications(job.id);
  if (acceptedCount >= (job.workersNeeded ?? 1)) {
    const now = nowIso();
    localDb().prepare("UPDATE jobs SET status = 'live', assignedWorkerId = COALESCE(assignedWorkerId, ?), updatedAt = ? WHERE id = ?").run(application.workerId, now, job.id);
    if ((job.workersNeeded ?? 1) <= 1) {
      const rejectedRows = localDb().prepare("SELECT id, workerId FROM applications WHERE jobId = ? AND id != ? AND status = 'pending'").all(job.id, applicationId);
      localDb().prepare("UPDATE applications SET status = 'rejected', updatedAt = ? WHERE jobId = ? AND id != ? AND status = 'pending'").run(now, job.id, applicationId);
      rejectedRows.forEach(row => {
        if (typeof row.workerId === "string" && typeof row.id === "string") {
          localDb().prepare(`
            INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
            VALUES (?, ?, 'Application rejected', ?, 0, '/applications', ?)
          `).run(`notification-rejected-${row.id}`, row.workerId, `${application.jobTitle ?? "This job"} has already been filled.`, now);
        }
      });
    }
  }
  localDb().prepare(`
    INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
    VALUES (?, ?, 'Application accepted', ?, 0, '/applications', ?)
  `).run(`notification-accepted-${applicationId}`, application.workerId, `Your application for ${application.jobTitle ?? "a job"} was accepted.`, nowIso());
  const updated = localDb().prepare("SELECT * FROM applications WHERE id = ?").get(applicationId);
  return updated ? rowToApplication(updated) : application;
}

export function cancelLocalLiveApplication(applicationId: string, workerId: string) {
  const row = localDb().prepare("SELECT * FROM applications WHERE id = ? AND workerId = ?").get(applicationId, workerId);
  if (!row) return null;
  const application = rowToApplication(row);
  if (!["accepted", "completion_requested", "payment_sent"].includes(application.status)) {
    throw new Error("Only live jobs can be cancelled with the no-pay warning.");
  }
  const job = getLocalJob(application.jobId);
  const now = nowIso();
  localDb().exec("BEGIN IMMEDIATE");
  try {
    localDb().prepare("UPDATE applications SET status = 'cancelled', updatedAt = ? WHERE id = ? AND workerId = ?").run(now, applicationId, workerId);
    localDb().prepare("UPDATE jobs SET status = 'cancelled', updatedAt = ? WHERE id = ?").run(now, application.jobId);
    localDb().prepare("UPDATE conversations SET locked = 1, updatedAt = ? WHERE jobId = ? AND workerId = ?").run(now, application.jobId, workerId);
    localDb().prepare(`
      INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
      VALUES (?, ?, 'Live job cancelled', ?, 0, ?, ?)
    `).run(`notification-live-cancelled-${applicationId}`, application.clientId, `${application.workerName ?? "A worker"} cancelled ${application.jobTitle ?? "your live job"} with no pay due.`, `/applications?application=${applicationId}`, now);
    localDb().prepare(`
      INSERT OR REPLACE INTO activities (id, userId, role, type, title, description, relatedId, read, createdAt)
      VALUES (?, ?, 'worker', 'live_job_cancelled', 'Live job cancelled', ?, ?, 0, ?)
    `).run(`activity-live-cancelled-worker-${applicationId}`, workerId, `${application.jobTitle ?? "Live job"} was cancelled with no pay.`, applicationId, now);
    localDb().prepare(`
      INSERT OR REPLACE INTO activities (id, userId, role, type, title, description, relatedId, read, createdAt)
      VALUES (?, ?, 'client', 'live_job_cancelled', 'Live job cancelled', ?, ?, 0, ?)
    `).run(`activity-live-cancelled-client-${applicationId}`, application.clientId, `${application.workerName ?? "A worker"} cancelled ${job?.title ?? application.jobTitle ?? "your live job"}.`, applicationId, now);
    localDb().exec("COMMIT");
  } catch (error) {
    localDb().exec("ROLLBACK");
    throw error;
  }
  const updated = localDb().prepare(`
    SELECT applications.*, jobs.category as jobCategory, jobs.status as jobStatus, jobs.payAmount as jobAmount
    FROM applications
    LEFT JOIN jobs ON jobs.id = applications.jobId
    WHERE applications.id = ?
  `).get(applicationId);
  return updated ? rowToApplication(updated) : { ...application, status: "cancelled" as const, jobStatus: "cancelled" as const };
}

export function cancelLocalApplication(applicationId: string, workerId: string) {
  const row = localDb().prepare("SELECT * FROM applications WHERE id = ? AND workerId = ?").get(applicationId, workerId);
  if (!row) return null;
  const application = rowToApplication(row);
  if (application.status !== "pending") throw new Error("Only pending applications can be cancelled.");
  const now = nowIso();
  const day = now.slice(0, 10);
  const counter = localDb().prepare("SELECT count FROM worker_cancellation_days WHERE workerId = ? AND day = ?").get(workerId, day);
  if (Number(counter?.count ?? 0) >= 2) throw new Error("You have reached today's cancellation limit. You can only cancel twice per day.");
  localDb().exec("BEGIN IMMEDIATE");
  try {
    localDb().prepare(`
      INSERT INTO worker_cancellation_days (workerId, day, count, updatedAt)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(workerId, day) DO UPDATE SET count = count + 1, updatedAt = excluded.updatedAt
    `).run(workerId, day, now);
    localDb().prepare("UPDATE applications SET status = 'withdrawn', updatedAt = ? WHERE id = ? AND workerId = ?").run(now, applicationId, workerId);
    localDb().prepare(`
      INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
      VALUES (?, ?, 'Application cancelled', ?, 0, ?, ?)
    `).run(`notification-application-cancelled-${applicationId}`, application.clientId, `${application.workerName ?? "A worker"} cancelled an application for ${application.jobTitle ?? "your job"}.`, `/applications?application=${applicationId}`, now);
    localDb().exec("COMMIT");
  } catch (error) {
    localDb().exec("ROLLBACK");
    throw error;
  }
  const updated = localDb().prepare("SELECT * FROM applications WHERE id = ?").get(applicationId);
  return updated ? rowToApplication(updated) : { ...application, status: "withdrawn" as const };
}

export function requestLocalApplicationCompletion(applicationId: string, workerId: string) {
  const row = localDb().prepare("SELECT * FROM applications WHERE id = ? AND workerId = ?").get(applicationId, workerId);
  if (!row) return null;
  const application = rowToApplication(row);
  if (application.status !== "accepted") throw new Error("Only accepted jobs can be marked complete.");
  const now = nowIso();
  localDb().prepare("UPDATE applications SET status = 'completion_requested', updatedAt = ? WHERE id = ? AND workerId = ?").run(now, applicationId, workerId);
  localDb().prepare(`
    INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
    VALUES (?, ?, 'Completion requested', ?, 0, ?, ?)
  `).run(`notification-completion-requested-${applicationId}`, application.clientId, `${application.workerName ?? "A worker"} marked ${application.jobTitle ?? "your job"} as complete. Confirm to release payment.`, `/completed-requests?application=${applicationId}`, now);
  const updated = localDb().prepare("SELECT * FROM applications WHERE id = ?").get(applicationId);
  return updated ? rowToApplication(updated) : { ...application, status: "completion_requested" as const };
}

export function confirmLocalWorkerPaid(applicationId: string, clientId: string) {
  const row = localDb().prepare("SELECT * FROM applications WHERE id = ? AND clientId = ?").get(applicationId, clientId);
  if (!row) return null;
  const application = rowToApplication(row);
  const job = getLocalJob(application.jobId);
  if (job && job.clientId !== clientId) return null;
  if (application.status !== "completion_requested") throw new Error("The worker must request completion before payment can be confirmed.");
  const now = nowIso();
  localDb().prepare("UPDATE applications SET status = 'payment_sent', updatedAt = ? WHERE id = ?").run(now, applicationId);
  if (job) localDb().prepare("UPDATE jobs SET status = 'live', updatedAt = ? WHERE id = ?").run(now, job.id);
  localDb().prepare(`
    INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
    VALUES (?, ?, 'Payment sent', ?, 0, ?, ?)
  `).run(`notification-payment-sent-${applicationId}`, application.workerId, `${application.jobTitle ?? "Your job"} has been paid directly by the client. Confirm only after the money has reached you.`, `/applications?application=${applicationId}`, now);
  const updated = localDb().prepare(`
    SELECT applications.*, jobs.category as jobCategory, jobs.status as jobStatus
    FROM applications
    LEFT JOIN jobs ON jobs.id = applications.jobId
    WHERE applications.id = ?
  `).get(applicationId);
  return updated ? rowToApplication(updated) : { ...application, status: "payment_sent" as const };
}

export function completeLocalApplication(applicationId: string, workerId: string) {
  const row = localDb().prepare("SELECT * FROM applications WHERE id = ? AND workerId = ?").get(applicationId, workerId);
  if (!row) return null;
  const application = rowToApplication(row);
  const job = getLocalJob(application.jobId);
  if (application.status !== "payment_sent") throw new Error("Confirm payment only after the client has marked the direct payment as sent.");

  const now = nowIso();
  const serviceFee = calculateServiceFee(Number(job?.payAmount ?? application.jobAmount ?? 0));
  localDb().exec("BEGIN IMMEDIATE");
  try {
    localDb().prepare("UPDATE applications SET status = 'completed', updatedAt = ? WHERE id = ?").run(now, applicationId);
    if (job) localDb().prepare("UPDATE jobs SET status = 'completed', completedPeriods = 1, recurrenceStatus = 'completed', updatedAt = ? WHERE id = ?").run(now, job.id);
    localDb().prepare("UPDATE users SET completedJobs = completedJobs + 1, updatedAt = ? WHERE uid IN (?, ?)").run(now, application.workerId, application.clientId);
    localDb().prepare("UPDATE users SET isLocked = 1, outstandingServiceFee = ?, lockReason = ?, updatedAt = ? WHERE uid = ?")
      .run(serviceFee, "Service Fee Payment Required", now, application.workerId);
    localDb().prepare(`
      INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
        VALUES (?, ?, 'Account action required', ?, 0, '/dashboard', ?)
    `).run(`notification-service-fee-${applicationId}`, application.workerId, "job is complete because you confirmed receiving direct payment. Open your dashboard to continue using Copic.", now);
    localDb().exec("COMMIT");
  } catch (error) {
    localDb().exec("ROLLBACK");
    throw error;
  }
  const fullyCompleted = true;
  if (fullyCompleted) localDb().prepare("UPDATE conversations SET locked = 1, updatedAt = ? WHERE id = ?").run(nowIso(), `${application.jobId}_${application.workerId}`);

  const remainingAccepted = localDb().prepare("SELECT COUNT(*) as count FROM applications WHERE jobId = ? AND status = 'accepted'").get(application.jobId);
  if (job && fullyCompleted && Number(remainingAccepted?.count ?? 0) === 0) {
    localDb().prepare("UPDATE jobs SET status = 'completed', updatedAt = ? WHERE id = ? AND clientId = ?").run(nowIso(), job.id, application.clientId);
  }

  localDb().prepare(`
    INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
    VALUES (?, ?, 'Client confirmed payment', ?, 0, ?, ?)
  `).run(`notification-completed-${applicationId}`, application.workerId, "job is complete because you confirmed receiving direct payment. Open your dashboard to continue using Copic.", `/dashboard`, nowIso());

  const updated = localDb().prepare(`
    SELECT applications.*, jobs.category as jobCategory, jobs.status as jobStatus
    FROM applications
    LEFT JOIN jobs ON jobs.id = applications.jobId
    WHERE applications.id = ?
  `).get(applicationId);
  const completedApplication = updated ? rowToApplication(updated) : { ...application, status: fullyCompleted ? "completed" : "accepted" };
  return { ...completedApplication, workerLocked: true, outstandingServiceFee: serviceFee };
}

export function cancelLocalRemainingPeriods(jobId: string, clientId: string) {
  const job = getLocalJob(jobId);
  if (!job || job.clientId !== clientId || job.status === "completed") return null;
  const now = nowIso();
  localDb().prepare("UPDATE jobs SET status = 'completed', recurrenceStatus = 'cancelled', cancelledAfterPeriods = completedPeriods, updatedAt = ? WHERE id = ? AND clientId = ?").run(now, jobId, clientId);
  localDb().prepare("UPDATE applications SET status = 'completed', updatedAt = ? WHERE jobId = ? AND clientId = ? AND status = 'accepted'").run(now, jobId, clientId);
  localDb().prepare("UPDATE conversations SET locked = 1, updatedAt = ? WHERE jobId = ? AND clientId = ?").run(now, jobId, clientId);
  return getLocalJob(jobId);
}

export function cancelLocalNextPeriod(jobId: string, clientId: string) {
  const job = getLocalJob(jobId);
  if (!job || job.clientId !== clientId || job.status === "completed") return null;
  const totalPeriods = Number(job.totalPeriods ?? 1);
  const completedPeriods = Number(job.completedPeriods ?? 0);
  if (totalPeriods <= completedPeriods + 1) return cancelLocalRemainingPeriods(jobId, clientId);
  localDb().prepare("UPDATE jobs SET totalPeriods = ?, recurrenceStatus = 'active', updatedAt = ? WHERE id = ? AND clientId = ?").run(totalPeriods - 1, nowIso(), jobId, clientId);
  return getLocalJob(jobId);
}

export function countLocalActiveAcceptedApplications(workerId: string) {
  const row = localDb().prepare(`
    SELECT COUNT(*) as count
    FROM applications
    JOIN jobs ON jobs.id = applications.jobId
    WHERE applications.workerId = ?
      AND applications.status IN ('accepted', 'completion_requested', 'payment_sent')
      AND jobs.status IN ('live', 'assigned', 'active', 'open')
  `).get(workerId);
  return Number(row?.count ?? 0);
}

export function upsertLocalConversation(jobId: string, clientId: string, workerId: string) {
  const id = `${jobId}_${workerId}`;
  localDb().prepare(`
    INSERT INTO conversations (id, jobId, clientId, workerId, participants, locked, lastMessage, updatedAt)
    VALUES (?, ?, ?, ?, ?, 0, NULL, ?)
    ON CONFLICT(id) DO UPDATE SET locked = 0, updatedAt = excluded.updatedAt
  `).run(id, jobId, clientId, workerId, jsonString([clientId, workerId]), nowIso());
  return getLocalConversation(id);
}

function rowToConversation(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    jobId: String(row.jobId),
    clientId: String(row.clientId),
    workerId: String(row.workerId),
    clientName: typeof row.clientName === "string" ? row.clientName : undefined,
    workerName: typeof row.workerName === "string" ? row.workerName : undefined,
    participants: parseJson<string[]>(row.participants, []),
    locked: Number(row.locked ?? 0) === 1,
    lastMessage: typeof row.lastMessage === "string" ? row.lastMessage : undefined,
    updatedAt: null
  };
}

function rowToMessage(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    conversationId: String(row.conversationId),
    senderId: String(row.senderId),
    body: String(row.body),
    readBy: parseJson<string[]>(row.readBy, []),
    createdAt: null
  };
}

export function getLocalConversation(id: string) {
  const row = localDb().prepare(`
    SELECT conversations.*,
      CASE WHEN jobs.status IN ('completed', 'cancelled') OR applications.status = 'completed' THEN 1 ELSE conversations.locked END as locked
    FROM conversations
    LEFT JOIN jobs ON jobs.id = conversations.jobId
    LEFT JOIN applications ON applications.jobId = conversations.jobId AND applications.workerId = conversations.workerId
    WHERE conversations.id = ?
    LIMIT 1
  `).get(id);
  return row ? rowToConversation(row) : null;
}

export function listLocalConversations(userId: string) {
  ensureLocalConversationsForUser(userId);
  return localDb().prepare(`
    SELECT conversations.*, clients.displayName as clientName, workers.displayName as workerName
    FROM conversations
    LEFT JOIN users clients ON clients.uid = conversations.clientId
    LEFT JOIN users workers ON workers.uid = conversations.workerId
    LEFT JOIN jobs ON jobs.id = conversations.jobId
    LEFT JOIN applications ON applications.jobId = conversations.jobId AND applications.workerId = conversations.workerId
    WHERE (conversations.clientId = ? OR conversations.workerId = ?)
      AND conversations.locked = 0
      AND jobs.status NOT IN ('completed', 'cancelled')
      AND applications.status != 'completed'
    ORDER BY conversations.updatedAt DESC
    LIMIT 40
  `).all(userId, userId).map(rowToConversation);
}

export function ensureLocalConversationsForUser(userId: string) {
  const rows = localDb().prepare(`
    SELECT applications.jobId, applications.clientId, applications.workerId
    FROM applications
    JOIN jobs ON jobs.id = applications.jobId
    WHERE (applications.clientId = ? OR applications.workerId = ?)
      AND applications.status IN ('accepted', 'completion_requested', 'payment_sent')
      AND jobs.status IN ('open', 'live', 'assigned', 'active')
  `).all(userId, userId);
  rows.forEach(row => {
    if (typeof row.jobId === "string" && typeof row.clientId === "string" && typeof row.workerId === "string") {
      upsertLocalConversation(row.jobId, row.clientId, row.workerId);
    }
  });
}

export function listLocalMessages(conversationId: string) {
  return localDb().prepare("SELECT * FROM conversation_messages WHERE conversationId = ? ORDER BY createdAt ASC LIMIT 120").all(conversationId).map(rowToMessage);
}

export function createLocalMessage(conversationId: string, senderId: string, body: string) {
  const conversation = getLocalConversation(conversationId);
  if (!conversation || conversation.locked || !conversation.participants.includes(senderId)) return null;
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  localDb().prepare(`
    INSERT INTO conversation_messages (id, conversationId, senderId, body, readBy, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, conversationId, senderId, body, jsonString([senderId]), createdAt);
  localDb().prepare("UPDATE conversations SET lastMessage = ?, updatedAt = ? WHERE id = ?").run(body, createdAt, conversationId);
  const receiverId = conversation.participants.find(id => id !== senderId);
  if (receiverId) {
    localDb().prepare(`
      INSERT INTO notifications (id, userId, title, body, read, href, createdAt)
      VALUES (?, ?, 'New chat message', ?, 0, '/chat', ?)
    `).run(`message-${id}`, receiverId, body, createdAt);
  }
  const row = localDb().prepare("SELECT * FROM conversation_messages WHERE id = ?").get(id);
  return row ? rowToMessage(row) : null;
}

export function completeLocalJob(jobId: string, clientId: string) {
  const job = getLocalJob(jobId);
  if (!job || job.clientId !== clientId) return null;
  localDb().prepare("UPDATE jobs SET status = 'completed', updatedAt = ? WHERE id = ? AND clientId = ?").run(nowIso(), jobId, clientId);
  localDb().prepare("UPDATE applications SET status = 'completed', updatedAt = ? WHERE jobId = ? AND clientId = ? AND status = 'accepted'").run(nowIso(), jobId, clientId);
  localDb().prepare("UPDATE conversations SET locked = 1, updatedAt = ? WHERE jobId = ? AND clientId = ?").run(nowIso(), jobId, clientId);
  return getLocalJob(jobId);
}

export function listLocalApplications(userId: string, role: "client" | "worker") {
  const field = role === "client" ? "applications.clientId" : "applications.workerId";
  return localDb().prepare(`
    SELECT
      applications.*,
      workers.displayName as workerName,
      workers.email as workerEmail,
      workers.phoneNumber as workerPhoneNumber,
      workers.skills as workerSkills,
      workers.completedJobs as workerCompletedJobs,
      workers.ratingAverage as workerRatingAverage,
      workers.ratingCount as workerRatingCount,
      workers.verificationStatus as workerVerificationStatus,
      clients.displayName as clientName,
      clients.ratingAverage as clientRatingAverage,
      clients.ratingCount as clientRatingCount,
      jobs.category as jobCategory,
      jobs.status as jobStatus,
      jobs.payAmount as jobAmount
    FROM applications
    LEFT JOIN users workers ON workers.uid = applications.workerId
    LEFT JOIN users clients ON clients.uid = applications.clientId
    LEFT JOIN jobs ON jobs.id = applications.jobId
    WHERE ${field} = ?
    ORDER BY applications.createdAt DESC
    LIMIT 80
  `).all(userId).map(rowToApplication);
}

export function listLocalNotifications(userId: string) {
  return localDb().prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 80").all(userId).map(row => ({
    id: String(row.id),
    userId: String(row.userId),
    title: String(row.title),
    body: String(row.body),
    read: Number(row.read ?? 0) === 1,
    href: typeof row.href === "string" ? row.href : undefined,
    createdAt: null
  }));
}

export function saveLocalWorkerSkill(userId: string, skill: WorkerSkillProfile) {
  const user = getLocalUser(userId);
  if (!user || user.role !== "worker") throw new Error("Worker access required.");
  const existing = user.skillProfiles ?? [];
  const next = [...existing.filter(item => item.id !== skill.id && item.name.toLowerCase() !== skill.name.toLowerCase()), skill];
  const names = Array.from(new Set(next.map(item => item.name)));
  localDb().prepare("UPDATE users SET skills = ?, skillProfiles = ?, updatedAt = ? WHERE uid = ?")
    .run(jsonString(names), jsonString(next), nowIso(), userId);
  return next;
}

export function deleteLocalWorkerSkill(userId: string, skillId: string) {
  const user = getLocalUser(userId);
  if (!user || user.role !== "worker") throw new Error("Worker access required.");
  const next = (user.skillProfiles ?? []).filter(item => item.id !== skillId);
  const names = Array.from(new Set(next.map(item => item.name)));
  localDb().prepare("UPDATE users SET skills = ?, skillProfiles = ?, updatedAt = ? WHERE uid = ?")
    .run(jsonString(names), jsonString(next), nowIso(), userId);
  return next;
}

export function submitLocalServiceFeePayment(input: { workerId: string; screenshotUrl?: string | null; jobId?: string; applicationId?: string }) {
  const worker = getLocalUser(input.workerId);
  if (!worker || worker.role === "admin" || Number(worker.outstandingServiceFee ?? 0) <= 0) throw new Error("An outstanding service fee is required.");
  const username = usernameForUser(worker);
  const submittedAt = nowIso();
  const paymentId = crypto.randomUUID();
  const status = "payment_pending_verification";
  localDb().prepare(`
    INSERT INTO service_fee_payments (id, workerId, username, transactionCode, screenshotUrl, status, amount, jobId, applicationId, rejectionReason, matchedMpesaRecordId, submittedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(paymentId, input.workerId, username, `ADMIN-${paymentId.slice(0, 8).toUpperCase()}`, input.screenshotUrl ?? null, status, Number(worker.outstandingServiceFee ?? 0), input.jobId ?? null, input.applicationId ?? null, null, submittedAt);
  localDb().prepare("UPDATE users SET isLocked = 1, lockReason = ?, updatedAt = ? WHERE uid = ?")
    .run("Waiting for admin confirmation", submittedAt, input.workerId);
  localDb().prepare(`
    INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
    VALUES (?, ?, 'Payment submitted', ?, 0, '/dashboard', ?)
  `).run(`notification-service-fee-submitted-${input.workerId}`, input.workerId, "Waiting for admin confirmation.", submittedAt);
  return getLatestLocalServiceFeePayment(input.workerId);
}

export function listLocalServiceFeePayments() {
  return localDb().prepare(`
    SELECT service_fee_payments.*, users.displayName as workerName
    FROM service_fee_payments
    LEFT JOIN users ON users.uid = service_fee_payments.workerId
    ORDER BY service_fee_payments.submittedAt DESC
    LIMIT 200
  `).all().map(rowToServiceFeePayment);
}

export function getLatestLocalServiceFeePayment(workerId: string) {
  const row = localDb().prepare(`
    SELECT service_fee_payments.*, users.displayName as workerName
    FROM service_fee_payments
    LEFT JOIN users ON users.uid = service_fee_payments.workerId
    WHERE workerId = ?
    ORDER BY submittedAt DESC
    LIMIT 1
  `).get(workerId);
  return row ? rowToServiceFeePayment(row) : null;
}

export function reviewLocalServiceFeePayment(id: string, adminId: string, action: "approve" | "reject", reason?: string) {
  const row = localDb().prepare("SELECT * FROM service_fee_payments WHERE id = ?").get(id);
  if (!row) return null;
  const payment = rowToServiceFeePayment(row);
  const now = nowIso();
  if (action === "approve") {
    localDb().prepare("UPDATE service_fee_payments SET status = 'approved', rejectionReason = NULL, reviewedAt = ?, reviewedBy = ? WHERE id = ?").run(now, adminId, id);
    localDb().prepare("UPDATE users SET isLocked = 0, outstandingServiceFee = 0, lockReason = NULL, updatedAt = ? WHERE uid = ?").run(now, payment.workerId);
    localDb().prepare(`
      INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
      VALUES (?, ?, 'Account unlocked', 'Your payment was approved. You can apply for jobs again.', 0, '/jobs', ?)
    `).run(`notification-service-fee-approved-${id}`, payment.workerId, now);
  } else {
    localDb().prepare("UPDATE service_fee_payments SET status = 'rejected', rejectionReason = ?, reviewedAt = ?, reviewedBy = ? WHERE id = ?").run(reason ?? "Payment could not be verified.", now, adminId, id);
    localDb().prepare("UPDATE users SET isLocked = 1, outstandingServiceFee = ?, lockReason = ?, updatedAt = ? WHERE uid = ?").run(payment.amount, reason ?? "Payment rejected. Please resubmit.", now, payment.workerId);
    localDb().prepare(`
      INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
      VALUES (?, ?, 'Payment rejected', ?, 0, '/dashboard', ?)
    `).run(`notification-service-fee-rejected-${id}`, payment.workerId, `Your payment was rejected. Please retry.${reason ? ` Reason: ${reason}` : ""}`, now);
  }
  return listLocalServiceFeePayments().find(item => item.id === id) ?? null;
}

function usernameForUser(user: UserProfile) {
  return (user.displayName || user.email || user.id).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || user.id.slice(0, 12);
}

export function listLocalWorkers() {
  return localDb().prepare("SELECT * FROM users WHERE (role = 'worker' OR roles LIKE '%worker%') AND isLocked = 0 AND outstandingServiceFee <= 0 ORDER BY updatedAt DESC LIMIT 100").all().map(rowToUser);
}

export function listLocalNotificationArchives(userId: string) {
  return localDb().prepare("SELECT * FROM notification_archives WHERE userId = ?").all(userId).map(row => ({
    id: String(row.id),
    archivedAt: String(row.archivedAt)
  }));
}

export function listLocalNotificationDeletes(userId: string) {
  return localDb().prepare("SELECT * FROM notification_deletes WHERE userId = ?").all(userId).map(row => ({
    id: String(row.id),
    deletedAt: String(row.deletedAt)
  }));
}

export function archiveLocalNotification(userId: string, id: string) {
  localDb().prepare("INSERT OR REPLACE INTO notification_archives (id, userId, archivedAt) VALUES (?, ?, ?)")
    .run(id, userId, nowIso());
}

export function markLocalNotificationRead(userId: string, id: string) {
  localDb().prepare("UPDATE notifications SET read = 1 WHERE id = ? AND userId = ?").run(id, userId);
}

export function restoreLocalNotification(userId: string, id: string) {
  localDb().prepare("DELETE FROM notification_archives WHERE id = ? AND userId = ?").run(id, userId);
}

export function deleteLocalNotification(userId: string, id: string) {
  const now = nowIso();
  localDb().prepare("INSERT OR REPLACE INTO notification_deletes (id, userId, deletedAt) VALUES (?, ?, ?)")
    .run(id, userId, now);
  localDb().prepare("DELETE FROM notification_archives WHERE id = ? AND userId = ?").run(id, userId);
  localDb().prepare("DELETE FROM notifications WHERE id = ? AND userId = ?").run(id, userId);
}

export function createLocalRating(input: { id: string; jobId: string; fromUserId: string; toUserId: string; stars: number; review: string }) {
  const existing = localDb().prepare("SELECT id FROM ratings WHERE jobId = ? AND fromUserId = ? AND toUserId = ? LIMIT 1").get(input.jobId, input.fromUserId, input.toUserId);
  if (existing) return String(existing.id);
  localDb().prepare("INSERT INTO ratings (id, jobId, fromUserId, toUserId, stars, review, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)").run(input.id, input.jobId, input.fromUserId, input.toUserId, input.stars, input.review, nowIso());
  const aggregate = localDb().prepare("SELECT AVG(stars) as average, COUNT(*) as count FROM ratings WHERE toUserId = ?").get(input.toUserId);
  localDb().prepare("UPDATE users SET ratingAverage = ?, ratingCount = ?, updatedAt = ? WHERE uid = ?").run(Number(aggregate?.average ?? 0), Number(aggregate?.count ?? 0), nowIso(), input.toUserId);
  return input.id;
}

export function listLocalActivities(userId: string) {
  return localDb().prepare("SELECT * FROM activities WHERE userId = ? ORDER BY createdAt DESC LIMIT 8").all(userId).map(row => ({
    id: String(row.id),
    userId: String(row.userId),
    role: String(row.role) as Role,
    type: String(row.type),
    title: String(row.title),
    description: String(row.description),
    relatedId: typeof row.relatedId === "string" ? row.relatedId : undefined,
    read: Number(row.read ?? 0) === 1,
    createdAt: null
  }));
}

export function getLocalAdminSetting(key: string) {
  const row = localDb().prepare("SELECT value FROM admin_settings WHERE key = ?").get(key);
  return typeof row?.value === "string" ? row.value : null;
}

export function setLocalAdminSetting(key: string, value: string) {
  localDb().prepare(`
    INSERT INTO admin_settings (key, value, updatedAt) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `).run(key, value, nowIso());
}

export function updateLocalProfilePhoto(userId: string, photoURL: string, positionX = 50, positionY = 50, zoom = 1) {
  localDb().prepare("UPDATE users SET photoURL = ?, photoPositionX = ?, photoPositionY = ?, photoZoom = ?, updatedAt = ? WHERE uid = ?").run(photoURL, positionX, positionY, zoom, nowIso(), userId);
  return getLocalUser(userId);
}

export function updateLocalProfileLocation(userId: string, location: LocationFields) {
  localDb().prepare("UPDATE users SET location = ?, updatedAt = ? WHERE uid = ?").run(jsonString(location), nowIso(), userId);
  return getLocalUser(userId);
}

export function createLocalAdminSession(input: { id: string; adminId: string; ip?: string | null; userAgent?: string | null; expiresAt: string }) {
  const now = nowIso();
  localDb().prepare("INSERT INTO admin_sessions (id, adminId, ip, userAgent, revoked, createdAt, lastSeenAt, expiresAt) VALUES (?, ?, ?, ?, 0, ?, ?, ?)")
    .run(input.id, input.adminId, input.ip ?? null, input.userAgent ?? null, now, now, input.expiresAt);
}

export function listLocalAdminSessions() {
  return localDb().prepare("SELECT * FROM admin_sessions ORDER BY createdAt DESC LIMIT 100").all().map(row => ({
    id: String(row.id),
    adminId: String(row.adminId),
    ip: typeof row.ip === "string" ? row.ip : null,
    userAgent: typeof row.userAgent === "string" ? row.userAgent : null,
    revoked: Number(row.revoked ?? 0) === 1,
    createdAt: String(row.createdAt),
    lastSeenAt: typeof row.lastSeenAt === "string" ? row.lastSeenAt : null,
    expiresAt: String(row.expiresAt)
  }));
}

export function revokeLocalAdminSession(sessionId: string) {
  localDb().prepare("UPDATE admin_sessions SET revoked = 1, lastSeenAt = ? WHERE id = ?").run(nowIso(), sessionId);
}

export function updateLocalAccountSettings(userId: string, input: { email?: string | null; phoneNumber?: string | null }) {
  const existing = getLocalUser(userId);
  if (!existing) return null;
  const email = typeof input.email === "string" ? input.email : existing.email ?? null;
  const phoneNumber = typeof input.phoneNumber === "string" ? input.phoneNumber : existing.phoneNumber ?? null;
  localDb().prepare("UPDATE users SET email = ?, phoneNumber = ?, updatedAt = ? WHERE uid = ?").run(email, phoneNumber, nowIso(), userId);
  return getLocalUser(userId);
}
