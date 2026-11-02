import { Search } from "lucide-react";

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="copic-empty-state copic-surface rounded-2xl text-center">
      <Search size={32} className="copic-muted" aria-hidden="true" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-[#CCC6BB]">{body}</p>
    </div>
  );
}
