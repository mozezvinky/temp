"use client";

import { useAuth } from "@/context/AuthContext";
import { logout } from "@/services/auth";
import { BriefcaseBusiness, Bell, Home, Menu, MessageCircle, Plus, ShieldCheck, UserRound, UsersRound, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, homePath } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showAppNav = !["/", "/about", "/help"].includes(pathname) && !pathname.startsWith("/auth");
  const nav = profile?.role === "client"
    ? [
        { href: "/find-work", label: "Post Work", icon: Plus },
        { href: "/workers", label: "Workers", icon: UsersRound },
        { href: "/chat", label: "Chat", icon: MessageCircle },
        { href: "/wallet", label: "Wallet", icon: Wallet },
        { href: "/notifications", label: "Alerts", icon: Bell },
        { href: "/profile", label: "Profile", icon: UserRound }
      ]
    : [
        { href: "/dashboard", label: "Dashboard", icon: Home },
        { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
        { href: "/chat", label: "Chat", icon: MessageCircle },
        { href: "/wallet", label: "Wallet", icon: Wallet },
        { href: "/notifications", label: "Alerts", icon: Bell },
        { href: "/profile", label: "Profile", icon: UserRound }
      ];

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-bone/10 bg-smoky/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href={profile ? homePath : "/"} className="text-2xl font-black tracking-tight">Temp</Link>
          {showAppNav && profile && (
            <nav className="hidden items-center gap-2 text-xs text-floral/75 md:flex">
              {nav.map(item => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} className={`relative inline-flex items-center gap-1 rounded-2xl px-3 py-2 ${active ? "bg-bone text-smoky" : "bg-olive/30"}`}>
                    <Icon size={15} /> {item.label}
                    {item.href === "/notifications" && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-bone" />}
                  </Link>
                );
              })}
            </nav>
          )}
          <nav className="hidden items-center gap-5 text-sm text-floral/75 md:flex">
            <Link href="/about">About</Link>
            <Link href="/help">Help</Link>
            {profile?.role === "admin" && <Link href="/admin" className="inline-flex items-center gap-1"><ShieldCheck size={16} /> Admin</Link>}
            {profile && (
              <div className="group relative">
                <button className="rounded-2xl bg-olive/40 px-3 py-2 text-bone">{profile.displayName?.split(" ")[0] ?? "Profile"}</button>
                <div className="absolute right-0 hidden min-w-40 rounded-2xl bg-bone p-2 text-sm text-smoky shadow-soft group-hover:block">
                  <Link href="/profile" className="block rounded-xl px-3 py-2 hover:bg-smoky/10">Profile</Link>
                  <button onClick={() => logout()} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-smoky/10">Sign out</button>
                </div>
              </div>
            )}
          </nav>
          <button aria-label="Open menu" onClick={() => setDrawerOpen(true)} className="rounded-2xl bg-bone p-2 text-smoky md:hidden"><Menu size={20} /></button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-smoky/80 backdrop-blur-md md:hidden">
          <aside className="ml-auto h-full w-80 max-w-[86vw] bg-smoky p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="text-2xl font-black">Temp</p>
              <button aria-label="Close menu" onClick={() => setDrawerOpen(false)} className="rounded-2xl bg-bone p-2 text-smoky"><X size={18} /></button>
            </div>
            <nav className="mt-8 grid gap-2">
              {(showAppNav && profile ? nav : [{ href: "/about", label: "About", icon: Home }, { href: "/help", label: "Help", icon: ShieldCheck }]).map(item => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link onClick={() => setDrawerOpen(false)} key={item.href} href={item.href} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${active ? "bg-bone text-smoky" : "bg-olive/30"}`}>
                    <Icon size={18} /> {item.label}
                  </Link>
                );
              })}
              {profile && <button onClick={() => logout()} className="rounded-2xl border border-bone/20 px-4 py-3 text-left text-bone">Sign out</button>}
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}
