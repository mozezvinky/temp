import "server-only";

export function serverDebug(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[Copic] ${event}`, details);
  }
}
