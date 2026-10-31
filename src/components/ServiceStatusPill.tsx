// ServiceStatusPill: says whether the real service is awake, from useServiceStatus.
//
//   <ServiceStatusPill status={useServiceStatus()} />              // sign-in page
//   <ServiceStatusPill status={status} compact />                  // staff top bar's organisation chip
//
// - The role="status" wrapper stays mounted (empty when there is nothing to say) and only its
//   content changes, so screen readers announce each change. Never blocks anything.
// - Default: state-coloured text and border on a white pill.
// - signedIn: drops "Sign-in may fail." from the failed text; the user is already signed in.
// - compact: plain state-coloured text with a dot (a spinner while checking), no pill, for
//   inside the staff top bar's chip. Signed-in wording: "Connected", "Service unreachable".

import type { ServiceStatus } from "../hooks/useServiceStatus";
import { cn } from "../shared/cn";

const STATUS_TEXT: Record<ServiceStatus, string> = {
  checking: "Waking the service…",
  ready: "Service ready",
  failed: "Service unreachable. Sign-in may fail.",
};

const SIGNED_IN_FAILED_TEXT = "Service unreachable";

const COMPACT_TEXT: Record<ServiceStatus, string> = {
  checking: "Waking the service…",
  ready: "Connected",
  failed: SIGNED_IN_FAILED_TEXT,
};

const STATUS_TONE: Record<ServiceStatus, string> = {
  checking: "border-border text-muted-foreground",
  ready: "border-success text-success",
  failed: "border-warning text-warning",
};

export function ServiceStatusPill({
  status,
  signedIn = false,
  compact = false,
  className,
}: {
  status: ServiceStatus | null;
  signedIn?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const spinner = (
    <span
      aria-hidden="true"
      className={cn(
        "animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none",
        compact ? "size-3" : "size-3.5",
      )}
    />
  );

  if (compact) {
    return (
      <div role="status" className={className}>
        {status && (
          <p className={cn("inline-flex items-center gap-1.5 text-sm whitespace-nowrap", STATUS_TONE[status])}>
            {status === "checking" ? spinner : <span aria-hidden="true" className="size-2 rounded-full bg-current" />}
            {COMPACT_TEXT[status]}
          </p>
        )}
      </div>
    );
  }

  return (
    <div role="status" className={className}>
      {status && (
        <p
          className={cn(
            "inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-sm",
            STATUS_TONE[status],
          )}
        >
          {status === "checking" && spinner}
          {signedIn && status === "failed" ? SIGNED_IN_FAILED_TEXT : STATUS_TEXT[status]}
        </p>
      )}
    </div>
  );
}
