import type { WorkerSkillProfile } from "@/types";
import { PLATFORM_FEE_RATE, roundCurrencyAmount } from "@/utils/money";

export type DirectHirePricingType = "fixed" | "timeline" | "unit";

export type DirectHirePricingSnapshot = {
  pricingType: DirectHirePricingType;
  unit?: string | null;
  workerRatePerUnit?: number | null;
  clientRatePerUnit?: number | null;
  rateAmount: number;
  ratePerUnit?: number | null;
  quantity?: number | null;
  workerSubtotal?: number;
  serviceFeeAmount?: number;
  clientTotal?: number;
  subtotal: number;
  serviceFee: number;
  total: number;
};

export function resolveSkillPricingType(skill: WorkerSkillProfile): DirectHirePricingType {
  if (resolveSkillUnit(skill)) return "unit";
  return skill.chargePayType === "unit" || skill.chargePayType === "timeline" ? skill.chargePayType : "fixed";
}

export function resolveEffectiveUnit(chargeUnit?: string | null, chargeCustomUnit?: string | null) {
  const raw = chargeUnit === "Other" ? chargeCustomUnit : chargeUnit;
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

export function resolveSkillUnit(skill: WorkerSkillProfile) {
  return resolveEffectiveUnit(skill.chargeUnit, skill.chargeCustomUnit);
}

export function singularUnit(unit: string) {
  const value = unit.trim();
  if (!value) return "Unit";
  if (/m²|km|kms|kilometers?/i.test(value)) return titleUnit(value);
  if (/ies$/i.test(value)) return titleUnit(value.replace(/ies$/i, "y"));
  if (/s$/i.test(value) && !/ss$/i.test(value)) return titleUnit(value.slice(0, -1));
  return titleUnit(value);
}

export function pluralUnit(unit: string) {
  const value = unit.trim();
  if (!value) return "Units";
  if (/m²|km|kms|kilometers?/i.test(value)) return titleUnit(value);
  if (/s$/i.test(value)) return titleUnit(value);
  if (/y$/i.test(value) && !/[aeiou]y$/i.test(value)) return titleUnit(`${value.slice(0, -1)}ies`);
  return titleUnit(`${value}s`);
}

export function perUnitText(skill: WorkerSkillProfile) {
  const unit = resolveSkillUnit(skill);
  return `per ${singularUnit(unit)}`;
}

export function payPerUnitLabel(chargeUnit?: string | null, chargeCustomUnit?: string | null) {
  const unit = resolveEffectiveUnit(chargeUnit, chargeCustomUnit);
  return unit ? `Pay per ${singularUnit(unit)}` : "Pay per selected unit";
}

export function quantityLabel(skill: WorkerSkillProfile) {
  return `Number of ${pluralUnit(resolveSkillUnit(skill))}`;
}

export function calculateDirectHirePricing(skill: WorkerSkillProfile, requestedQuantity: number): DirectHirePricingSnapshot {
  const pricingType = resolveSkillPricingType(skill);
  const workerRate = roundCurrencyAmount(Number(skill.chargeAmount ?? 0));
  const quantity = pricingType === "unit" ? Math.max(1, Math.trunc(Number(requestedQuantity) || 1)) : null;
  const feePerUnit = roundCurrencyAmount(workerRate * PLATFORM_FEE_RATE);
  const clientRate = workerRate + feePerUnit;
  const workerSubtotal = roundCurrencyAmount(workerRate * (quantity ?? 1));
  const serviceFee = pricingType === "unit"
    ? feePerUnit * (quantity ?? 1)
    : roundCurrencyAmount(workerSubtotal * PLATFORM_FEE_RATE);
  const clientTotal = pricingType === "unit"
    ? clientRate * (quantity ?? 1)
    : workerSubtotal + serviceFee;
  return {
    pricingType,
    unit: pricingType === "unit" ? singularUnit(resolveSkillUnit(skill)) : null,
    workerRatePerUnit: pricingType === "unit" ? workerRate : null,
    clientRatePerUnit: pricingType === "unit" ? clientRate : null,
    rateAmount: workerRate,
    ratePerUnit: pricingType === "unit" ? workerRate : null,
    quantity,
    workerSubtotal,
    serviceFeeAmount: serviceFee,
    clientTotal,
    subtotal: workerSubtotal,
    serviceFee,
    total: clientTotal
  };
}

function titleUnit(value: string) {
  return value.trim().replace(/\b[a-z]/g, char => char.toUpperCase());
}
