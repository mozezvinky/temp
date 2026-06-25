"use client";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadRatings } from "@/services/ratings";
import type { Rating } from "@/types";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";

export function RatingHistory({ userId }: { userId: string }) {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [aggregate, setAggregate] = useState<{ average: number; count: number; breakdown: Record<number, number> }>({ average: 0, count: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });

  useEffect(() => {
    void loadRatings(userId).then(result => {
      setRatings(result.ratings);
      setAggregate(result.aggregate);
    }).catch(() => setRatings([]));
  }, [userId]);

  return (
    <Card>
      <h2 className="text-xl font-black text-[#FFFBFF]">Job ratings</h2>
      <div className="mt-4 rounded-xl bg-[#2A2A2B] p-4">
        <p className="rating-score inline-flex items-center gap-2 text-2xl font-black"><Star size={20} fill="currentColor" /> {aggregate.average.toFixed(1)}</p>
        <p className="mt-1 text-sm text-[#959087]">{aggregate.count} total review{aggregate.count === 1 ? "" : "s"}</p>
        <div className="mt-3 grid gap-1 text-xs text-[#CCC6BB]">
          {[5, 4, 3, 2, 1].map(stars => <p key={stars} className="flex justify-between"><span>{stars} star</span><strong>{aggregate.breakdown[stars] ?? 0}</strong></p>)}
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {ratings.length ? ratings.map(rating => (
          <div key={rating.id} className="rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-black text-[#FFFBFF]">{rating.jobTitle ?? "Completed job"}</p>
              <p className="rating-score inline-flex items-center gap-1 font-black"><Star size={16} fill="currentColor" /> {rating.stars}/5</p>
            </div>
            {rating.review && <p className="mt-2 text-sm text-[#959087]">{rating.review}</p>}
          </div>
        )) : <EmptyState title="No job ratings yet" body="Ratings from completed jobs will appear here." />}
      </div>
    </Card>
  );
}
