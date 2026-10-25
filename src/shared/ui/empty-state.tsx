// Empty state
// Owner: Ufoma
//
// Done when:
// - [x] Title, one line of explanation, optional action
// - [x] Covers first use and "no filter results"
// - [ ] Copy invites action rather than apologising
// - [x] Keyboard-only test passed, screen reader checked once
// - [x] Typed props, no `any`, colours from tokens.css
// - [ ] Reviewed by one other interface engineer
//
// - One component for both uses. The content decides which one it is:
//   first use ("No events yet" / "Add your first event") or a filter with no
//   results ("No events match these filters" / "Clear filters").
// - title is a real heading. Pick headingLevel so it fits the page's heading
//   order (defaults to h2, i.e. directly under the page's h1).
// - action renders the shared Button. Pass a label and an onClick; the button
//   is not restyled here.
// - icon is decorative and hidden from screen readers. Don't put meaning in it
//   that the title doesn't already say.
// - Renders a plain <div>: no role="status" or aria-live. It appears as part of
//   the page; the Filter bar is what announces result counts.
// - Centred. Long titles and descriptions wrap instead of overflowing.
//
// Text contrast with the default tokens: title 17.7:1, description 7.7:1 on
// --color-bg (7.0:1 on --color-surface).

import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { Button } from "./button";
import { cn } from "../cn";

export type EmptyStateHeadingLevel = "h2" | "h3" | "h4" | "h5" | "h6";

export type EmptyStateAction = {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
};

// The native title attribute (a tooltip) is replaced by the visible heading.
export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title" | "children"> & {
  title: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  action?: EmptyStateAction;
  headingLevel?: EmptyStateHeadingLevel;
};

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { title, description, icon, action, headingLevel = "h2", className, ...rest },
  ref,
) {
  const Heading = headingLevel;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full min-w-0 flex-col items-center gap-3 px-4 py-10 text-center",
        "font-[family-name:var(--font-sans)] text-[var(--color-text)]",
        "break-words [overflow-wrap:anywhere]",
        className,
      )}
      {...rest}
    >
      {icon && (
        <span
          className="inline-flex shrink-0 text-[var(--color-text-muted)]"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <Heading className="max-w-full text-lg font-semibold leading-snug text-[var(--color-text)]">
        {title}
      </Heading>
      <p className="max-w-prose text-sm leading-6 text-[var(--color-text-muted)]">
        {description}
      </p>
      {action && (
        <Button className="mt-2 max-w-full" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
});

EmptyState.displayName = "EmptyState";
