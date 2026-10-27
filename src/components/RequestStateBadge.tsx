// RequestStateBadge: a request's state as plain coloured text (no fill, no border).
//
//   <RequestStateBadge state={request.state} />
//
// - The label is always written out ("Pending", "Hold lapsed"); the colour is extra, so it
//   still reads in greyscale. Labels come from lib/labels.ts.
// - Closed states (cancelled, hold lapsed) stay muted. "Unit expired" adds a small warning
//   mark so it is never mistaken for blood that is still available.
// - Deliberately looks different from UrgencyLabel (no dot), so the two fields don't blur.

import { TriangleAlert } from "lucide-react";
import type { RequestState } from "../api/types";
import { REQUEST_STATE_LABELS } from "../lib/labels";
import { cn } from "../shared/cn";

export type RequestStateBadgeProps = {
  state: RequestState;
  className?: string;
};

// Contrast on surface: warning 7.1:1, primary 5.5:1, danger 6.6:1, muted 4.9:1.
const stateClasses: Record<RequestState, string> = {
  PENDING: "font-medium text-(--color-warning)",
  APPROVED: "font-medium text-(--color-primary)",
  FULFILLED: "font-medium text-(--color-primary)",
  DECLINED: "font-medium text-(--color-danger)",
  UNIT_EXPIRED: "font-medium text-(--color-danger)",
  CANCELLED: "text-(--color-text-muted)",
  LAPSED: "text-(--color-text-muted)",
};

export function RequestStateBadge({ state, className }: RequestStateBadgeProps) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5", stateClasses[state], className)}>
      {state === "UNIT_EXPIRED" && <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />}
      <span className="min-w-0 wrap-break-word">{REQUEST_STATE_LABELS[state]}</span>
    </span>
  );
}
