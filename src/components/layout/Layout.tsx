// Layout: the frame around every signed-in screen.
//
// - Header, <main id="main"> with the route's <Outlet />, footer. RequireAuth (App.tsx)
//   has already sent signed-out users to /login before this renders.
// - Nav links come from navItems.ts and show only what the user's role can open. NavLink sets
//   aria-current="page" on the active link; we style it from the isActive flag.
// - "Skip to main content" is the first thing a keyboard user reaches. It moves focus into
//   <main> (tabIndex={-1}) so the next Tab starts inside the page, not back in the header.
// - Hospital staff and donors: the dark top bar with the nav in it (TopNavHeader).
// - Bank staff and the administrator, lg and up: the staff shell, a full-width sticky white top
//   bar (StaffTopBar) over a dark nav sidebar (StaffSidebar) and the content column.
//   Below lg they get TopNavHeader.
//   Both are rendered and CSS shows one; display:none keeps the other out of the
//   accessibility tree, so there is only ever one "Main" nav. The service status check runs
//   once, in StaffShell, which stays mounted across routes. Once the service has answered,
//   the top bar keeps saying "Connected" (the hook itself clears "ready" after a few seconds).
// - The sidebar collapses to icons from the top bar's toggle; the choice is kept in
//   localStorage (default expanded; storage that throws is ignored).
// - Phone width: the nav drops to its own row and scrolls sideways inside itself,
//   so the page never scrolls horizontally. Long names truncate.
//
// RequireRole: wrap a route's page so other roles get a friendly message instead.
// HomeRedirect: "/" sends each role to its starting page.

import { Droplet } from "lucide-react";
import { useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Link, Navigate, NavLink, Outlet } from "react-router";
import { IS_MOCK } from "../../api/client";
import type { Role, User } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { useServiceStatus } from "../../hooks/useServiceStatus";
import { cn } from "../../shared/cn";
import { Button } from "../../shared/ui/button";
import { focusRing, onDarkFocus, ROLE_LABELS } from "./layoutStyles";
import { navItemsFor } from "./navItems";
import { StaffSidebar } from "./StaffSidebar";
import { StaffTopBar } from "./StaffTopBar";

const STAFF_SHELL_ROLES: readonly Role[] = ["BANK_STAFF", "ADMIN"];

const SIDEBAR_ID = "staff-sidebar";
export const SIDEBAR_COLLAPSED_KEY = "bloodlink.staffSidebarCollapsed";

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
}

type SkipHandler = (event: MouseEvent<HTMLAnchorElement>) => void;

export default function Layout() {
  const { session, role, signOut } = useAuth();
  const mainRef = useRef<HTMLElement>(null);

  // RequireAuth normally catches this first; kept so `session` is non-null below.
  if (!session || !role) return <Navigate to="/login" replace />;

  const { user } = session;

  // Focus <main> directly instead of relying on the #main hash, which the router would see.
  function skipToMain(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    mainRef.current?.focus();
  }

  if (STAFF_SHELL_ROLES.includes(role)) {
    return <StaffShell role={role} user={user} mainRef={mainRef} onSkip={skipToMain} onSignOut={() => signOut()} />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SkipLink onClick={skipToMain} />
      <TopNavHeader role={role} user={user} onSignOut={() => signOut()} />
      <PageMain mainRef={mainRef} />
      <Footer />
    </div>
  );
}

function StaffShell({
  role,
  user,
  mainRef,
  onSkip,
  onSignOut,
}: {
  role: Role;
  user: User;
  mainRef: RefObject<HTMLElement | null>;
  onSkip: SkipHandler;
  onSignOut: () => void;
}) {
  const serviceStatus = useServiceStatus();
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);

  // Keep "Connected" once the service has answered; set during render, not in an effect.
  const [seenReady, setSeenReady] = useState(false);
  if (serviceStatus === "ready" && !seenReady) setSeenReady(true);
  const shownStatus = serviceStatus ?? (seenReady ? "ready" : null);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    writeSidebarCollapsed(next);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SkipLink onClick={onSkip} />
      <TopNavHeader role={role} user={user} onSignOut={onSignOut} className="lg:hidden" />
      <StaffTopBar
        role={role}
        user={user}
        serviceStatus={shownStatus}
        sidebarId={SIDEBAR_ID}
        sidebarCollapsed={collapsed}
        onToggleSidebar={toggleSidebar}
        onSignOut={onSignOut}
        className="hidden lg:flex"
      />
      <div className="flex min-w-0 flex-1">
        <StaffSidebar id={SIDEBAR_ID} role={role} collapsed={collapsed} className="hidden lg:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          <PageMain mainRef={mainRef} />
          <Footer />
        </div>
      </div>
    </div>
  );
}

function SkipLink({ onClick }: { onClick: SkipHandler }) {
  return (
    <a
      href="#main"
      onClick={onClick}
      className={cn(
        "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50",
        "focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-surface focus:px-4",
        "focus:text-sm focus:font-medium focus:text-foreground",
        focusRing,
      )}
    >
      Skip to main content
    </a>
  );
}

function TopNavHeader({
  role,
  user,
  onSignOut,
  className,
}: {
  role: Role;
  user: User;
  onSignOut: () => void;
  className?: string;
}) {
  const subtitle = user.organisation?.name ?? ROLE_LABELS[role];
  const navItems = navItemsFor(role);

  return (
    <header className={cn("bg-secondary text-(--color-on-secondary)", onDarkFocus, className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-8">
        <Link
          to="/"
          className={cn(
            "flex min-h-11 shrink-0 items-center gap-2 rounded-sm text-lg font-semibold tracking-tight",
            focusRing,
          )}
        >
          <Droplet aria-hidden="true" className="size-5 fill-brand-accent text-brand-accent" />
          BloodLink
        </Link>

        {/* On phones this is the last row, full width; from sm it sits between logo and user. */}
        {navItems.length > 0 && (
          <nav aria-label="Main" className="order-last w-full min-w-0 sm:order-0 sm:w-auto sm:flex-1">
            {/* p-1 keeps the focus ring from being clipped by the scroll container. */}
            <ul className="-mx-1 flex gap-1 overflow-x-auto p-1">
              {navItems.map((item) => (
                <li key={item.to} className="shrink-0">
                  {/* end: /units must not also light up on /units/new. */}
                  <NavLink
                    to={item.to}
                    end
                    className={({ isActive }) =>
                      cn(
                        // Active: white text on a lifted background, with a white underline.
                        "inline-flex min-h-11 items-center whitespace-nowrap rounded-t-md border-b-2 px-3 text-sm font-medium transition-colors",
                        isActive
                          ? "border-(--color-on-secondary) bg-(--color-secondary-hover) text-(--color-on-secondary)"
                          : "border-transparent text-(--color-on-secondary-muted) hover:bg-(--color-secondary-hover) hover:text-(--color-on-secondary)",
                        focusRing,
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-3">
          <p className="min-w-0 text-right text-sm leading-tight">
            <span className="block truncate font-medium">{user.displayName}</span>
            <span className="block truncate text-(--color-on-secondary-muted)">{subtitle}</span>
          </p>
          {/* RequireAuth sees the cleared session and redirects to /login. */}
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 shrink-0 border border-(--color-on-secondary-muted) text-(--color-on-secondary) hover:bg-(--color-secondary-hover)"
            onClick={onSignOut}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

function PageMain({ mainRef }: { mainRef: RefObject<HTMLElement | null> }) {
  return (
    <main
      ref={mainRef}
      id="main"
      tabIndex={-1}
      className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 focus:outline-none sm:px-8 sm:py-8"
    >
      <Outlet />
    </main>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <p className="mx-auto w-full max-w-6xl px-4 py-4 text-sm text-muted-foreground sm:px-8">
        Demonstration product. All data is fictional.
        {IS_MOCK && " Running against a mock server (simulated data)."}
      </p>
    </footer>
  );
}

export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { role } = useAuth();

  if (role && roles.includes(role)) return <>{children}</>;

  return (
    <section aria-labelledby="no-access-heading" className="flex flex-col items-center gap-3 py-10 text-center">
      <h1 id="no-access-heading" className="text-2xl font-semibold tracking-tight">
        This page is not available for your role
      </h1>
      <p className="max-w-prose text-muted-foreground">
        Your account can't open this page. Head back to your start page to carry on.
      </p>
      <Link
        to="/"
        className={cn(
          "mt-2 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium",
          "text-(--color-on-primary) hover:bg-(--color-primary-hover)",
          focusRing,
        )}
      >
        Go to your start page
      </Link>
    </section>
  );
}

export function HomeRedirect() {
  const { role } = useAuth();
  if (role === "BANK_STAFF" || role === "ADMIN") return <Navigate to="/dashboard" replace />;
  if (role === "HOSPITAL_STAFF") return <Navigate to="/availability" replace />;
  if (role === "DONOR") return <Navigate to="/slots" replace />;
  return <Navigate to="/requests" replace />;
}
