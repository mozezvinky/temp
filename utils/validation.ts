import { z } from "zod";
import { isPayPerTimeline, timelinePaymentSummary } from "@/utils/timeline-payments";

export const jobSchema = z.object({
  title: z.string().trim().min(1, "Please enter a job title.").max(90, "Job title is too long."),
  description: z.string().trim().min(1, "Please enter a job description.").max(2500, "Job description is too long."),
  category: z.string().trim().min(1, "Please select a category."),
  duration: z.string().trim().min(1, "Please enter a duration."),
  durationValue: z.coerce.number().positive("Please enter a work timeline."),
  durationUnit: z.enum(["minutes", "hours", "days", "weeks", "months"]),
  durationHours: z.coerce.number().positive("Please enter a work timeline.").max(8760, "Job duration cannot exceed 1 year."),
  workersNeeded: z.coerce.number().int("Number of workers must be a whole number.").min(1, "Please request at least one worker.").max(100, "Please request 100 workers or fewer.").default(1),
  quantity: z.preprocess(value => value === "" || value === null || typeof value === "undefined" ? undefined : value, z.coerce.number().positive("Quantity must be greater than zero.").optional()),
  unit: z.preprocess(value => value === "" || value === null || typeof value === "undefined" ? undefined : value, z.string().trim().max(40, "Unit is too long.").optional()),
  customUnit: z.preprocess(value => value === "" || value === null || typeof value === "undefined" ? undefined : value, z.string().trim().max(60, "Custom unit is too long.").optional()),
  paymentMethod: z.enum(["mpesa", "cash"]).default("mpesa"),
  payType: z.enum(["fixed", "timeline", "pay_per_timeline"]),
  payAmount: z.coerce.number().min(50, "Budget must be at least KES 50."),
  timelineCount: z.preprocess(value => value === "" || value === null || typeof value === "undefined" ? undefined : value, z.coerce.number().int("Timeline count must be a whole number.").min(1, "Timeline count must be at least 1.").optional()),
  clientPayPerTimeline: z.preprocess(value => value === "" || value === null || typeof value === "undefined" ? undefined : value, z.coerce.number().optional()),
  location: z.string().trim().min(1, "Please enter a location."),
  county: z.string().trim().min(1, "Please enter a county."),
  locationDetails: z.object({
    county: z.string().trim().min(1, "Please enter a county."),
    town: z.string().trim().min(1, "Please enter a town."),
    estateOrArea: z.string().trim().min(1, "Please enter an estate or area."),
    nearestLandmark: z.string().trim().min(1, "Please enter a nearby landmark."),
    addressText: z.string().trim().min(1, "Please enter an address."),
    landmark: z.object({
      name: z.string().trim().min(1),
      placeId: z.string().trim().min(1),
      distanceMeters: z.number().finite().nonnegative()
    }).optional(),
    area: z.string().trim().optional(),
    city: z.string().trim().optional(),
    displayLocation: z.string().trim().optional(),
    locationSource: z.enum(["current", "manual", "network"]).optional(),
    landmarkResolved: z.boolean().optional(),
    locationDescription: z.string().trim().max(500, "Location description is too long.").optional(),
    latitude: z.number().finite(),
    longitude: z.number().finite()
  }),
  requiredSkills: z.array(z.string()).max(12, "Please add no more than 12 skills.").default([])
}).superRefine((value, context) => {
  if (value.locationDetails.locationSource === "current" && value.locationDetails.landmarkResolved === false && !value.locationDetails.locationDescription?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["locationDetails", "locationDescription"],
      message: "Add a location description when no nearby landmark is found."
    });
  }
  if (!isPayPerTimeline(value.payType)) return;
  const clientPay = Number(value.clientPayPerTimeline ?? value.payAmount);
  const timelineCount = Number(value.timelineCount ?? value.durationValue);
  if (!Number.isFinite(timelineCount) || timelineCount < 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["timelineCount"], message: "Timeline count must be at least 1." });
  }
  if (!Number.isFinite(clientPay) || clientPay < 50) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["clientPayPerTimeline"], message: "Pay per timeline must be at least KES 50." });
  }
  if (timelinePaymentSummary(clientPay, timelineCount).workerPayPerTimeline < 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["clientPayPerTimeline"], message: "Worker pay per timeline cannot be negative." });
  }
}).transform(value => {
  if (!isPayPerTimeline(value.payType)) return value;
  const summary = timelinePaymentSummary(Number(value.clientPayPerTimeline ?? value.payAmount), Number(value.timelineCount ?? value.durationValue));
  return {
    ...value,
    payType: "pay_per_timeline" as const,
    payAmount: summary.clientPayPerTimeline,
    timelineCount: summary.timelineCount,
    clientPayPerTimeline: summary.clientPayPerTimeline,
    workerPayPerTimeline: summary.workerPayPerTimeline,
    totalClientAmount: summary.totalClientAmount,
    totalWorkerAmount: summary.totalWorkerAmount,
    totalPlatformFee: summary.totalPlatformFee
  };
});

export const profileSchema = z.object({
  displayName: z.string().min(2).max(80),
  bio: z.string().max(500).optional(),
  skills: z.array(z.string()).max(20),
  hourlyRate: z.coerce.number().min(0).optional()
});
