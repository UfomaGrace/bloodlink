// Button
// Owner: Muizz
//
// Done when:
// - [ ] Variants: primary, secondary, danger, ghost. Sizes: sm, md, lg
// - [ ] Loading state: spinner, keeps width, aria-busy, blocks second click
// - [ ] Defaults to type="button"
// - [ ] Icon-only buttons require aria-label
// - [ ] Forwards ref, accepts className
// - [ ] Keyboard-only test passed, screen reader checked once
// - [ ] Typed props, no `any`, colours from tokens.css
// - [ ] Reviewed by one other interface engineer



// Button
// Owner: Muizz
//
// - Variants: primary, secondary, danger, ghost. Sizes: sm, md, lg.
// - loading: shows a spinner, keeps the button's width, sets aria-busy,
//   and ignores further clicks so a form cannot be submitted twice.
// - Defaults to type="button" so it never submits a form by accident.
//   Pass type="submit" explicitly on form submit buttons.
// - Icon-only buttons must pass iconOnly and an aria-label (TypeScript enforces this).

import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { cn } from "../cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

type BaseProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export type ButtonProps = BaseProps &
  ({ iconOnly?: false } | { iconOnly: true; "aria-label": string });

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]",
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border-input)] hover:bg-[var(--color-surface-hover)]",
  danger:
    "bg-[var(--color-danger)] text-[var(--color-on-danger)] hover:bg-[var(--color-danger-hover)]",
  ghost:
    "bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]",
};

// Smallest size is 32px tall, above the WCAG 2.2 minimum target of 24px.
const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

const iconOnlySizeClasses: Record<Size, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    iconOnly = false,
    type = "button",
    disabled,
    className,
    children,
    onClick,
    ...rest
  },
  ref,
) {
  // While loading we use aria-disabled instead of disabled, so the button keeps
  // keyboard focus and screen readers can still find it. Clicks are swallowed.
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-disabled={loading || disabled || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 font-medium",
        "rounded-md font-sans",
        "transition-colors",
        "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)]",
        "focus-visible:outline-offset-(--focus-ring-offset)",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {/* Content stays in place (just invisible) while loading, so the width
          doesn't jump and the accessible name is still read out. */}
      <span className={cn("inline-flex items-center gap-2", loading && "opacity-0")}>
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
        </span>
      )}
    </button>
  );
});

