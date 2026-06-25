import type { Job } from "@/types";

export const durationUnits = ["minutes", "hours", "days", "weeks", "months"] as const;
export type DurationUnit = typeof durationUnits[number];

const hoursPerUnit: Record<DurationUnit, number> = {
  minutes: 1 / 60,
  hours: 1,
  days: 24,
  weeks: 168,
  months: 730
};

export function durationToHours(value: number, unit: DurationUnit) {
  return value * hoursPerUnit[unit];
}

export function durationLabel(value: number, unit: DurationUnit) {
  return `${value} ${value === 1 ? unit.replace(/s$/, "") : unit}`;
}

export function jobDurationUnit(job: Job): DurationUnit {
  return job.durationUnit ?? "hours";
}
