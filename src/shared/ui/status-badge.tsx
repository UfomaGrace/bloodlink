// Status badge
// Owner: Ufoma
//
// Done when:
// - [x] Tones: neutral, info, success, warning, danger
// - [x] Always shows the status as text
// - [x] Keyboard-only test passed, screen reader checked once
// - [x] Typed props, no `any`, colours from tokens.css
// - [ ] Reviewed by one other interface engineer
//
// - The status is always written out as text (children). Colour and icon are
//   extras, never the only signal, so it still reads in greyscale.
// - icon is decorative and hidden from screen readers. Don't put meaning in it
//   that the text doesn't already say.
// - Renders a plain <span>: no role="status" or aria-live. A badge describes
//   the current state; it doesn't announce changes. Use Toast for that.
// - Long labels wrap inside their container instead of overflowing.
//
// Text contrast with the default tokens: neutral 16.1:1, info 6.7:1,
// success 5.0:1, warning 4.9:1, danger 6.5:1.

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn";

export type StatusBadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusBadgeTone;
  icon?: ReactNode;
  children: ReactNode;
};

// tokens.css has no separate info colour, so info uses the primary role.
// Neutral sits on --color-surface, the same as Card, so it gets a visible edge.
const toneClasses: Record<StatusBadgeTone, string> = {
  neutral:
    "bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border-input)]",
  info: "bg-[var(--color-primary)] text-[var(--color-on-primary)] border-transparent",
  success: "bg-[var(--color-success)] text-[var(--color-on-success)] border-transparent",
  warning: "bg-[var(--color-warning)] text-[var(--color-on-warning)] border-transparent",
  danger: "bg-[var(--color-danger)] text-[var(--color-on-danger)] border-transparent",
};

export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(function StatusBadge(
  { tone = "neutral", icon, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1 align-middle",
        "rounded-[var(--radius-sm)] border px-2 py-0.5",
        "text-xs font-medium leading-5 font-[family-name:var(--font-sans)]",
        "whitespace-normal break-words [overflow-wrap:anywhere]",
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      {icon && (
        <span className="inline-flex shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="min-w-0">{children}</span>
    </span>
  );
});

StatusBadge.displayName = "StatusBadge";
