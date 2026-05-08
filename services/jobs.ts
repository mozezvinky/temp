"use client";

import { db, storage } from "@/lib/firebase";
import type { Application, Job, UserProfile } from "@/types";
import { jobSchema } from "@/utils/validation";
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

export function subscribeOpenJobs(callback: (jobs: Job[]) => void) {
  return onSnapshot(query(collection(db, "jobs"), where("status", "==", "open"), orderBy("createdAt", "desc"), limit(40)), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Job));
  });
}

export async function uploadJobImages(clientId: string, files: File[]) {
  const uploads = files.map(async file => {
    const path = `jobs/${clientId}/${crypto.randomUUID()}-${file.name}`;
    const uploaded = await uploadBytes(ref(storage, path), file, { contentType: file.type });
    return getDownloadURL(uploaded.ref);
  });
  return Promise.all(uploads);
}

export async function createJob(clientId: string, input: unknown, imageUrls: string[] = []) {
  const job = jobSchema.parse(input);
  return addDoc(collection(db, "jobs"), {
    ...job,
    clientId,
    imageUrls,
    status: "open",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function canWorkerApply(worker: UserProfile) {
  if (worker.isLocked) return { ok: false, reason: worker.lockReason ?? "Account locked until outstanding service fee is paid." };
  if (worker.kycStatus === "verified") return { ok: true };
  const q = query(collection(db, "applications"), where("workerId", "==", worker.id), limit(4));
  const count = await getCountFromServer(q);
  return count.data().count < 3 ? { ok: true } : { ok: false, reason: "KYC required after three applications." };
}

export async function applyToJob(job: Job, worker: UserProfile, coverNote: string) {
  const allowed = await canWorkerApply(worker);
  if (!allowed.ok) throw new Error(allowed.reason);
  await addDoc(collection(db, "applications"), {
    jobId: job.id,
    workerId: worker.id,
    clientId: job.clientId,
    coverNote,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function acceptApplication(application: Application) {
  await updateDoc(doc(db, "applications", application.id), { status: "accepted", updatedAt: serverTimestamp() });
  await updateDoc(doc(db, "jobs", application.jobId), {
    status: "assigned",
    hiredWorkerId: application.workerId,
    updatedAt: serverTimestamp()
  });
  await setDoc(doc(db, "messages", `${application.jobId}_${application.workerId}`), {
    id: `${application.jobId}_${application.workerId}`,
    jobId: application.jobId,
    clientId: application.clientId,
    workerId: application.workerId,
    locked: false,
    participants: [application.clientId, application.workerId],
    updatedAt: serverTimestamp()
  });
}

export async function savedJobs(userId: string) {
  const snap = await getDocs(collection(db, "users", userId, "savedJobs"));
  return snap.docs.map(d => d.id);
}
