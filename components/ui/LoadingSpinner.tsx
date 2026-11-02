export function LoadingSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="copic-loading flex flex-col items-center justify-center gap-4 text-center">
      <div aria-hidden="true" className="temp-spinner h-8 w-8 animate-spin rounded-full border-4" />
      <p className="text-sm font-semibold text-[#CCC6BB]">{label}</p>
    </div>
  );
}
