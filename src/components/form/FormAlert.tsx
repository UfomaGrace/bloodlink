// FormAlert: shows an ApiError above a form.
//
//   <FormAlert error={submitError} />
//   <FormAlert error={submitError} message="We couldn't reach the service…" />
//   <FormAlert error={submitError} title="…" issues={unmapped}><Link to="/units">…</Link></FormAlert>
//
// - role="alert", so it's announced when it appears. Renders nothing when error is null.
// - Shows the service's message as is (it's written for users) unless `message` overrides it,
//   and always ends with "Reference: <requestId>" for support.
// - issues: 422 details that didn't match a form field (see applyApiError).
// - Takes focus each time a new error arrives: the submit button may be busy or disabled,
//   so keyboard and screen reader users land on the problem.

import { useEffect, useRef, type ReactNode } from "react";
import type { ApiError } from "../../api/client";
import type { FieldIssue } from "../../api/types";
import { cn } from "../../shared/cn";

export type FormAlertProps = {
  error: ApiError | null;
  /** Replaces error.message, e.g. for a connection problem. */
  message?: string;
  /** A bold first line above the message. */
  title?: string;
  issues?: readonly FieldIssue[];
  /** Extra content, e.g. a link to check the list. */
  children?: ReactNode;
  className?: string;
};

export function FormAlert({ error, message, title, issues, children, className }: FormAlertProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);

  if (!error) return null;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={cn(
        "rounded-md border border-l-4 border-(--color-danger) bg-(--color-bg) p-4 text-sm",
        "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)",
        className,
      )}
    >
      {title && <p className="font-semibold text-(--color-text)">{title}</p>}
      <p className="font-medium text-(--color-danger)">
        <span aria-hidden="true">! </span>
        {message ?? error.message}
      </p>
      {issues && issues.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-(--color-text)">
          {issues.map((issue) => (
            <li key={`${issue.field}:${issue.issue}`}>
              {issue.field}: {issue.issue}
            </li>
          ))}
        </ul>
      )}
      {children}
      <p className="mt-2 break-all text-(--color-text-muted)">Reference: {error.requestId}</p>
    </div>
  );
}
