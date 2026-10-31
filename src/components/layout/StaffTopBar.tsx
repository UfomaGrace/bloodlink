// StaffTopBar: the full-width white top bar of the staff shell (bank staff and the
// administrator, lg and up).
//
// - Left column, as wide as the expanded sidebar: the sidebar toggle, then the logo.
// - The organisation chip: "Bank · Area" or "Administration · All banks", then the compact
//   service status after a thin divider (hidden while there is no status; the role="status"
//   region stays mounted so changes are announced).
// - Right: "Record unit" (bank staff only), the user's initials, name and role, and Sign out.
// - No page title: every page has its own <h1>.
// - Sticky at the top, above the page and the sidebar, with the brand stripe along its top edge.
//   Light background, so the default (primary) focus ring applies.
// - Stripe, logo, user block and Sign out come from HeaderParts, shared with TopNavHeader.

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Link } from "react-router";
import type { Role, User } from "../../api/types";
import type { ServiceStatus } from "../../hooks/useServiceStatus";
import { cn } from "../../shared/cn";
import { Button } from "../../shared/ui/button";
import { ServiceStatusPill } from "../ServiceStatusPill";
import { BrandStripe, Logo, SignOutButton, UserBlock } from "./HeaderParts";
import { focusRing, ROLE_LABELS } from "./layoutStyles";

export function organisationLabel(role: Role, user: User): string {
  if (role === "ADMIN") return "Administration · All banks";
  const organisation = user.organisation;
  if (!organisation) return ROLE_LABELS[role];
  return organisation.area ? `${organisation.name} · ${organisation.area}` : organisation.name;
}

export function StaffTopBar({
  role,
  user,
  serviceStatus,
  sidebarId,
  sidebarCollapsed,
  onToggleSidebar,
  onSignOut,
  className,
}: {
  role: Role;
  user: User;
  serviceStatus: ServiceStatus | null;
  sidebarId: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onSignOut: () => void;
  className?: string;
}) {
  const ToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <header className={cn("sticky top-0 z-30 shrink-0 flex-col bg-surface text-foreground", className)}>
      <BrandStripe />
      <div className="flex h-15 items-center border-b border-border pr-6">
        <div className="flex w-60 shrink-0 items-center gap-2 px-3">
          <Button
            variant="ghost"
            iconOnly
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-controls={sidebarId}
            aria-expanded={!sidebarCollapsed}
            onClick={onToggleSidebar}
            className="size-10 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ToggleIcon aria-hidden="true" className="size-5" />
          </Button>
          <Logo />
        </div>

        <div
          data-testid="organisation-chip"
          className="ml-2 flex h-9 min-w-0 items-center gap-3 rounded-md border border-border px-3 text-sm"
        >
          <span className="min-w-0 truncate font-medium">{organisationLabel(role, user)}</span>
          {serviceStatus && <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />}
          <ServiceStatusPill status={serviceStatus} compact className="shrink-0" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-4 pl-4">
          {role === "BANK_STAFF" && (
            <Link
              to="/units/new"
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center rounded-md border border-primary px-4 text-sm font-medium",
                "text-primary transition-colors hover:bg-(--color-surface-hover)",
                focusRing,
              )}
            >
              Record unit
            </Link>
          )}

          <UserBlock role={role} user={user} />
          <SignOutButton onClick={onSignOut} />
        </div>
      </div>
    </header>
  );
}
