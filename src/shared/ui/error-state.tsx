// Error state
// Owner: Ufoma
//
// Done when:
// - [x] Plain message plus "Try again" button
// - [x] role="alert"
// - [x] Never shows raw error codes
// - [x] Keyboard-only test passed, screen reader checked once
// - [x] Typed props, no `any`, colours from tokens.css
// - [ ] Reviewed by one other interface engineer
//
// - Same layout as Empty state, for when something failed to load or save.
// - title says what went wrong in plain terms ("We couldn't load your events").
//   description says what to do next ("Check your connection and try again").
// - title and description are strings only. Don't pass an Error object or
//   error.message: map the failure to plain copy before it gets here, so raw
//   codes and stack traces never reach the user.
// - title is a real heading. Pick headingLevel so it fits the page's heading
//   order (defaults to h2, i.e. directly under the page's h1).
// - onRetry renders the shared Button, labelled "Try again" unless retryLabel
//   says otherwise. Set retrying while the retry is in flight: the Button shows
//   its spinner and ignores further clicks.
// - icon is decorative and hidden from screen readers. Don't put meaning in it
//   that the title doesn't already say.
// - role="alert" so it is announced when it appears. Screen readers only
//   announce an alert that is added to the page after load, so render it in
//   place of the content when the failure happens.
// - Danger tone on the heading and icon. Colour is never the only signal: the
//   title always says in words that something went wrong.
// - Centred. Long titles and descriptions wrap instead of overflowing.
//
// Text contrast with the default tokens: title 6.5:1, description 7.7:1 on
// --color-bg (5.9:1 and 7.0:1 on --color-surface).

import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { Button } from "./button";
import { cn } from "../cn";

export type ErrorStateHeadingLevel = "h2" | "h3" | "h4" | "h5" | "h6";

// The native title attribute (a tooltip) is replaced by the visible heading.
// role is fixed to "alert", so it can't be overridden.
export type ErrorStateProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "title" | "children" | "role"
> & {
  title: string;
  description: string;
  icon?: ReactNode;
  headingLevel?: ErrorStateHeadingLevel;
  onRetry?: (event: MouseEvent<HTMLButtonElement>) => void;
  retryLabel?: string;
  retrying?: boolean;
};

export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(function ErrorState(
  {
    title,
    description,
    icon,
    headingLevel = "h2",
    onRetry,
    retryLabel = "Try again",
    retrying = false,
    className,
    ...rest
  },
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
      role="alert"
    >
      {icon && (
        <span
          className="inline-flex shrink-0 text-[var(--color-danger)]"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <Heading className="max-w-full text-lg font-semibold leading-snug text-[var(--color-danger)]">
        {title}
      </Heading>
      <p className="max-w-prose text-sm leading-6 text-[var(--color-text-muted)]">
        {description}
      </p>
      {onRetry && (
        <Button className="mt-2 max-w-full" loading={retrying} onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
});

ErrorState.displayName = "ErrorState";
