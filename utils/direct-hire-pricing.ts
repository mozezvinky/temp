import type { WorkerSkillProfile } from "@/types";
import { PLATFORM_FEE_RATE, roundCurrencyAmount } from "@/utils/money";

export type DirectHirePricingType = "fixed" | "timeline" | "unit";

export type DirectHirePricingSnapshot = {
  pricingType: DirectHirePricingType;
  unit?: string | null;
  rateAmount: number;
  ratePerUnit?: number | null;
  quantity?: number | null;
  subtotal: number;
  serviceFee: number;
  total: number;
};

export function resolveSkillPricingType(skill: WorkerSkillProfile): DirectHirePricingType {
  return skill.chargePayType === "unit" || skill.chargePayType === "timeline" ? skill.chargePayType : "fixed";
}

export function resolveSkillUnit(skill: WorkerSkillProfile) {
  const raw = skill.chargeUnit === "Other" ? skill.chargeCustomUnit : skill.chargeUnit;
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
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

export function quantityLabel(skill: WorkerSkillProfile) {
  return `Number of ${pluralUnit(resolveSkillUnit(skill))}`;
}

export function calculateDirectHirePricing(skill: WorkerSkillProfile, requestedQuantity: number): DirectHirePricingSnapshot {
  const pricingType = resolveSkillPricingType(skill);
  const rateAmount = roundCurrencyAmount(Number(skill.chargeAmount ?? 0));
  const quantity = pricingType === "unit" ? Math.max(1, Math.trunc(Number(requestedQuantity) || 1)) : null;
  const subtotal = roundCurrencyAmount(rateAmount * (quantity ?? 1));
  const serviceFee = roundCurrencyAmount(subtotal * PLATFORM_FEE_RATE);
  return {
    pricingType,
    unit: pricingType === "unit" ? singularUnit(resolveSkillUnit(skill)) : null,
    rateAmount,
    ratePerUnit: pricingType === "unit" ? rateAmount : null,
    quantity,
    subtotal,
    serviceFee,
    total: subtotal + serviceFee
  };
}

function titleUnit(value: string) {
  return value.trim().replace(/\b[a-z]/g, char => char.toUpperCase());
}
