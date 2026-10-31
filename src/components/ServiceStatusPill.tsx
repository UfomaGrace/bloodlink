// ServiceStatusPill: says whether the real service is awake, from useServiceStatus.
//
//   <ServiceStatusPill status={useServiceStatus()} />               // light pages (sign-in)
//   <ServiceStatusPill status={status} tone="onDark" />             // the dark staff top bar
//
// - The role="status" wrapper stays mounted (empty when there is nothing to say) and only its
//   content changes, so screen readers announce each change. Never blocks anything.
// - "light": state-coloured text and border on a white pill.
// - "onDark": on-secondary text, a faint on-secondary border and a light dot. The status colours
//   are too dark to read on --color-secondary, so the text carries the meaning there.

import type { ServiceStatus } from "../hooks/useServiceStatus";
import { cn } from "../shared/cn";

export type ServiceStatusPillTone = "light" | "onDark";

const STATUS_TEXT: Record<ServiceStatus, string> = {
  checking: "Waking the service…",
  ready: "Service ready",
  failed: "Service unreachable. Sign-in may fail.",
};

// The top bar is only shown once signed in, so it doesn't mention sign-in.
const STATUS_TEXT_ON_DARK: Record<ServiceStatus, string> = {
  ...STATUS_TEXT,
  failed: "Service unreachable",
};

const LIGHT_TONE: Record<ServiceStatus, string> = {
  checking: "border-border text-muted-foreground",
  ready: "border-success text-success",
  failed: "border-warning text-warning",
};

export function ServiceStatusPill({
  status,
  tone = "light",
  className,
}: {
  status: ServiceStatus | null;
  tone?: ServiceStatusPillTone;
  className?: string;
}) {
  const onDark = tone === "onDark";

  return (
    <div role="status" className={className}>
      {status && (
        <p
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
            onDark
              ? "border-[color-mix(in_srgb,var(--color-on-secondary)_35%,transparent)] text-(--color-on-secondary)"
              : cn("bg-surface", LIGHT_TONE[status]),
          )}
        >
          {status === "checking" ? (
            <span
              aria-hidden="true"
              className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
            />
          ) : (
            onDark && (
              <span
                aria-hidden="true"
                data-testid="status-dot"
                className="size-2 rounded-full bg-(--color-status-dot-on-dark)"
              />
            )
          )}
          {(onDark ? STATUS_TEXT_ON_DARK : STATUS_TEXT)[status]}
        </p>
      )}
    </div>
  );
}
