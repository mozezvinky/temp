import type { Timestamp } from "firebase/firestore";

export type Role = "worker" | "client" | "admin";
export type KycStatus = "pending" | "verified" | "rejected";
export type JobStatus = "draft" | "open" | "pending" | "assigned" | "active" | "in_progress" | "completed" | "disputed" | "cancelled" | "moderated";
export type ApplicationStatus = "pending" | "accepted" | "rejected" | "withdrawn";
export type PaymentType = "mpesa" | "cash";
export type TransactionType = "deposit" | "payout" | "service_fee" | "wallet_credit" | "cash_fee";
export type TransactionStatus = "pending" | "succeeded" | "failed" | "reversed";

export interface UserProfile {
  id: string;
  role: Role;
  accountType?: Role;
  displayName: string;
  email?: string;
  phone?: string;
  photoURL?: string;
  bio?: string;
  skills: string[];
  hourlyRate?: number;
  certificates: string[];
  workHistory: string[];
  availability?: string;
  companyName?: string;
  ratingAverage: number;
  ratingCount: number;
  completedJobs: number;
  kycStatus: KycStatus;
  verificationStatus?: KycStatus;
  isLocked: boolean;
  lockReason?: string;
  outstandingServiceFee: number;
  walletBalance?: number;
  trustScore?: number;
  badges: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface KycRecord {
  id: string;
  userId: string;
  nationalIdHash: string;
  nationalIdUrl: string;
  selfieUrl: string;
  phoneVerified: boolean;
  status: KycStatus;
  rejectionReason?: string;
  reviewedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Job {
  id: string;
  clientId: string;
  title: string;
  description: string;
  category: string;
  durationHours: number;
  rateType: "hourly" | "fixed";
  rateAmount: number;
  location: string;
  requiredSkills: string[];
  imageUrls: string[];
  status: JobStatus;
  hiredWorkerId?: string;
  paymentType?: PaymentType;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Application {
  id: string;
  jobId: string;
  workerId: string;
  clientId: string;
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

export interface Wallet {
  id: string;
  userId: string;
  balance: number;
  pendingPayouts: number;
  outstandingServiceFee: number;
  updatedAt: Timestamp;
}

export interface Transaction {
  id: string;
  userId: string;
  jobId?: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  serviceFee?: number;
  paymentType?: PaymentType;
  mpesaReceipt?: string;
  createdAt: Timestamp;
}

export interface Rating {
  id: string;
  jobId: string;
  fromUserId: string;
  toUserId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  review: string;
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
  createdAt: Timestamp;
}
