"use client";

import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { loading, isAuthorized } = useProtectedRoute(["admin"]);
  if (loading || !isAuthorized) return <LoadingSpinner label="Checking admin access" />;
  return children;
}
