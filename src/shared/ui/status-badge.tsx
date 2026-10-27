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
// Text contrast on each tone's tint: neutral 4.9:1, info 5.9:1,
// success 6.3:1, warning 6.3:1, danger 5.8:1.

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn";

export type StatusBadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusBadgeTone;
  icon?: ReactNode;
  children: ReactNode;
};

// Tinted: status colour as text on its pale *-subtle tint, with a soft edge in the
// same hue. Calmer than solid fills in dense tables.
const toneClasses: Record<StatusBadgeTone, string> = {
  neutral:
    "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]",
  info: "bg-[var(--color-info-subtle)] text-[var(--color-info)] border-[color-mix(in_srgb,var(--color-info)_35%,transparent)]",
  success:
    "bg-[var(--color-success-subtle)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_35%,transparent)]",
  warning:
    "bg-[var(--color-warning-subtle)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)]",
  danger:
    "bg-[var(--color-danger-subtle)] text-[var(--color-danger)] border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)]",
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
        "rounded-sm border px-2 py-0.5",
        "text-xs font-medium leading-5 font-sans",
        "whitespace-normal wrap-break-word",
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
