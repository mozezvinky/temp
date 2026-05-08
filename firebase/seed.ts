import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

initializeApp({
  credential: privateKey
    ? cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey
      })
    : undefined
});

const db = getFirestore();
const stamp = FieldValue.serverTimestamp();

const demoWorkers = [
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
    badges: ["Trusted Worker", "Skill Verified"]
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
    badges: ["Trial Worker"]
  }
];

const demoJobs = [
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
    status: "open"
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
    status: "open"
  }
];

const demoTransactions = [
  { id: "tx-1", userId: "worker-ama", jobId: "job-cleaning-westlands", type: "wallet_credit", status: "succeeded", amount: 900, serviceFee: 150, paymentType: "mpesa", mpesaReceipt: "RDE7A1TMP" },
  { id: "tx-2", userId: "worker-juma", jobId: "job-driver-kilimani", type: "cash_fee", status: "pending", amount: 150, paymentType: "cash" }
];

const demoNotifications = [
  { id: "n1", userId: "worker-juma", title: "KYC pending", body: "Upload your National ID and selfie to unlock more applications.", read: false, href: "/settings" },
  { id: "n2", userId: "worker-ama", title: "Payment received", body: "KES 900 was credited to your Temp wallet.", read: false, href: "/wallet" }
];

const skillTests = [
  {
    id: "cleaner-hygiene",
    category: "Cleaning",
    title: "Cleaner hygiene checklist",
    passMark: 80,
    questions: [
      { prompt: "What should be cleaned before food surfaces are sanitized?", options: ["Dust", "Visible dirt", "Windows"], answerIndex: 1 },
      { prompt: "When should gloves be changed?", options: ["Between tasks", "Once daily", "Only when torn"], answerIndex: 0 }
    ]
  }
];

async function seed() {
  for (const user of demoWorkers) {
    await db.doc(`users/${user.id}`).set({ ...user, createdAt: stamp, updatedAt: stamp }, { merge: true });
    await db.doc(`wallets/${user.id}`).set({ id: user.id, userId: user.id, balance: 0, pendingPayouts: 0, outstandingServiceFee: user.outstandingServiceFee, updatedAt: stamp }, { merge: true });
  }
  for (const job of demoJobs) await db.doc(`jobs/${job.id}`).set({ ...job, createdAt: stamp, updatedAt: stamp }, { merge: true });
  for (const tx of demoTransactions) await db.doc(`transactions/${tx.id}`).set({ ...tx, createdAt: stamp }, { merge: true });
  for (const note of demoNotifications) await db.doc(`notifications/${note.id}`).set({ ...note, createdAt: stamp }, { merge: true });
  for (const test of skillTests) await db.doc(`skillTests/${test.id}`).set(test, { merge: true });
}

seed().then(() => {
  console.log("Seeded Temp demo data.");
  process.exit(0);
}).catch(error => {
  console.error(error);
  process.exit(1);
});
