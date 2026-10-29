// ComputedAt: "Figures computed at 10:02 (2 min ago)", beside figures the service derived.
//
//   <ComputedAt computedAt={availability.data.computedAt} />
//
// - The time is the viewer's local time; "(2 min ago)" is recalculated every 30 seconds.
// - Used by AvailabilityPage and DashboardPage.

import { useEffect, useState } from "react";
import { formatTime, timeAgo } from "../lib/labels";

// How often "(2 min ago)" is recalculated.
const TICK_MS = 30_000;

/** The current time, updated every `intervalMs`. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function ComputedAt({ computedAt }: { computedAt: string }) {
  const now = useNow(TICK_MS);
  return (
    <p className="text-sm text-muted-foreground">
      Figures computed at <time dateTime={computedAt}>{formatTime(computedAt)}</time> ({timeAgo(computedAt, now)})
    </p>
  );
}
