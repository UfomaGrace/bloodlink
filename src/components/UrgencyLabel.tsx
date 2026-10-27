// UrgencyLabel: a request's urgency as text with a small coloured dot.
//
//   <UrgencyLabel urgency={request.urgency} />
//
// - Emergency: crimson dot and crimson, semibold text, so it stands out in a list without
//   colouring the row or borrowing the red error colour.
// - Urgent: amber dot, normal text (the amber is too light to read as text).
// - Routine: slate dot, muted text, so it stays in the background.
// - The word is always written out; the dot is extra (decorative, hidden).

import type { Urgency } from "../api/types";
import { URGENCY_LABELS } from "../lib/labels";
import { cn } from "../shared/cn";

export type UrgencyLabelProps = {
  urgency: Urgency;
  className?: string;
};

const dotClasses: Record<Urgency, string> = {
  EMERGENCY: "bg-(--color-accent)",
  URGENT: "bg-(--color-caution)",
  ROUTINE: "bg-(--color-text-muted)",
};

const textClasses: Record<Urgency, string> = {
  EMERGENCY: "font-semibold text-(--color-accent)",
  URGENT: "text-(--color-text)",
  ROUTINE: "text-(--color-text-muted)",
};

export function UrgencyLabel({ urgency, className }: UrgencyLabelProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", textClasses[urgency], className)}>
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dotClasses[urgency])} />
      {URGENCY_LABELS[urgency]}
    </span>
  );
}
