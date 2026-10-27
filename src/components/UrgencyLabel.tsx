// UrgencyLabel: a request's urgency as text.
//
//   <UrgencyLabel urgency={request.urgency} />
//
// - Routine and urgent read as plain text. Emergency gets the crimson brand accent and a
//   small drop mark, so it stands out in a list without borrowing the red error colour.
// - The word is always written out; the colour and mark are extras (decorative, hidden).

import { Droplet } from "lucide-react";
import type { Urgency } from "../api/types";
import { URGENCY_LABELS } from "../lib/labels";
import { cn } from "../shared/cn";

export type UrgencyLabelProps = {
  urgency: Urgency;
  className?: string;
};

export function UrgencyLabel({ urgency, className }: UrgencyLabelProps) {
  if (urgency !== "EMERGENCY") return <span className={className}>{URGENCY_LABELS[urgency]}</span>;

  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold text-(--color-accent)", className)}>
      <Droplet aria-hidden="true" className="size-3.5 shrink-0 fill-current" />
      {URGENCY_LABELS[urgency]}
    </span>
  );
}
