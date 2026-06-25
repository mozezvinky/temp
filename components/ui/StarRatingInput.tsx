"use client";

import { Star } from "lucide-react";
import { useState } from "react";

function starTone(value: number) {
  if (value <= 0) return "text-[#959087]";
  return "text-amber-200";
}

export function StarRatingInput({ name, defaultValue = 0, label = "Rating optional" }: { name: string; defaultValue?: number; label?: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="temp-label">
      {label}
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-2 rounded-xl bg-[#2A2A2B] p-3">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            onClick={() => setValue(current => current === star ? 0 : star)}
            className={`grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/10 ${star <= value ? starTone(value) : "text-[#959087]"}`}
          >
            <Star size={24} fill={star <= value ? "currentColor" : "none"} />
          </button>
        ))}
        <span className="ml-1 text-xs font-bold text-[#959087]">{value ? `${value}/5` : "Skip"}</span>
      </div>
    </div>
  );
}
