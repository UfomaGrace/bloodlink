// ComputedAt: "Figures computed at 10:02 (2 min ago)", beside figures the service derived.
//
//   <ComputedAt computedAt={availability.data.computedAt} />
//
// - The time is the viewer's local time; "(2 min ago)" is recalculated every 30 seconds.
// - Used by AvailabilityPage, DashboardPage and SlotsPage.

import { useNow } from "../hooks/useNow";
import { formatTime, timeAgo } from "../lib/labels";

// How often "(2 min ago)" is recalculated.
const TICK_MS = 30_000;

export function ComputedAt({ computedAt }: { computedAt: string }) {
  const now = useNow(TICK_MS);
  return (
    <p className="text-sm text-muted-foreground">
      Figures computed at <time dateTime={computedAt}>{formatTime(computedAt)}</time> ({timeAgo(computedAt, now)})
    </p>
  );
}
