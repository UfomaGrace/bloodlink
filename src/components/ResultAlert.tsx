// ResultAlert: the outcome of the last action on a screen, shown above its content.
//
//   const [notice, setNotice] = useState<Notice | null>(null);
//   {notice && <ResultAlert notice={notice} />}
//
// - Success is role="status" (polite); an error is role="alert" with the service's message
//   and "Reference: <requestId>" for support.
// - Info is role="status" too, for news that is neither: "We couldn't confirm. The request now
//   shows as Fulfilled." after a lost connection.
// - Takes focus each time a new notice arrives, so keyboard and screen reader users land on
//   the result (focus also makes the screen reader read it). It waits a tick so it lands after
//   a closing dialog has handed focus back to the button that opened it.

import { CheckCircle2, Info } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ApiError } from "../api/client";
import { cn } from "../shared/cn";

/** The result of the last action on the screen. */
export type Notice =
  | { tone: "success"; message: string }
  | { tone: "info"; message: string }
  | { tone: "error"; error: ApiError };

const BORDERS: Record<Notice["tone"], string> = {
  success: "border-l-success",
  info: "border-l-info",
  error: "border-l-error",
};

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

export function ResultAlert({ notice, className }: { notice: Notice; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // A new notice object each action, so this runs again even for the same text.
  useEffect(() => {
    const id = window.setTimeout(() => ref.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [notice]);

  return (
    <div
      ref={ref}
      role={notice.tone === "error" ? "alert" : "status"}
      tabIndex={-1}
      className={cn(
        "rounded-md border border-l-4 border-border bg-surface p-4 text-sm",
        BORDERS[notice.tone],
        focusRing,
        className,
      )}
    >
      {notice.tone !== "error" ? (
        <p className="flex items-start gap-2 font-medium">
          {notice.tone === "success" ? (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
          )}
          <span className="min-w-0">{notice.message}</span>
        </p>
      ) : (
        <>
          <p className="font-medium text-error">
            <span aria-hidden="true">! </span>
            {notice.error.message}
          </p>
          <p className="mt-2 break-all text-muted-foreground">Reference: {notice.error.requestId}</p>
        </>
      )}
    </div>
  );
}
