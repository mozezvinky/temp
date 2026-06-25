export function LoadingSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4 text-center">
      <div className="temp-spinner h-12 w-12 animate-spin rounded-full border-4" />
      <p className="text-sm font-semibold text-[#CCC6BB]">{label}</p>
    </div>
  );
}
