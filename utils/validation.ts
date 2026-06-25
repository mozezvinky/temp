import { z } from "zod";

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
  payType: z.enum(["fixed", "timeline"]),
  payAmount: z.coerce.number().min(50, "Budget must be at least KES 50."),
  location: z.string().trim().min(1, "Please enter a location."),
  county: z.string().trim().min(1, "Please enter a county."),
  locationDetails: z.object({
    county: z.string().trim().min(1, "Please enter a county."),
    town: z.string().trim().min(1, "Please enter a town."),
    estateOrArea: z.string().trim().min(1, "Please enter an estate or area."),
    nearestLandmark: z.string().trim().min(1, "Please enter a nearby landmark."),
    addressText: z.string().trim().min(1, "Please enter an address."),
    latitude: z.number().finite(),
    longitude: z.number().finite()
  }),
  requiredSkills: z.array(z.string()).max(12, "Please add no more than 12 skills.").default([])
});

export const profileSchema = z.object({
  displayName: z.string().min(2).max(80),
  bio: z.string().max(500).optional(),
  skills: z.array(z.string()).max(20),
  hourlyRate: z.coerce.number().min(0).optional()
});
