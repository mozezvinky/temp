import type { ReactNode } from "react";
import { kes } from "@/utils/money";

export type PriceLine = { label: string; amount: number };

/** Presentation only: every amount is supplied by the existing pricing logic. */
export function PriceBreakdown({ lines, totalLabel = "Client total", total, fee, workerNet, note }: {
  lines?: PriceLine[];
  totalLabel?: string;
  total: number;
  fee?: number;
  workerNet?: number;
  note?: ReactNode;
}) {
  return <div className="copic-price-breakdown">
    <dl>
      {lines?.map((line, index) => <div className="copic-price-row" key={`${line.label}-${index}`}><dt>{line.label}</dt><dd>{kes(line.amount)}</dd></div>)}
      <div className={`copic-price-row ${lines?.length ? "copic-price-total" : ""}`}><dt>{totalLabel}</dt><dd>{kes(total)}</dd></div>
      {fee !== undefined && <div className="copic-price-row"><dt>COPIC fee included</dt><dd>{kes(fee)}</dd></div>}
      {workerNet !== undefined && <div className="copic-price-row"><dt>Worker earnings</dt><dd>{kes(workerNet)}</dd></div>}
    </dl>
    {note && <p className="text-sm copic-muted">{note}</p>}
  </div>;
}
