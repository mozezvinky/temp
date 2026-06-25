import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("copic-surface copic-card rounded-[1.5rem] p-5 md:p-6", className)} {...props} />;
}
