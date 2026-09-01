import type { LocationFields, UserProfile, WorkerSkillProfile } from "@/types";
import { calculateDirectHirePricing, resolveSkillUnit } from "@/utils/direct-hire-pricing";
import { workerCanApplyToJob } from "@/utils/jobRules";

type SearchGroup = {
  canonical: string[];
  aliases: string[];
  tier?: 1 | 2 | 3;
};

const searchGroups: SearchGroup[] = [
  {
    canonical: ["house cleaning", "mama fua", "laundry", "clothes washing", "compound cleaning", "office cleaning", "shop cleaning", "dishwashing", "kitchen help"],
    aliases: ["cleaner", "house cleaner", "cleaning", "laundry", "washing clothes", "housekeeping", "office cleaner", "shop cleaner", "dishwasher", "kitchen helper", "mama fua", "mamaa fua", "kufua", "fua", "msafi", "usafi", "kusafisha", "kuosha nguo", "kuosha vyombo", "msaidizi wa jikoni", "cleaning job", "cleaner wa nyumba", "mtu wa usafi"],
    tier: 1
  },
  {
    canonical: ["general casual labourer", "loading", "offloading", "moving helper", "packing", "stock arrangement", "digging", "manual labour", "event setup"],
    aliases: ["casual worker", "labourer", "laborer", "loader", "offloader", "moving helper", "packer", "stock helper", "manual labour", "manual labor", "digging", "event helper", "kibarua", "mjengo helper", "mpakiaji", "kupakia", "kupakua", "kubeba", "kuchimba", "kazi ya mkono", "msaidizi wa kuhama", "mjengo", "msee wa kubeba", "kubeba vitu", "kazi ya nguvu"],
    tier: 1
  },
  {
    canonical: ["grass cutting", "weeding", "gardening", "compound clearing", "farm casual labour"],
    aliases: ["gardener", "grass cutter", "weeding", "yard work", "compound cleaner", "farm helper", "farm labour", "farm labor", "mkulima", "bustani", "kukata nyasi", "kupalilia", "kusafisha compound", "kazi ya shamba", "msee wa shamba", "grass", "compound", "shamba job"],
    tier: 1
  },
  {
    canonical: ["messenger", "errand runner", "shopping assistant", "delivery helper", "queueing errands", "collection errands"],
    aliases: ["errand runner", "errands", "messenger", "shopping helper", "delivery helper", "pickup helper", "queue helper", "mtumwa wa errands", "mjumbe", "kutumwa", "kununua vitu", "kuchukua mzigo", "kupeleka vitu", "mtu wa errands", "runner", "delivery guy", "msee wa kutuma", "enda nichukulie"],
    tier: 1
  },
  {
    canonical: ["shop assistant", "stock helper", "warehouse helper", "market helper", "sales assistant", "promotions assistant", "food service helper", "kitchen assistant"],
    aliases: ["shop attendant", "shop helper", "warehouse helper", "stock helper", "market helper", "promoter", "sales assistant", "food helper", "kitchen helper", "msaidizi wa duka", "mhudumu wa duka", "msaidizi wa stoo", "msaidizi wa soko", "msaidizi wa jikoni", "shopkeeper helper", "duka assistant", "stock guy", "promo job", "kitchen help", "duka"],
    tier: 1
  },
  {
    canonical: ["moving helper", "furniture carrying", "loading", "offloading"],
    aliases: ["mover", "moving", "lifting", "furniture mover", "loader", "offloader", "kubeba", "kuhama", "kubeba furniture", "msee wa kubeba"],
    tier: 1
  },
  {
    canonical: ["barber", "braider", "hairdresser", "nail technician", "cook", "chapati maker", "mandazi maker", "event food assistant", "housekeeper", "furniture assembler", "basic painting", "photographer", "videographer", "graphic designer", "social media assistant", "tailor", "seamstress", "clothes alterations"],
    aliases: ["kinyozi", "barber", "braids", "braider", "salon", "hairdresser", "nails", "nail tech", "cook", "mpishi", "chapati", "mandazi", "event food", "housekeeper", "assembler", "furniture assembler", "painting", "painter", "photographer", "videographer", "graphics", "graphic designer", "social media", "tailor", "seamstress", "fundis wa nguo", "clothes alterations"],
    tier: 2
  },
  {
    canonical: ["electrician", "plumber", "welder", "gas technician", "solar installer", "cctv installer", "mechanic", "appliance repair", "roofer", "construction", "pest control", "tree cutting", "security", "caregiving", "driver", "boda rider", "truck driver"],
    aliases: ["electrician", "plumber", "welder", "gas", "solar", "cctv", "mechanic", "repair", "roofer", "construction", "pest", "tree cutting", "security", "caregiver", "driver", "boda", "rider", "truck"],
    tier: 3
  }
];

export type WorkerSearchMatch = {
  worker: UserProfile;
  skill: WorkerSkillProfile;
  score: number;
  relevance: number;
  distanceKm: number | null;
};

export function normalizeSearchTerm(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreWorkerMatch(worker: UserProfile, skills: WorkerSkillProfile[], query: string, clientLocation?: LocationFields | null): WorkerSearchMatch | null {
  const normalizedQuery = normalizeSearchTerm(query);
  const terms = expandedTerms(normalizedQuery);
  let best: WorkerSearchMatch | null = null;

  for (const skill of skills) {
    const relevance = skillRelevance(worker, skill, normalizedQuery, terms);
    if (relevance <= 0) continue;
    const distanceKm = distanceBetween(clientLocation, worker.location);
    const distanceScore = distanceKm == null ? 0 : Math.max(0, 22 - Math.min(distanceKm, 44) * 0.5);
    const reputation = Math.min(Number(skill.ratingAverage || worker.ratingAverage || 0), 5) * 3 + Math.min(workerCompletedJobs(worker, skill), 30) * 0.35;
    const eligibility = workerCanApplyToJob(worker, { title: skill.name, category: skill.chargeCategory ?? skill.category, requiredSkills: [skill.name] }).ok ? 8 : -60;
    const score = relevance + distanceScore + reputation + eligibility;
    if (!best || score > best.score) best = { worker, skill, score, relevance, distanceKm };
  }

  return best;
}

export function clientRateLabel(skill: WorkerSkillProfile, formatter: (amount: number) => string) {
  const pricing = calculateDirectHirePricing(skill, 1);
  if (skill.chargePayType === "unit") return `${formatter(pricing.clientRatePerUnit ?? pricing.total)} / ${resolveSkillUnit(skill).toLowerCase() || "unit"}`;
  if (skill.chargePayType === "timeline") return `${formatter(pricing.total)} / timeline`;
  return formatter(pricing.total);
}

function expandedTerms(query: string) {
  if (!query) return [];
  const queryTerms = new Set([query]);
  for (const group of searchGroups) {
    const groupTerms = [...group.canonical, ...group.aliases].map(normalizeSearchTerm);
    if (groupTerms.some(term => term && (term === query || query.includes(term)))) {
      for (const term of groupTerms) queryTerms.add(term);
    }
  }
  return [...queryTerms].filter(Boolean);
}

function skillRelevance(worker: UserProfile, skill: WorkerSkillProfile, query: string, terms: string[]) {
  if (!query) return 0;
  const skillName = normalizeSearchTerm(skill.name);
  const category = normalizeSearchTerm(skill.chargeCategory ?? skill.category);
  const unit = normalizeSearchTerm(resolveSkillUnit(skill));
  const workerText = normalizeSearchTerm([worker.displayName, worker.bio, skill.description].filter(Boolean).join(" "));
  const haystack = [skillName, category, unit, workerText].filter(Boolean).join(" ");
  let score = 0;
  if (skillName === query || category === query) score += 120;
  if (skillName.includes(query) || query.includes(skillName)) score += 90;
  if (category.includes(query) || query.includes(category)) score += 55;
  if (workerText.includes(query)) score += 20;
  for (const term of terms) {
    if (term === skillName || term === category) score += 80;
    else if (skillName.includes(term) || category.includes(term) || term.includes(skillName)) score += 58;
    else if (haystack.includes(term)) score += 34;
  }
  const matchedGroup = searchGroups.find(group => [...group.canonical, ...group.aliases].map(normalizeSearchTerm).some(term => term && terms.includes(term) && haystack.includes(term)));
  if (matchedGroup?.tier === 2) score -= 10;
  if (matchedGroup?.tier === 3) score -= 18;
  return score;
}

function distanceBetween(first?: LocationFields | null, second?: LocationFields | null) {
  const lat1 = Number(first?.latitude);
  const lon1 = Number(first?.longitude);
  const lat2 = Number(second?.latitude);
  const lon2 = Number(second?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function workerCompletedJobs(worker: UserProfile, skill: WorkerSkillProfile) {
  return Math.max(Number(worker.completedJobs || 0), Number(skill.completedJobs || 0), Number(worker.ratingCount || 0), Number(skill.ratingCount || 0));
}
