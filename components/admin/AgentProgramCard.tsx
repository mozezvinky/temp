"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { configuredAppUrl, COPIC_PRODUCTION_APP_URL } from "@/lib/production-env";
import { AGENT_ONBOARDING_PATH } from "@/lib/agent-program";

export function AgentProgramCard() {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const url = `${configuredAppUrl() || COPIC_PRODUCTION_APP_URL}${AGENT_ONBOARDING_PATH}`;
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(url);
      setStatus("Link copied");
    } catch {
      input.current?.focus(); input.current?.select(); input.current?.setSelectionRange(0, url.length);
      try { if (!document.execCommand("copy")) throw new Error(); setStatus("Link copied"); }
      catch { setStatus("Link selected. Touch and hold, or press Ctrl/Cmd+C, to copy it."); }
    }
  }
  return <Card><p className="copic-eyebrow">Agent Program</p><h2 className="mt-3 text-xl font-bold">Recruit COPIC Agents</h2><p className="mt-3 copic-muted">Share this standard link with people who want to become COPIC Agents.</p><label className="temp-label mt-5">Standard Agent recruitment link<input ref={input} readOnly value={url} className="temp-input mt-2 w-full p-3" onFocus={event => event.target.select()} /></label><div className="mt-4 flex flex-wrap gap-3"><Button className="recruitment-primary" onClick={() => void copy()}>{status === "Link copied" ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}Copy Agent Link</Button><Link className="recruitment-secondary gap-2" href={AGENT_ONBOARDING_PATH} target="_blank" rel="noopener noreferrer">Open Link<ExternalLink size={18} aria-hidden="true" /></Link></div><p role="status" className="mt-3 min-h-6 text-sm copic-muted">{status}</p><p className="text-sm copic-muted">This link has no referring Agent. Personal Agent links recruit workers and remain in each Agent dashboard.</p></Card>;
}
