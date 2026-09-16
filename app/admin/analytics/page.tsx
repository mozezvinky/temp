"use client";
import Link from "next/link";
import { SkillsAnalytics } from "@/components/admin/SkillsAnalytics";
import { PricingConfiguration } from "@/components/admin/PricingConfiguration";
export default function AnalyticsPage(){return <div className="space-y-5"><h1 className="text-3xl font-black">Marketplace analytics</h1><div className="flex flex-wrap gap-4"><Link className="inline-flex min-h-11 items-center underline" href="/admin/recruitment">Campaign funnels and acquisition costs</Link><Link className="inline-flex min-h-11 items-center underline" href="/admin/agents">Agent commissions</Link><Link className="inline-flex min-h-11 items-center underline" href="/admin/map">Geographic supply</Link></div><SkillsAnalytics/><PricingConfiguration/></div>;}
