import { Card } from "@/components/ui/Card";

export default function AboutPage() {
  return (
    <Card className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-black">About Temp</h1>
      <p className="mt-4 text-sm text-smoky/75">Temp connects Kenyan clients with verified workers for short jobs, seasonal contracts, event shifts, cleaning, driving, support work, and longer temporary placements up to one year.</p>
      <p className="mt-3 text-sm text-smoky/75">The platform is built around Firebase realtime data, KYC controls, locked communication, wallet records, M-Pesa flows, cash-service-fee enforcement, ratings, skill tests, and admin moderation.</p>
    </Card>
  );
}
