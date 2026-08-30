"use client";

import { useAuth } from "@/context/AuthContext";
import { AppModal } from "@/components/ui/AppModal";
import { Button } from "@/components/ui/Button";
import { activateProfileRole, authErrorMessage, logout } from "@/services/auth";
import { markNotificationRead, subscribeNotifications } from "@/services/notifications";
import { loadServiceFeePayment, loadServiceFeePaywallState } from "@/services/service-fee";
import type { AppNotification, Role, ServiceFeePayment, ServiceFeePaywallState } from "@/types";
import { RoleModeToggle, ThemeModeSwitch, type UiTheme } from "@/components/layout/NavControls";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BriefcaseBusiness, ChevronDown, CircleHelp, ClipboardCheck, Coins, FileWarning, Headphones, History, Home, Menu, MessageCircle, Settings, ShieldCheck, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

function roleHome(role: Role) {
  return role === "client" ? "/find-work" : role === "worker" ? "/jobs" : "/admin";
}

function canLockedWorkerAccess(pathname: string) {
  return pathname === "/dashboard"
    || pathname.startsWith("/auth")
    || pathname.startsWith("/profile")
    || pathname.startsWith("/account-settings")
    || pathname.startsWith("/settings")
    || pathname.startsWith("/help")
    || pathname.startsWith("/faq")
    || pathname.startsWith("/chat")
    || pathname.startsWith("/applications")
    || pathname.startsWith("/completed-requests")
    || pathname.startsWith("/notifications");
}

function serviceFeeAmountFromAlert(item: AppNotification) {
  const text = `${item.title} ${item.body}`;
  if (!/service fee/i.test(text)) return 0;
  const amount = Number(text.match(/KES\s*([\d,]+)/i)?.[1]?.replace(/,/g, "") ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const isLanding = pathname === "/";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [uiTheme, setUiTheme] = useState<UiTheme>("light");
  const [switchingRole, setSwitchingRole] = useState<Role | null>(null);
  const [topAlerts, setTopAlerts] = useState<AppNotification[]>([]);
  const [serviceFeePayment, setServiceFeePayment] = useState<ServiceFeePayment | null>(null);
  const [serviceFeePaywall, setServiceFeePaywall] = useState<ServiceFeePaywallState | null>(null);
  const [dismissedTopAlertIds, setDismissedTopAlertIds] = useState<string[]>([]);
  const [viewedTopAlertIds, setViewedTopAlertIds] = useState<string[]>([]);
  const [topAlertDetail, setTopAlertDetail] = useState<AppNotification | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const showAppNav = !!profile && !pathname.startsWith("/auth");
  const profileId = profile?.id;
  const profileRole = profile?.role;
  const pendingServiceFeeAmount = !!serviceFeePayment && serviceFeePayment.status !== "approved" && serviceFeePayment.status !== "rejected"
    ? Number(serviceFeePayment.amount ?? 0)
    : 0;
  const accountLocked = !!profile && profile.role !== "admin" && (
    profile.isLocked ||
    Number(profile.outstandingServiceFee ?? 0) > 0 ||
    pendingServiceFeeAmount > 0 ||
    serviceFeePaywall?.accountRestricted === true ||
    serviceFeePaywall?.shouldShowPaywall === true
  );

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("copic.uiTheme") === "dark" ? "dark" : "light";
    setUiTheme(savedTheme);
    document.documentElement.dataset.uiTheme = savedTheme;
  }, []);

  function toggleUiTheme() {
    const next: UiTheme = uiTheme === "dark" ? "light" : "dark";
    setUiTheme(next);
    document.documentElement.dataset.uiTheme = next;
    window.localStorage.setItem("copic.uiTheme", next);
  }

  useEffect(() => {
    setDrawerOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!profileId || profileRole !== "worker") {
      setServiceFeePayment(null);
      setServiceFeePaywall(null);
      return;
    }
    let cancelled = false;
    void Promise.all([loadServiceFeePayment(), loadServiceFeePaywallState()])
      .then(([payment, paywall]) => {
        if (cancelled) return;
        setServiceFeePayment(payment);
        setServiceFeePaywall(paywall);
      })
      .catch(() => {
        if (!cancelled) {
          setServiceFeePayment(null);
          setServiceFeePaywall(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, profileRole, profile?.isLocked, profile?.outstandingServiceFee]);

  useEffect(() => {
    if (!accountLocked) return;
    setDrawerOpen(false);
    setProfileOpen(false);
    if (!canLockedWorkerAccess(pathname)) router.replace("/dashboard");
  }, [accountLocked, pathname, router]);

  useEffect(() => {
    setTopAlerts([]);
    setDismissedTopAlertIds([]);
    if (profileId) {
      try {
        const raw = window.localStorage.getItem(`copic.viewedTopAlerts.${profileId}`);
        setViewedTopAlertIds(raw ? JSON.parse(raw) as string[] : []);
      } catch {
        setViewedTopAlertIds([]);
      }
    } else {
      setViewedTopAlertIds([]);
    }
    if (!profileId || profileRole === "admin") return;
    return subscribeNotifications(profileId, items => {
      const serviceFeeAlert = items.find(item => serviceFeeAmountFromAlert(item) > 0);
      if (serviceFeeAlert) {
        const profileHasServiceFeeDebt = !!profile?.isLocked || Number(profile?.outstandingServiceFee ?? 0) > 0 || pendingServiceFeeAmount > 0 || serviceFeePaywall?.accountRestricted === true || serviceFeePaywall?.shouldShowPaywall === true;
        if (!profileHasServiceFeeDebt) {
          void refreshProfile();
          setTopAlerts(items.filter(item => !item.read).slice(0, 8));
          return;
        }
        void Promise.all([loadServiceFeePayment(), loadServiceFeePaywallState()])
          .then(([payment, paywall]) => {
            setServiceFeePayment(payment);
            setServiceFeePaywall(paywall);
            void refreshProfile();
            if (paywall?.shouldShowPaywall && pathname !== "/dashboard") router.replace("/dashboard");
          })
          .catch(() => {
            if (pathname !== "/dashboard") router.replace("/dashboard");
          });
      }
      setTopAlerts(items.filter(item => !item.read).slice(0, 8));
    }, () => setTopAlerts([]));
  }, [pathname, pendingServiceFeeAmount, profile?.isLocked, profile?.outstandingServiceFee, profileId, profileRole, refreshProfile, router, serviceFeePaywall?.accountRestricted, serviceFeePaywall?.shouldShowPaywall]);

  useEffect(() => {
    const serviceFeeAlert = topAlerts.find(item => serviceFeeAmountFromAlert(item) > 0);
    if (serviceFeeAlert) {
      const profileHasServiceFeeDebt = !!profile?.isLocked || Number(profile?.outstandingServiceFee ?? 0) > 0 || pendingServiceFeeAmount > 0 || serviceFeePaywall?.accountRestricted === true || serviceFeePaywall?.shouldShowPaywall === true;
      if (!profileHasServiceFeeDebt) {
        void refreshProfile();
        return;
      }
      void Promise.all([loadServiceFeePayment(), loadServiceFeePaywallState()])
        .then(([payment, paywall]) => {
          setServiceFeePayment(payment);
          setServiceFeePaywall(paywall);
          void refreshProfile();
        })
        .catch(() => undefined);
      if (pathname !== "/dashboard") router.replace("/dashboard");
    }
    if (topAlerts.some(item =>
      item.title === "Account action required" ||
      item.title === "Account unlocked" ||
      item.title === "Payment rejected" ||
      item.title === "Account verified" ||
      item.title === "ID verification rejected"
    )) {
      if (topAlerts.some(item => item.title === "Account unlocked")) {
        void loadServiceFeePaywallState().then(setServiceFeePaywall).catch(() => undefined);
      }
      void refreshProfile();
    }
  }, [pathname, pendingServiceFeeAmount, profile?.isLocked, profile?.outstandingServiceFee, refreshProfile, router, serviceFeePaywall?.accountRestricted, serviceFeePaywall?.shouldShowPaywall, topAlerts]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  useEffect(() => {
    const selector = '.temp-modal-backdrop, .fixed.inset-0.grid.place-items-center[class*="bg-black"]';
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const syncScrollLock = () => {
      const modalOpen = !!document.querySelector(selector);
      document.body.classList.toggle("copic-modal-open", modalOpen);
      document.body.style.overflow = modalOpen ? "hidden" : originalBodyOverflow;
      document.documentElement.style.overflow = modalOpen ? "hidden" : originalHtmlOverflow;
    };
    const observer = new MutationObserver(syncScrollLock);
    observer.observe(document.body, { childList: true, subtree: true });
    syncScrollLock();
    return () => {
      observer.disconnect();
      document.body.classList.remove("copic-modal-open");
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    if (!accountLocked) return;
    const scrollY = window.scrollY;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [accountLocked]);

  async function signOutToLanding() {
    setProfileOpen(false);
    setDrawerOpen(false);
    await logout();
    window.location.assign("/");
  }

  async function switchRole(nextRole: Role) {
    if (!user || !profile || profile.role === nextRole || nextRole === "admin") return;
    setSwitchingRole(nextRole);
    try {
      const savedRole = await activateProfileRole(
        user,
        nextRole,
        profile.displayName ?? user.displayName ?? user.email?.split("@")[0] ?? "Copic user",
        profile.email ?? user.email ?? undefined,
        profile.phoneNumber ?? user.phoneNumber ?? undefined
      );
      toast.success(`Switched to ${savedRole}.`);
      window.location.assign(roleHome(savedRole));
    } catch (error) {
      toast.error(authErrorMessage(error));
      setSwitchingRole(null);
    }
  }

  useEffect(() => {
    if (!profileOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [profileOpen]);

  const nav = profile?.role === "admin"
    ? [
        { href: "/admin", label: "Overview", icon: Home },
        { href: "/admin/support", label: "Tickets", icon: Headphones },
        { href: "/admin/users", label: "Users", icon: UsersRound },
        { href: "/admin/admins", label: "Admins", icon: ShieldCheck },
        { href: "/admin/kyc", label: "ID Verification", icon: ClipboardCheck },
        { href: "/admin/service-fees", label: "Service Fees", icon: Coins },
        { href: "/admin/jobs", label: "Jobs", icon: BriefcaseBusiness },
        { href: "/admin/disputes", label: "Disputes", icon: FileWarning },
        { href: "/admin/reports", label: "Reports", icon: FileWarning },
        { href: "/admin/audit", label: "Audit", icon: History },
        { href: "/admin/settings", label: "Settings", icon: Settings }
      ]
    : profile?.role === "client"
    ? [
        { href: "/find-work", label: "Posted Work", icon: BriefcaseBusiness },
        { href: "/workers", label: "Workers", icon: UsersRound },
        { href: "/chat", label: "Chat", icon: MessageCircle },
        { href: "/notifications", label: "Alerts", icon: Bell },
        { href: "/help", label: "Help", icon: CircleHelp }
      ]
    : [
        { href: "/dashboard", label: "Dashboard", icon: Home },
        { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
        { href: "/chat", label: "Chat", icon: MessageCircle },
        { href: "/notifications", label: "Alerts", icon: Bell },
        { href: "/help", label: "Help", icon: CircleHelp }
      ];

  const publicLinks: Array<{ href: string; label: string; icon: typeof Home }> = [
    { href: "/", label: "Home", icon: Home },
    { href: "/about", label: "About", icon: UsersRound },
    { href: "/help", label: "Help", icon: CircleHelp }
  ];
  const links = showAppNav && profile ? nav : publicLinks;
  const profilePhoto = profile?.photoURL
    ? {
        photoURL: profile.photoURL,
        photoPositionX: profile.photoPositionX ?? 50,
        photoPositionY: profile.photoPositionY ?? 50,
        photoZoom: profile.photoZoom ?? 1
      }
    : null;
  const canSwitchRole = !accountLocked && (profile?.role === "worker" || profile?.role === "client");
  const visibleTopAlerts = topAlerts.filter(item => !dismissedTopAlertIds.includes(item.id) && !viewedTopAlertIds.includes(item.id));
  const topAlert = visibleTopAlerts[0];
  const topAlertBody = topAlert?.title === "Account action required"
    ? topAlert.body || "Open your dashboard to continue using Copic."
    : topAlert?.title === "Payment rejected"
      ? `Your payment was rejected. Please retry.${topAlert.body && !topAlert.body.toLowerCase().includes("please retry") ? ` ${topAlert.body}` : ""}`
    : topAlert?.body;
  const topAlertDetailBody = topAlertDetail?.title === "Account action required"
    ? topAlertDetail.body || "Open your dashboard to continue using Copic."
    : topAlertDetail?.title === "Payment rejected"
      ? `Your payment was rejected. Please retry.${topAlertDetail.body && !topAlertDetail.body.toLowerCase().includes("please retry") ? ` ${topAlertDetail.body}` : ""}`
    : topAlertDetail?.body;
  const topAlertActionLabel = topAlertDetail?.title === "Account action required" || topAlertDetail?.title === "Payment rejected"
    ? "Open dashboard"
    : topAlertDetail?.title === "Completion requested"
      ? "View completed requests"
    : topAlertDetail?.title === "New application"
      ? "Review application"
      : "Open action";
  const topAlertActionHref = topAlertDetail?.title === "Completion requested"
    ? "/completed-requests"
    : topAlertDetail?.href;

  const rememberViewedTopAlerts = useCallback((ids: string[]) => {
    if (!profileId || !ids.length) return;
    const next = [...new Set([...viewedTopAlertIds, ...ids])];
    setViewedTopAlertIds(next);
    window.localStorage.setItem(`copic.viewedTopAlerts.${profileId}`, JSON.stringify(next));
    ids.forEach(id => void markNotificationRead(id).catch(() => undefined));
  }, [profileId, viewedTopAlertIds]);

  const dismissTopAlert = useCallback((alert?: AppNotification | null) => {
    if (!alert) return;
    setDismissedTopAlertIds(current => [...new Set([...current, alert.id])]);
    rememberViewedTopAlerts([alert.id]);
  }, [rememberViewedTopAlerts]);

  function openTopAlert(alert?: AppNotification | null) {
    if (!alert) return;
    setTopAlertDetail(alert);
    rememberViewedTopAlerts([alert.id]);
  }

  useEffect(() => {
    if (!topAlert) return;
    const timeout = window.setTimeout(() => dismissTopAlert(topAlert), 5000);
    return () => window.clearTimeout(timeout);
  }, [dismissTopAlert, topAlert]);

  return (
    <div className="temp-app-shell min-h-screen">
      <header className={`temp-navbar sticky top-0 z-40 ${isLanding ? "is-landing" : ""} ${showAppNav && !isAdmin ? "is-app-nav" : ""} ${isAdmin ? "is-admin-nav" : ""}`}>
        <AnimatePresence>
          {visibleTopAlerts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -28 }}
              drag="y"
              dragConstraints={{ top: -80, bottom: 0 }}
              dragElastic={0.18}
              onDragEnd={(_, info) => {
                if (info.offset.y < -35 || info.velocity.y < -300) dismissTopAlert(topAlert);
              }}
              className="temp-top-alert px-4"
            >
              <div className="temp-top-alert-pill mx-auto flex items-center text-sm">
                <button type="button" onClick={() => openTopAlert(topAlert)} className="min-w-0 flex-1 truncate text-left font-semibold text-white/80">
                  <span>{topAlert?.title}{topAlertBody ? ": " : ""}</span>
                  <span>{topAlertBody}</span>
                  {visibleTopAlerts.length > 1 && <span className="temp-top-alert-more ml-2">+{visibleTopAlerts.length - 1} more</span>}
                </button>
                <button
                  type="button"
                  className="temp-top-alert-dismiss"
                  onClick={() => dismissTopAlert(topAlert)}
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className={`temp-navbar-inner mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 md:px-8 ${isAdmin ? "min-h-[54px]" : "min-h-[68px]"}`}>
          <div className="flex min-w-0 items-center gap-3">
            {showAppNav && profile && canSwitchRole ? (
              <RoleModeToggle activeRole={profile.role as "worker" | "client"} switchingRole={switchingRole} onSwitch={role => void switchRole(role)} />
            ) : (
              <Link href={showAppNav && profile ? roleHome(profile.role) : "/"} className="temp-navbar-brand">Copic</Link>
            )}
          </div>
          {showAppNav && profile && (
            <nav className={`temp-navbar-links hidden min-w-0 items-center md:flex ${isAdmin ? "temp-navbar-links-admin justify-end" : "justify-center gap-1"}`}>
              {nav.map(item => {
                const Icon = item.icon;
                const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} className={`temp-navbar-link relative inline-flex items-center ${isAdmin ? "temp-navbar-link-admin gap-1.5" : "gap-2"} ${active ? "is-active" : ""}`}>
                    <Icon size={isAdmin ? 12 : 15} className="temp-navbar-link-icon shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.href === "/notifications" && visibleTopAlerts.length > 0 && <span className="temp-alert-dot" />}
                  </Link>
                );
              })}
            </nav>
          )}
          {!showAppNav && publicLinks.length > 0 && (
            <nav className="temp-navbar-links hidden items-center gap-1 md:flex">
              {publicLinks.map(item => <Link className={`temp-navbar-link relative ${pathname === item.href ? "is-active" : ""}`} key={item.href} href={item.href}>{item.label}</Link>)}
            </nav>
          )}
          {profile ? (
            <div className="hidden items-center gap-2 md:flex">
              <ThemeModeSwitch theme={uiTheme} onToggle={toggleUiTheme} />
              <div ref={profileMenuRef} className="relative h-10 shrink-0">
                <button onClick={() => setProfileOpen(open => !open)} className="temp-navbar-profile">
                  <span className="temp-navbar-profile-photo grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-bone text-sm font-black text-[#1E1B13]">
                    {profilePhoto ? <NavProfilePhoto photo={profilePhoto} alt={profile.displayName ?? "Profile"} /> : profile.displayName?.charAt(0).toUpperCase() ?? "T"}
                  </span>
                  <span className="hidden max-w-24 truncate xl:block">{profile.displayName?.split(" ")[0] ?? "Profile"}</span>
                  <ChevronDown size={16} className={`text-[#959087] transition ${profileOpen ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {profileOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.16 }}
                      className="copic-panel temp-profile-menu absolute right-0 top-full mt-2 w-56 rounded-2xl p-2"
                    >
                      <Link onClick={() => setProfileOpen(false)} href="/profile" className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-[#CCC6BB] hover:bg-[#2A2A2B] hover:text-[#FFFBF4]">Profile</Link>
                      <button onClick={() => void signOutToLanding()} className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#CCC6BB] hover:bg-[#2A2A2B] hover:text-[#FFFBF4]">Sign Out</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : !showAppNav && !user ? (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/auth/login" className="px-4 py-2 text-sm font-semibold">Sign in</Link>
              <Link href="/auth/register" className="copic-button inline-flex px-5 text-sm">Join Copic</Link>
            </div>
          ) : user ? (
            <button onClick={() => void signOutToLanding()} className="hidden rounded-xl border border-[#4A463F] px-4 py-2 text-sm font-black text-[#CCC6BB] md:inline-flex">Sign Out</button>
          ) : null}
          <button aria-label="Open menu" onClick={() => setDrawerOpen(true)} className="rounded-xl bg-bone p-2 text-smoky md:hidden"><Menu size={20} /></button>
        </div>
      </header>

      {topAlertDetail && (
        <AppModal eyebrow="Alert" title={topAlertDetail.title} onClose={() => setTopAlertDetail(null)} maxWidth="max-w-lg">
          <div className="grid gap-4 text-sm text-[#CCC6BB]">
            <p>{topAlertDetailBody}</p>
            <div className="flex flex-wrap gap-3">
              {topAlertActionHref && (
                <Link href={topAlertActionHref} onClick={() => setTopAlertDetail(null)} className="temp-success-button inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-black">
                  {topAlertActionLabel}
                </Link>
              )}
              <Button type="button" variant={topAlertActionHref ? "secondary" : "primary"} onClick={() => setTopAlertDetail(null)}>Close</Button>
            </div>
          </div>
        </AppModal>
      )}

      <main className={`temp-main mx-auto max-w-[1440px] px-4 py-6 md:px-8 ${isLanding ? "is-landing" : ""}`}>{children}</main>

      {drawerOpen && (
        <div className="temp-mobile-drawer-backdrop fixed inset-0 z-50 overflow-hidden bg-smoky/80 md:hidden">
          <aside className="temp-mobile-drawer copic-panel no-visible-scrollbar ml-auto h-dvh max-h-dvh w-80 max-w-[86vw] overflow-y-auto overscroll-contain p-5" style={{ WebkitOverflowScrolling: "touch" }}>
            <div className="flex items-center justify-between">
              <div>
                {canSwitchRole && (
                  <RoleModeToggle activeRole={profile.role as "worker" | "client"} switchingRole={switchingRole} onSwitch={role => void switchRole(role)} />
                )}
              </div>
              <button aria-label="Close menu" onClick={() => setDrawerOpen(false)} className="rounded-xl bg-bone p-2 text-smoky"><X size={18} /></button>
            </div>
            <nav className="mt-8 grid gap-2 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
              {links.map(item => {
                const Icon = item.icon;
                const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                return (
                  <Link onClick={() => setDrawerOpen(false)} key={item.href} href={item.href} className={`copic-button relative flex items-center gap-3 rounded-xl px-4 py-3 font-bold ${active ? "bg-bone text-smoky" : "bg-tertiary text-bone"}`}>
                    <Icon size={18} /> {item.label}
                    {item.href === "/notifications" && visibleTopAlerts.length > 0 && <span className="temp-alert-dot" />}
                  </Link>
                );
              })}
              {profile && (
                <>
                  <ThemeModeSwitch theme={uiTheme} onToggle={toggleUiTheme} />
                  <Link onClick={() => setDrawerOpen(false)} href="/profile" className="flex items-center gap-3 rounded-xl bg-tertiary px-4 py-3 font-bold text-bone">Profile</Link>
                  <button onClick={() => void signOutToLanding()} className="rounded-xl border border-bone/20 px-4 py-3 text-left text-bone">Sign Out</button>
                </>
              )}
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}

function NavProfilePhoto({ photo, alt }: { photo: { photoURL: string; photoPositionX: number; photoPositionY: number; photoZoom: number }; alt: string }) {
  const zoom = Math.max(1, photo.photoZoom);
  return (
    <img
      src={photo.photoURL}
      alt={alt}
      className="h-full w-full object-cover"
      style={{
        objectPosition: `${photo.photoPositionX}% ${photo.photoPositionY}%`,
        transform: `scale(${zoom})`,
        transformOrigin: `${photo.photoPositionX}% ${photo.photoPositionY}%`
      }}
    />
  );
}
