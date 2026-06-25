const defaultUnits = ["Hours", "Days", "Other"];

const categoryUnitMap: Array<{ keywords: string[]; units: string[] }> = [
  { keywords: ["gardening", "landscaping", "garden", "farm", "agriculture"], units: ["m²", "Acres", "Trees", "Hedges", "Hours", "Days", "Other"] },
  { keywords: ["construction", "renovation", "masonry", "mjengo", "painting", "carpentry", "plumbing", "electrical"], units: ["m²", "Rooms", "Floors", "Walls", "Units", "Days", "Other"] },
  { keywords: ["cooking", "catering", "food", "hospitality", "kitchen"], units: ["People", "Meals", "Events", "Hours", "Days", "Other"] },
  { keywords: ["driving", "transport", "delivery", "driver", "boda", "courier"], units: ["Kilometers", "Trips", "Hours", "Days", "Other"] },
  { keywords: ["cleaning", "domestic", "house cleaner", "cleaner"], units: ["Rooms", "Houses", "Offices", "m²", "Hours", "Other"] },
  { keywords: ["tutoring", "education", "teaching", "student"], units: ["Hours", "Lessons", "Students", "Days", "Other"] },
  { keywords: ["event", "staffing", "usher", "entertainment"], units: ["People", "Guests", "Hours", "Days", "Other"] }
];

export const paymentMethodOptions = [
  { value: "mpesa", label: "M-Pesa direct to worker" },
  { value: "cash", label: "Cash direct to worker" }
] as const;

export type JobPaymentMethod = typeof paymentMethodOptions[number]["value"];

export function unitsForCategory(category: string) {
  const normalized = category.toLowerCase();
  return categoryUnitMap.find(item => item.keywords.some(keyword => normalized.includes(keyword)))?.units ?? defaultUnits;
}

export function displayJobQuantity(quantity?: number | null, unit?: string | null, customUnit?: string | null) {
  if (!quantity || quantity <= 0) return "";
  const resolvedUnit = unit === "Other" ? customUnit : unit;
  return resolvedUnit ? `${quantity} ${resolvedUnit}` : String(quantity);
}
