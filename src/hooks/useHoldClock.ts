// useHoldClock: the current time, ticking while any hold is still running.
//
//   const now = useHoldClock(request?.reservations ?? [], loaded.reload);
//
// - Ticks each second while a hold is running, and stops when none is left.
// - Calls onHoldPassed once each time a running hold passes, so the screen can reload.
//   A hold already past when it arrives is skipped, so a clock that runs ahead of the
//   service's (which may still say ACTIVE) can't cause a reload loop.

import { useEffect, useRef, useState } from "react";
import type { Reservation } from "../api/types";
import { nextHoldEnd } from "../lib/holds";

export function useHoldClock(reservations: readonly Reservation[], onHoldPassed: () => void): number {
  const [now, setNow] = useState(() => Date.now());
  const onHoldPassedRef = useRef(onHoldPassed);
  useEffect(() => {
    onHoldPassedRef.current = onHoldPassed;
  });

  const nextEnd = nextHoldEnd(reservations, now);

  useEffect(() => {
    if (nextEnd === null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= nextEnd) onHoldPassedRef.current();
    }, 1000);
    return () => window.clearInterval(id);
  }, [nextEnd]);

  return now;
}
