export function LoadingSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4 text-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-bone/20 border-t-bone" />
      <p className="text-sm font-semibold text-floral/70">{label}</p>
    </div>
  );
}
