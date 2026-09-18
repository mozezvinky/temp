"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AgentNavigation() {
  const pathname = usePathname();
  return <nav className="agent-navigation" aria-label="Agent">
    {[["/agent", "Agent dashboard"], ["/agent/referrals", "My referrals"], ["/agent/earnings", "Commission ledger"]].map(([href, label]) =>
      <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>
    )}
  </nav>;
}
