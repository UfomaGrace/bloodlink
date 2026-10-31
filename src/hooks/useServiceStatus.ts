// useServiceStatus: is the real service awake? For the sign-in page's status pill.
//
//   const status = useServiceStatus();
//
// On mount, GET /actuator/health (api.health, 60 s timeout; it also wakes a sleeping free-tier
// service). "checking" until it answers, "ready" for 3 s after a 200, then null; "failed" when it
// times out, can't connect or answers DOWN. Always null against the mock, and nothing is sent.

import { useEffect, useState } from "react";
import { IS_MOCK } from "../api/client";
import { api } from "../api/endpoints";

export type ServiceStatus = "checking" | "ready" | "failed";

const READY_VISIBLE_MS = 3_000;

export function useServiceStatus(): ServiceStatus | null {
  const [status, setStatus] = useState<ServiceStatus | null>(IS_MOCK ? null : "checking");

  useEffect(() => {
    if (IS_MOCK) return;
    let cancelled = false;
    let hideTimer: number | undefined;
    api.health().then(
      () => {
        if (cancelled) return;
        setStatus("ready");
        hideTimer = window.setTimeout(() => setStatus(null), READY_VISIBLE_MS);
      },
      () => {
        if (!cancelled) setStatus("failed");
      },
    );
    return () => {
      cancelled = true;
      window.clearTimeout(hideTimer);
    };
  }, []);

  return status;
}
