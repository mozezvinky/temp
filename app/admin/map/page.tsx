"use client";
import dynamic from "next/dynamic";
const MarketplaceMap = dynamic(() => import("@/components/admin/MarketplaceMap"), { ssr: false, loading: () => <p role="status">Loading marketplace map…</p> });
export default function AdminMapPage() { return <div className="space-y-4"><h1 className="text-3xl font-black">Marketplace map</h1><p className="copic-muted">Approximate supply by visible area. Counts cover whole grid cells; no residential addresses are shown.</p><MarketplaceMap /></div>; }
