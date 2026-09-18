import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function RecruitmentHero({ service, location }: { service: string | null; location: string | null }) {
  return <header className="space-y-3">
    <p className="copic-eyebrow">COPIC recruitment{location ? ` · ${location}` : ""}</p>
    <h1 className="recruitment-title">{service ? `We're looking for ${service} workers` : "Find your next opportunity on COPIC"}</h1>
    <p className="copic-muted">{service ? "Offer your services and connect with clients on COPIC." : "Join COPIC and choose the services you want to offer."}</p>
  </header>;
}

export function RecruitmentOpportunityCard({ service, rate, unit, children }: { service: string | null; rate: number | null; unit: string | null; children: ReactNode }) {
  return <Card className="recruitment-opportunity">
    {rate !== null && Number.isFinite(rate) ? <h2 className="recruitment-rate"><span>Earn KSh {rate.toLocaleString("en-KE")}</span>{unit && <span className="recruitment-unit">per {unit}</span>}</h2> : <h2 className="text-xl font-bold">{service || "Work with your skills"}</h2>}
    <p className="mt-4 copic-muted">{service ? `Clients looking for ${service} services can discover and book you on COPIC.` : "Choose and add a service to your profile to help clients find you."}</p>
    <div className="mt-7">{children}</div>
  </Card>;
}

export function RecruitmentApplyLink({ href, children, onClick }: { href: string; children: ReactNode; onClick?: () => void }) {
  return <Link href={href} onClick={onClick} className="recruitment-primary recruitment-link"><span>{children}</span><ArrowRight size={20} aria-hidden="true" className="shrink-0" /></Link>;
}

export function RecruitmentOnboardingCard({ status, onVerify, onLeave }: { status: "required" | "pending" | "complete"; onVerify: () => void; onLeave: () => void }) {
  return <Card className="recruitment-onboarding">
    <p className="copic-eyebrow">Onboarding process</p>
    <h2 className="mt-3 text-xl font-bold">{status === "complete" ? "You're all set." : status === "pending" ? "Your identity verification is in review." : "One last step — verify your identity."}</h2>
    <p className="mt-3 copic-muted">{status === "complete" ? "Your service is on your profile." : status === "pending" ? "Check your profile for verification updates." : "Help clients know they're hiring a real person."}</p>
    <div className="mt-6 flex flex-wrap items-center gap-3">
      {status === "required" && <Button className="recruitment-primary" onClick={onVerify}><ShieldCheck size={20} aria-hidden="true" />Verify my ID</Button>}
      <Link className="recruitment-secondary" href="/profile" onClick={onLeave}>Open my profile</Link>
    </div>
  </Card>;
}

export function RecruitmentState({ title, children, error = false }: { title: string; children?: ReactNode; error?: boolean }) {
  return <div className="recruitment-page"><Card><div role={error ? "alert" : "status"}><p className="copic-eyebrow">COPIC recruitment</p><h1 className="mt-3 text-2xl font-bold">{title}</h1></div>{children && <div className="mt-4 copic-muted">{children}</div>}</Card></div>;
}
