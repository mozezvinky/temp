let loggedMode: string | null = null;

export function shouldUseFirebase() {
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.USE_LOCAL_SQL === "true" || process.env.DATA_BACKEND === "local-sqlite" || process.env.USE_LOCAL_SQLITE_IN_DEV === "true" || process.env.USE_FIREBASE_IN_DEV === "false") return false;
  return true;
}

export function dataMode() {
  return shouldUseFirebase() ? "firebase" : "local-sqlite";
}

export function logDataMode() {
  const mode = dataMode();
  if (loggedMode !== mode) {
    console.log(`[data-mode] ${mode}`);
    loggedMode = mode;
  }
}

export function isSqlBackend() {
  logDataMode();
  return !shouldUseFirebase();
}
