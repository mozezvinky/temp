"use client";

import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Activity, BadgeCheck, BriefcaseBusiness, Coins, FileWarning, Headphones, LayoutDashboard, Settings, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { loading, isAuthorized } = useProtectedRoute(["admin"]);
  const pathname = usePathname();
  if (loading || !isAuthorized) return <LoadingSpinner label="Checking admin access" />;
  const links = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/support", label: "Tickets", icon: Headphones },
    { href: "/admin/users", label: "Users", icon: UsersRound },
    { href: "/admin/skills", label: "Skills", icon: BadgeCheck },
    { href: "/admin/admins", label: "Admins", icon: ShieldCheck },
    { href: "/admin/kyc", label: "ID Verification Requests", icon: ShieldCheck },
    { href: "/admin/service-fees", label: "Service Fees", icon: Coins },
    { href: "/admin/jobs", label: "Jobs", icon: BriefcaseBusiness },
    { href: "/admin/disputes", label: "Disputes", icon: FileWarning },
    { href: "/admin/reports", label: "Reports", icon: FileWarning },
    { href: "/admin/audit", label: "Audit", icon: Activity },
    { href: "/admin/settings", label: "Settings", icon: Settings }
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <aside className="temp-sidebar copic-surface sticky top-4 h-fit rounded-2xl p-3">
        <p className="px-3 py-2 text-xs font-black uppercase tracking-[.18em] text-[#959087]">Control Center</p>
        <nav className="mt-2 grid gap-1">
          {links.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return <Link key={item.href} href={item.href} className={`temp-sidebar-link flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black ${active ? "is-active" : ""}`}><Icon size={16} /> {item.label}</Link>;
          })}
        </nav>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
