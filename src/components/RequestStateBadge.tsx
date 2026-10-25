// RequestStateBadge: a request's state as a badge.
//
//   <RequestStateBadge state={request.state} />
//
// - The label is always written out ("Pending", "Hold lapsed"); the colour is extra, so it
//   still reads in greyscale. Labels and tones come from lib/labels.ts.

import type { RequestState } from "../api/types";
import { REQUEST_STATE_LABELS, REQUEST_STATE_TONES } from "../lib/labels";
import { StatusBadge } from "../shared/ui/status-badge";

export type RequestStateBadgeProps = {
  state: RequestState;
  className?: string;
};

export function RequestStateBadge({ state, className }: RequestStateBadgeProps) {
  return (
    <StatusBadge tone={REQUEST_STATE_TONES[state]} className={className}>
      {REQUEST_STATE_LABELS[state]}
    </StatusBadge>
  );
}
