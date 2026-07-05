export function completedJobId(id: string) {
  const compact = id.replace(/[^a-z0-9]/gi, "").slice(0, 10).toUpperCase();
  return `CJ-${compact || "UNKNOWN"}`;
}
