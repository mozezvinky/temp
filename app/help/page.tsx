import { Card } from "@/components/ui/Card";

const faqs = [
  ["When does chat unlock?", "Only when a client accepts a worker application or a worker accepts an invitation."],
  ["Can unverified workers apply?", "Yes, but they are limited to three applications and cannot withdraw until KYC is verified."],
  ["What happens with cash jobs?", "The worker account locks until the outstanding platform service fee is paid."],
  ["What jobs are allowed?", "Temporary jobs from 2 hours to 1 year."]
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {faqs.map(([q, a]) => <Card key={q}><h2 className="font-black">{q}</h2><p className="mt-2 text-sm text-smoky/75">{a}</p></Card>)}
    </div>
  );
}
