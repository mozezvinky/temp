"use client";

import { loadMyVerification } from "@/services/kyc";
import type { VerificationKind, VerificationStatus } from "@/types";
import { normalizeVerificationStatus } from "@/utils/verification";
import { useEffect, useState } from "react";

export function useLiveVerificationStatus(initialStatus: VerificationStatus | undefined, kind: VerificationKind = "identity") {
  const [status, setStatus] = useState<VerificationStatus>(() => normalizeVerificationStatus(initialStatus));
  const [checking, setChecking] = useState(() => normalizeVerificationStatus(initialStatus) !== "approved");

  useEffect(() => {
    let cancelled = false;
    const fallbackStatus = normalizeVerificationStatus(initialStatus);
    setStatus(fallbackStatus);
    setChecking(fallbackStatus !== "approved");

    void loadMyVerification(kind)
      .then(record => {
        if (cancelled) return;
        setStatus(record?.status ? normalizeVerificationStatus(record.status) : fallbackStatus);
      })
      .catch(() => {
        if (!cancelled) setStatus(fallbackStatus);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialStatus, kind]);

  return { status, checking };
}
