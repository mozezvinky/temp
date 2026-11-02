import { clsx } from "clsx";
import type { HTMLAttributes, Ref } from "react";

export function Card({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return <div ref={ref} className={clsx("copic-surface copic-card rounded-[1.5rem] p-card", className)} {...props} />;
}
