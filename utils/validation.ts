import { z } from "zod";

export const jobSchema = z.object({
  title: z.string().min(4).max(90),
  description: z.string().min(30).max(2500),
  category: z.string().min(2),
  durationHours: z.coerce.number().min(2).max(8760),
  rateType: z.enum(["hourly", "fixed"]),
  rateAmount: z.coerce.number().min(50),
  location: z.string().min(2),
  requiredSkills: z.array(z.string()).min(1).max(12)
});

export const profileSchema = z.object({
  displayName: z.string().min(2).max(80),
  bio: z.string().max(500).optional(),
  skills: z.array(z.string()).max(20),
  hourlyRate: z.coerce.number().min(0).optional()
});
