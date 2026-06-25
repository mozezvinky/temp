import type { Timestamp } from "firebase/firestore";

export type Role = "worker" | "client" | "admin";
export type AdminRole = "super_admin" | "support_admin" | "finance_admin" | "kyc_admin" | "moderator";
export type AdminPermission =
  | "tickets:read"
  | "tickets:write"
  | "users:read"
  | "users:write"
  | "jobs:write"
  | "applications:write"
  | "kyc:write"
  | "finance:read"
  | "finance:adjust"
  | "audit:read"
  | "admins:manage"
  | "moderation:write";
export type VerificationStatus = "not_submitted" | "pending" | "approved" | "rejected";
export type JobStatus = "draft" | "open" | "pending" | "live" | "assigned" | "active" | "in_progress" | "completed" | "disputed" | "cancelled" | "moderated";
export type ApplicationStatus = "pending" | "accepted" | "completion_requested" | "payment_sent" | "completed" | "rejected" | "cancelled" | "withdrawn";
export type PaymentType = "mpesa" | "cash";
export type JobPaymentMethod = "mpesa" | "cash";
export type ServiceFeePaymentStatus = "payment_pending_verification" | "verified" | "approved" | "rejected";
export type WorkerSkillCategory = "tools_software" | "services_trades" | "credentials_licenses";
export type WorkerSkillLevel = "beginner" | "independent" | "expert";
export type WorkerSkillProofType = "certificate" | "license" | "reference" | "work_photo";

export interface WorkerSkillProfile {
  id: string;
  name: string;
  description?: string;
  category: WorkerSkillCategory;
  level: WorkerSkillLevel;
  proofType: WorkerSkillProofType;
  licenseNumber?: string;
  referencePhone?: string;
  proofUrl?: string;
  chargeAmount?: number;
  chargeCategory?: string;
  chargeQuantity?: number | null;
  chargeUnit?: string | null;
  chargeCustomUnit?: string | null;
  chargeTimeline?: number | null;
  chargeTimelineUnit?: "minutes" | "hours" | "days" | "weeks" | "months";
  chargePayType?: "fixed" | "timeline";
  completedJobs: number;
  ratingAverage: number;
  ratingCount: number;
  createdAt?: Timestamp | null;
}

export interface LocationFields {
  county: string;
  town: string;
  estateOrArea: string;
  nearestLandmark: string;
  addressText: string;
  latitude: number;
  longitude: number;
}

export interface UserProfile {
  id: string;
  uid: string;
  role: Role;
  roles?: Role[];
  adminRole?: AdminRole;
  adminPermissions?: AdminPermission[];
  displayName: string;
  email?: string;
  emailVerified?: boolean;
  emailVerifiedAt?: Timestamp | null;
  phoneNumber?: string;
  photoURL?: string;
  photoPositionX?: number;
  photoPositionY?: number;
  photoZoom?: number;
  bio?: string;
  skills: string[];
  skillProfiles?: WorkerSkillProfile[];
  hourlyRate?: number;
  certificates: string[];
  workHistory: string[];
  availability?: string;
  companyName?: string;
  location?: LocationFields;
  ratingAverage: number;
  ratingCount: number;
  completedJobs: number;
  verificationStatus: VerificationStatus;
  verificationRejectionReason?: string | null;
  profileCompleted: boolean;
  isLocked: boolean;
  lockReason?: string;
  outstandingServiceFee: number;
  trustScore?: number;
  isOccupied?: boolean;
  activeJobCount?: number;
  badges: string[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type SupportTicketStatus = "open" | "pending" | "resolved" | "rejected" | "escalated";

export interface AdminAuditLog {
  id: string;
  adminId: string;
  adminEmail?: string;
  targetUserId?: string | null;
  actionType: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason: string;
  linkedTicketId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: Timestamp | null;
}

export interface AdminSession {
  id: string;
  adminId: string;
  ip?: string | null;
  userAgent?: string | null;
  revoked: boolean;
  createdAt: Timestamp | string | null;
  lastSeenAt?: Timestamp | string | null;
  expiresAt: Timestamp | string | null;
}

export interface VerificationRecord {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  username: string;
  role: Role;
  phoneNumber: string;
  nationalId?: string;
  nationalIdHash?: string;
  county: string;
  address: string;
  idFrontUrl: string;
  idBackUrl: string;
  selfieWithIdUrl: string;
  proofOfAddressUrl?: string | null;
  addressVerificationStatus?: VerificationStatus;
  identityVerificationStatus?: VerificationStatus;
  provider?: "didit" | "manual";
  providerSessionId?: string;
  providerStatus?: string;
  location?: LocationFields;
  skills?: string[];
  certificates?: string[];
  certificateUrls?: string[];
  experience?: string;
  status: VerificationStatus;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Job {
  id: string;
  clientId: string;
  clientName: string;
  createdBy?: string;
  title: string;
  description: string;
  category: string;
  location: string;
  county: string;
  locationDetails?: LocationFields;
  payAmount: number;
  payType: "fixed" | "timeline";
  duration: string;
  durationValue?: number;
  durationUnit?: "minutes" | "hours" | "days" | "weeks" | "months";
  totalPeriods?: number;
  completedPeriods?: number;
  recurrenceStatus?: "active" | "completed" | "cancelled";
  rehireOfJobId?: string;
  rehireWorkerId?: string;
  rehireStartDate?: string;
  nextPaymentDate?: string;
  cancelledAfterPeriods?: number;
  workersNeeded?: number;
  acceptedCount?: number;
  quantity?: number | null;
  unit?: string | null;
  customUnit?: string | null;
  paymentMethod?: JobPaymentMethod;
  requiredSkills: string[];
  applicants: string[];
  assignedWorkerId: string | null;
  status: JobStatus;
  // Compatibility fields for older job/payment documents.
  durationHours?: number;
  rateType?: "fixed" | "timeline";
  rateAmount?: number;
  imageUrls?: string[];
  hiredWorkerId?: string;
  paymentType?: PaymentType;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Application {
  id: string;
  jobId: string;
  workerId: string;
  clientId: string;
  jobTitle?: string;
  jobCategory?: string;
  jobStatus?: JobStatus;
  workerName?: string;
  workerEmail?: string;
  workerPhoneNumber?: string;
  jobAmount?: number;
  workerSkills?: string[];
  workerCompletedJobs?: number;
  workerRatingAverage?: number;
  workerRatingCount?: number;
  workerVerificationStatus?: VerificationStatus;
  clientName?: string;
  clientRatingAverage?: number;
  clientRatingCount?: number;
  clientRating?: number;
  source?: "application" | "direct_hire";
  requestTitle?: string;
  requestLocation?: string;
  requestStartDate?: string;
  requestDuration?: string;
  requestDescription?: string;
  coverNote: string;
  status: ApplicationStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Conversation {
  id: string;
  jobId: string;
  clientId: string;
  workerId: string;
  clientName?: string;
  workerName?: string;
  locked: boolean;
  participants: string[];
  lastMessage?: string;
  updatedAt: Timestamp;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body?: string;
  imageUrl?: string;
  readBy: string[];
  createdAt: Timestamp;
}

export interface ServiceFeePayment {
  id: string;
  workerId: string;
  workerName?: string;
  username: string;
  transactionCode: string;
  screenshotUrl?: string | null;
  status: ServiceFeePaymentStatus;
  amount: number;
  jobId?: string;
  applicationId?: string;
  rejectionReason?: string | null;
  matchedMpesaRecordId?: string | null;
  submittedAt: Timestamp | null;
  reviewedAt?: Timestamp | null;
  reviewedBy?: string | null;
}

export interface Rating {
  id: string;
  jobId: string;
  fromUserId: string;
  fromUserRole?: Role;
  toUserId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  review: string;
  jobTitle?: string;
  createdAt: Timestamp;
}

export interface SkillTest {
  id: string;
  category: string;
  title: string;
  passMark: number;
  questions: Array<{ prompt: string; options: string[]; answerIndex: number }>;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  href?: string;
  archived?: boolean;
  archivedAt?: Timestamp | null;
  createdAt: Timestamp;
}

export interface Activity {
  id: string;
  userId: string;
  role: Role;
  type: string;
  title: string;
  description: string;
  relatedId?: string;
  read: boolean;
  createdAt: Timestamp | null;
}
