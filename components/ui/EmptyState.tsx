import { Search } from "lucide-react";

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass rounded-2xl p-8 text-center">
      <Search className="mx-auto mb-4 h-9 w-9 text-bone" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-floral/70">{body}</p>
    </div>
  );
}
