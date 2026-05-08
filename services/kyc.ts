"use client";

import { requireDb, requireStorage } from "@/lib/firebase";
import { doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, collection } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toUpperCase());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function submitKyc(userId: string, nationalId: string, nationalIdFile: File, selfieFile: File) {
  const db = requireDb();
  const storage = requireStorage();
  const nationalIdHash = await sha256(nationalId);
  const duplicate = await getDocs(query(collection(db, "kyc"), where("nationalIdHash", "==", nationalIdHash)));
  if (!duplicate.empty && duplicate.docs.some(d => d.data().userId !== userId)) throw new Error("This National ID is already attached to another account.");
  const [idUpload, selfieUpload] = await Promise.all([
    uploadBytes(ref(storage, `kyc/${userId}/national-id-${nationalIdFile.name}`), nationalIdFile),
    uploadBytes(ref(storage, `kyc/${userId}/selfie-${selfieFile.name}`), selfieFile)
  ]);
  await setDoc(doc(db, "kyc", userId), {
    id: userId,
    userId,
    nationalIdHash,
    nationalIdUrl: await getDownloadURL(idUpload.ref),
    selfieUrl: await getDownloadURL(selfieUpload.ref),
    phoneVerified: true,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await updateDoc(doc(db, "users", userId), { kycStatus: "pending", updatedAt: serverTimestamp() });
}

export async function reviewKyc(userId: string, adminId: string, status: "verified" | "rejected", rejectionReason?: string) {
  const db = requireDb();
  await updateDoc(doc(db, "kyc", userId), { status, rejectionReason: rejectionReason ?? null, reviewedBy: adminId, updatedAt: serverTimestamp() });
  await updateDoc(doc(db, "users", userId), { kycStatus: status, updatedAt: serverTimestamp() });
}
