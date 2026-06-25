export function firebaseStorageBucketName() {
  const serverBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  const clientBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  return serverBucket || clientBucket || "";
}

export function firebaseStorageBucketCandidates() {
  const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  return Array.from(new Set([
    process.env.FIREBASE_STORAGE_BUCKET?.trim(),
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
    projectId ? `${projectId}.firebasestorage.app` : "",
    projectId ? `${projectId}.appspot.com` : ""
  ].filter((value): value is string => Boolean(value))));
}

export function requireFirebaseStorageBucketName() {
  const bucket = firebaseStorageBucketName().trim();
  if (!bucket) {
    throw new Error("Firebase Storage bucket is not configured.");
  }
  return bucket;
}
