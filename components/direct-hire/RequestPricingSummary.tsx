import type { Application } from "@/types";
import { pluralUnit } from "@/utils/direct-hire-pricing";
import { kes } from "@/utils/money";

export function RequestPricingSummary({ application }: { application: Application }) {
  const pricing = application.requestPricing;
  if (!pricing) return null;
  const unit = pricing.unit ?? "Unit";
  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-[#d8d8d8] bg-white p-3 text-sm text-[#4b453e] dark:border-[#4A463F] dark:bg-[#1F1F20] dark:text-[#CCC6BB]">
      {application.requestSkillName && <p><strong className="text-[#111] dark:text-[#FFFBFF]">Skill:</strong> {application.requestSkillName}</p>}
      {pricing.pricingType === "unit" ? (
        <>
          <p><strong className="text-[#111] dark:text-[#FFFBFF]">Rate:</strong> {kes(pricing.clientRatePerUnit ?? pricing.total)} per {unit}</p>
          <p><strong className="text-[#111] dark:text-[#FFFBFF]">Number of {pluralUnit(unit)}:</strong> {pricing.quantity ?? 1}</p>
        </>
      ) : (
        <p><strong className="text-[#111] dark:text-[#FFFBFF]">Rate:</strong> {kes(pricing.total)}</p>
      )}
      <p className="rounded-lg bg-[#dff7c5] px-3 py-2 font-black text-[#203300] dark:bg-[#9df12d]">Work Total: {kes(pricing.total)}</p>
    </div>
  );
}
