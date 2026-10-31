// StaffTopBar: the dark top bar of the staff shell (bank staff and the administrator, lg and up).
//
// - A 16rem column for the logo (it sits above the sidebar), then the page title or a
//   breadcrumb, then the service status pill and, for bank staff, "Record unit".
// - Sticky at the top, above the page, so it and the sidebar stay lined up while the page scrolls.
// - The title is plain text, not a heading: every page has its own <h1>.

import { ChevronRight, Droplet } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { Role } from "../../api/types";
import type { ServiceStatus } from "../../hooks/useServiceStatus";
import { cn } from "../../shared/cn";
import { ServiceStatusPill } from "../ServiceStatusPill";
import { focusRing, onDarkFocus } from "./layoutStyles";
import { pageTitleFor } from "./navItems";

export function StaffTopBar({
  role,
  serviceStatus,
  className,
}: {
  role: Role;
  serviceStatus: ServiceStatus | null;
  className?: string;
}) {
  const { pathname } = useLocation();
  const title = pageTitleFor(pathname, role);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 h-16 grid-cols-[16rem_minmax(0,1fr)_auto] items-center bg-secondary text-on-secondary",
        onDarkFocus,
        className,
      )}
    >
      <div className="px-6">
        <Link
          to="/"
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-sm text-lg font-semibold tracking-tight",
            focusRing,
          )}
        >
          <Droplet aria-hidden="true" className="size-5 fill-brand-accent text-brand-accent" />
          BloodLink
        </Link>
      </div>

      <div className="min-w-0 px-8">
        {title?.parent ? (
          <nav aria-label="Breadcrumb">
            <ol className="flex min-w-0 items-center gap-2 text-sm">
              <li className="shrink-0">
                <Link
                  to={title.parent.to}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-sm text-on-secondary-muted underline-offset-4 hover:text-on-secondary hover:underline",
                    focusRing,
                  )}
                >
                  {title.parent.label}
                </Link>
              </li>
              <li aria-hidden="true" className="shrink-0 text-on-secondary-muted">
                <ChevronRight className="size-4" />
              </li>
              <li aria-current="page" className="min-w-0 truncate font-medium">
                {title.label}
              </li>
            </ol>
          </nav>
        ) : (
          title && <p className="truncate font-medium">{title.label}</p>
        )}
      </div>

      <div className="flex items-center gap-3 pr-8">
        <ServiceStatusPill status={serviceStatus} tone="onDark" />
        {role === "BANK_STAFF" && (
          <Link
            to="/units/new"
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-md border border-on-secondary px-4 text-sm font-medium",
              "text-on-secondary transition-colors hover:bg-(--color-secondary-hover)",
              focusRing,
            )}
          >
            Record unit
          </Link>
        )}
      </div>
    </header>
  );
}
