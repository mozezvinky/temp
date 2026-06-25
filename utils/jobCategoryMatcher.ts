import { jobCategoryOptions } from "@/lib/jobCategories";

type CategoryRule = {
  category: string;
  keywords: string[];
};

const categoryRules: CategoryRule[] = [
  {
    category: "Food & Hospitality",
    keywords: ["dishwasher", "dish washing", "kitchen", "cook", "chef", "waiter", "waitress", "barista", "catering", "hotel", "restaurant"]
  },
  {
    category: "Cleaning & Domestic Work",
    keywords: ["house cleaner", "cleaner", "cleaning", "laundry", "housekeeper", "nanny", "babysitter", "domestic", "caregiver", "care giving"]
  },
  {
    category: "Construction / Mjengo",
    keywords: ["plumber", "plumbing", "mason", "mjengo", "builder", "construction", "tiler", "painter", "carpenter"]
  },
  {
    category: "Digital & Online Gigs",
    keywords: ["software developer", "developer", "programmer", "website", "web design", "it support", "computer", "data entry", "graphic design", "social media"]
  },
  {
    category: "Transport & Delivery",
    keywords: ["driver", "driving", "rider", "delivery", "courier", "boda", "tuk tuk", "matatu", "loader", "moving"]
  },
  {
    category: "Student & Youth Gigs",
    keywords: ["tutor", "teacher", "teaching", "homework", "lesson", "student", "campus"]
  },
  {
    category: "Security & Manual Jobs",
    keywords: ["security guard", "guard", "watchman", "night watch", "security", "bouncer", "gate attendant"]
  },
  {
    category: "Repair & Technical Jobs",
    keywords: ["electrician", "technician", "mechanic", "repair", "cctv", "solar", "appliance"]
  }
];

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
}

export function matchJobCategory(title: string) {
  const input = normalized(title);
  if (!input) return "";

  for (const rule of categoryRules) {
    if (rule.keywords.some(keyword => input.includes(keyword) || normalized(keyword).includes(input))) {
      return rule.category;
    }
  }

  const listedMatch = jobCategoryOptions.find(category => normalized(category).includes(input) || input.includes(normalized(category)));
  return listedMatch ?? "Other";
}
