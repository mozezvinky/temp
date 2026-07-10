import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { firebaseStorageBucketName } from "./firebase-storage-bucket";

type FirebaseServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

const JSON_SERVICE_ACCOUNT_ENVS = [
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "FIREBASE_SERVICE_ACCOUNT",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "SERVICE_ACCOUNT_JSON"
] as const;

const PROJECT_ID_ENVS = ["FIREBASE_PROJECT_ID", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT"] as const;
const CLIENT_EMAIL_ENVS = ["FIREBASE_CLIENT_EMAIL", "SERVICE_ACCOUNT_CLIENT_EMAIL", "CLIENT_EMAIL"] as const;
const PRIVATE_KEY_ENVS = ["FIREBASE_PRIVATE_KEY", "SERVICE_ACCOUNT_PRIVATE_KEY", "PRIVATE_KEY"] as const;
const PRIVATE_KEY_BASE64_ENVS = ["FIREBASE_PRIVATE_KEY_BASE64", "SERVICE_ACCOUNT_PRIVATE_KEY_BASE64", "PRIVATE_KEY_BASE64"] as const;

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? trimWrappingQuotes(value) : undefined;
}

function trimWrappingQuotes(value: string) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function normalizePrivateKey(value: string, sourceName: string) {
  const privateKey = trimWrappingQuotes(value).replace(/\\n/g, "\n").trim();

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----") || !privateKey.includes("-----END PRIVATE KEY-----")) {
    throw new Error(
      `${sourceName} is malformed. Expected a PEM value containing BEGIN PRIVATE KEY and END PRIVATE KEY markers.`
    );
  }

  return privateKey;
}

function readFirstEnv(names: readonly string[]) {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return { name, value };
  }

  return undefined;
}

function readBase64PrivateKey() {
  const encoded = readFirstEnv(PRIVATE_KEY_BASE64_ENVS);
  if (!encoded) return undefined;

  try {
    return {
      name: encoded.name,
      value: Buffer.from(encoded.value, "base64").toString("utf8")
    };
  } catch {
    throw new Error(`${encoded.name} is malformed. Expected a base64 encoded Firebase private key.`);
  }
}

function parseJsonServiceAccount() {
  const source = readFirstEnv(JSON_SERVICE_ACCOUNT_ENVS);
  if (!source) return undefined;

  try {
    const parsed = JSON.parse(source.value) as {
      project_id?: string;
      projectId?: string;
      client_email?: string;
      clientEmail?: string;
      private_key?: string;
      privateKey?: string;
    };

    const missing = [
      !parsed.project_id && !parsed.projectId ? "project_id" : undefined,
      !parsed.client_email && !parsed.clientEmail ? "client_email" : undefined,
      !parsed.private_key && !parsed.privateKey ? "private_key" : undefined
    ].filter(Boolean);

    if (missing.length) {
      throw new Error(`${source.name} is missing ${missing.join(", ")}.`);
    }

    return {
      projectId: (parsed.project_id || parsed.projectId)!,
      clientEmail: (parsed.client_email || parsed.clientEmail)!,
      privateKey: normalizePrivateKey((parsed.private_key || parsed.privateKey)!, `${source.name}.private_key`)
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(source.name)) {
      throw error;
    }

    throw new Error(`${source.name} is malformed. Expected valid Firebase service account JSON.`);
  }
}

function getIndividualServiceAccount() {
  const projectId = readFirstEnv(PROJECT_ID_ENVS);
  const clientEmail = readFirstEnv(CLIENT_EMAIL_ENVS);
  const plainPrivateKey = readFirstEnv(PRIVATE_KEY_ENVS);
  const base64PrivateKey = readBase64PrivateKey();
  const privateKey = plainPrivateKey || base64PrivateKey;

  const anyConfigured = Boolean(projectId || clientEmail || privateKey);
  if (!anyConfigured) return undefined;

  const missing = [
    !projectId ? "FIREBASE_PROJECT_ID" : undefined,
    !clientEmail ? "FIREBASE_CLIENT_EMAIL" : undefined,
    !privateKey ? "FIREBASE_PRIVATE_KEY or FIREBASE_PRIVATE_KEY_BASE64" : undefined
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(`Firebase Admin service account env is incomplete. Missing: ${missing.join(", ")}.`);
  }

  return {
    projectId: projectId!.value,
    clientEmail: clientEmail!.value,
    privateKey: normalizePrivateKey(privateKey!.value, privateKey!.name)
  };
}

function getServiceAccount(): FirebaseServiceAccount | undefined {
  return parseJsonServiceAccount() || getIndividualServiceAccount();
}

function getAdminApp() {
  if (getApps().length) return getApp();

  const serviceAccount = getServiceAccount();
  if (process.env.NODE_ENV === "production" && !serviceAccount) {
    throw new Error(
      "Firebase Admin credentials missing. Production database cannot start. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
    );
  }

  return initializeApp(
    serviceAccount
      ? {
          // Deployment env vars often store PEM newlines as literal "\n"; normalize before OpenSSL sees the key.
          credential: cert(serviceAccount),
          storageBucket: firebaseStorageBucketName() || undefined
        }
      : undefined
  );
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export function adminDb() {
  return getFirestore(getAdminApp());
}

export function adminStorage() {
  return getStorage(getAdminApp());
}
