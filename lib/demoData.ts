import type { AppNotification, Job, SkillTest, Transaction, UserProfile } from "@/types";

const now = { seconds: Date.now() / 1000, nanoseconds: 0, toDate: () => new Date() } as never;

export const demoWorkers: UserProfile[] = [
  {
    id: "worker-ama",
    role: "worker",
    displayName: "Ama Otieno",
    phone: "+254700111222",
    bio: "Experienced cleaner and event support worker available across Nairobi.",
    skills: ["Cleaning", "Event setup", "Inventory"],
    hourlyRate: 450,
    certificates: ["Food handling"],
    workHistory: ["Westlands event crew", "Karen home deep cleaning"],
    availability: "Weekdays and weekends",
    ratingAverage: 4.8,
    ratingCount: 18,
    completedJobs: 7,
    kycStatus: "verified",
    isLocked: false,
    outstandingServiceFee: 0,
    badges: ["Trusted Worker", "Skill Verified"],
    createdAt: now,
    updatedAt: now
  },
  {
    id: "worker-juma",
    role: "worker",
    displayName: "Juma Mwangi",
    phone: "+254711333444",
    bio: "Licensed driver for errands, deliveries, and short contracts.",
    skills: ["Driving", "Delivery", "Customer care"],
    hourlyRate: 650,
    certificates: ["BCE driving license"],
    workHistory: ["Courier rider", "Airport pickup driver"],
    availability: "Daily",
    ratingAverage: 4.6,
    ratingCount: 11,
    completedJobs: 2,
    kycStatus: "pending",
    isLocked: false,
    outstandingServiceFee: 0,
    badges: ["Trial Worker"],
    createdAt: now,
    updatedAt: now
  }
];

export const demoJobs: Job[] = [
  {
    id: "job-cleaning-westlands",
    clientId: "client-1",
    title: "Office deep cleaning crew",
    description: "Two-day office cleaning project in Westlands. Supplies provided, experience with commercial spaces required.",
    category: "Cleaning",
    durationHours: 16,
    rateType: "fixed",
    rateAmount: 9000,
    location: "Westlands",
    requiredSkills: ["Cleaning", "Hygiene", "Teamwork"],
    imageUrls: ["/download.webp"],
    status: "open",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "job-driver-kilimani",
    clientId: "client-2",
    title: "Weekend delivery driver",
    description: "Driver needed for Saturday retail deliveries around Kilimani, Lavington, and CBD. Valid license required.",
    category: "Driving",
    durationHours: 10,
    rateType: "hourly",
    rateAmount: 650,
    location: "Kilimani",
    requiredSkills: ["Driving", "Navigation", "Customer care"],
    imageUrls: [],
    status: "open",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "job-event-setup",
    clientId: "client-3",
    title: "Event setup assistants",
    description: "Set up chairs, signage, registration desk, and breakdown after a corporate breakfast event.",
    category: "Events",
    durationHours: 6,
    rateType: "fixed",
    rateAmount: 3600,
    location: "Upper Hill",
    requiredSkills: ["Event setup", "Lifting", "Timekeeping"],
    imageUrls: [],
    status: "open",
    createdAt: now,
    updatedAt: now
  }
];

export const demoTransactions: Transaction[] = [
  { id: "tx-1", userId: "worker-ama", jobId: "job-cleaning-westlands", type: "wallet_credit", status: "succeeded", amount: 900, serviceFee: 150, paymentType: "mpesa", mpesaReceipt: "RDE7A1TMP", createdAt: now },
  { id: "tx-2", userId: "worker-juma", jobId: "job-driver-kilimani", type: "cash_fee", status: "pending", amount: 150, paymentType: "cash", createdAt: now }
];

export const demoNotifications: AppNotification[] = [
  { id: "n1", userId: "worker-juma", title: "KYC pending", body: "Upload your National ID and selfie to unlock more applications.", read: false, href: "/settings", createdAt: now },
  { id: "n2", userId: "worker-ama", title: "Payment received", body: "KES 900 was credited to your Temp wallet.", read: false, href: "/wallet", createdAt: now }
];

export const skillTests: SkillTest[] = [
  {
    id: "cleaner-hygiene",
    category: "Cleaning",
    title: "Cleaner hygiene checklist",
    passMark: 80,
    questions: [
      { prompt: "What should be cleaned before food surfaces are sanitized?", options: ["Dust", "Visible dirt", "Windows"], answerIndex: 1 },
      { prompt: "When should gloves be changed?", options: ["Between tasks", "Once daily", "Only when torn"], answerIndex: 0 }
    ]
  },
  {
    id: "driver-safety",
    category: "Driving",
    title: "Driver safety quiz",
    passMark: 80,
    questions: [
      { prompt: "What comes first before moving a vehicle?", options: ["Music", "Mirrors and blind spots", "Phone check"], answerIndex: 1 },
      { prompt: "A red traffic light means", options: ["Stop", "Speed up", "Hoot"], answerIndex: 0 }
    ]
  }
];
