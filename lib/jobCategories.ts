export const jobCategories = [
  {
    group: "Transport & Delivery",
    items: ["Boda boda rider", "Tuk tuk driver", "Matatu conductor", "Parcel delivery rider", "Courier rider", "Moving helper", "Loader/offloader", "Truck assistant", "Errand runner"]
  },
  {
    group: "Construction / Mjengo",
    items: ["Mason assistant", "Construction helper", "Painter", "Tiler", "Plumber assistant", "Electrician assistant", "Site cleaner", "Fundis helper", "Carpenter assistant"]
  },
  {
    group: "Cleaning & Domestic Work",
    items: ["House cleaner", "Office cleaner", "Laundry helper", "Car wash attendant", "Compound cleaner", "Domestic assistant", "Deep cleaning crew"]
  },
  {
    group: "Food & Hospitality",
    items: ["Waiter", "Kitchen assistant", "Cook", "Barista", "Dishwasher", "Catering assistant", "Hotel room attendant", "Food delivery assistant"]
  },
  {
    group: "Retail & Street Selling",
    items: ["Shop attendant", "Sales promoter", "Market stall assistant", "Stock taker", "Cashier assistant", "Merchandiser", "Street vendor assistant"]
  },
  {
    group: "Events & Entertainment",
    items: ["Usher", "Event setup crew", "DJ assistant", "Sound assistant", "Decorator", "Ticketing assistant", "Brand ambassador", "Security steward"]
  },
  {
    group: "Beauty & Fashion",
    items: ["Hair stylist", "Barber", "Makeup artist", "Nail technician", "Tailor assistant", "Fashion model", "Salon assistant"]
  },
  {
    group: "Repair & Technical Jobs",
    items: ["Phone repair assistant", "Appliance repair helper", "Computer technician", "Mechanic assistant", "CCTV installer", "Solar technician assistant"]
  },
  {
    group: "Agriculture & Rural Casual Work",
    items: ["Farm worker", "Harvesting helper", "Milking assistant", "Poultry assistant", "Irrigation helper", "Greenhouse worker"]
  },
  {
    group: "Digital & Online Gigs",
    items: ["Data entry", "Social media assistant", "Content moderator", "Online researcher", "Transcriptionist", "Virtual assistant", "Graphic design assistant"]
  },
  {
    group: "Student & Youth Gigs",
    items: ["Campus ambassador", "Flyer distributor", "Tutor", "Survey assistant", "Queue assistant", "Library assistant"]
  },
  {
    group: "Security & Manual Jobs",
    items: ["Security guard", "Night watch", "Gate attendant", "Manual laborer", "Warehouse assistant", "Crowd control assistant"]
  },
  {
    group: "Jua Kali / Artisan Work",
    items: ["Welder assistant", "Metalwork helper", "Woodwork assistant", "Shoe repair assistant", "Upholstery assistant", "Signage assistant"]
  },
  {
    group: "New-Age Urban Hustles",
    items: ["Personal shopper", "Queue runner", "Apartment viewing assistant", "Pet care helper", "Home organizer", "Errand concierge"]
  },
  {
    group: "Other",
    items: ["Other (Custom Job Entry)"]
  }
];

export function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = value.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const jobCategoryOptions = uniqueStrings(jobCategories.map(category => category.group));
export const flatJobCategories = uniqueStrings(jobCategories.flatMap(category => category.items));
