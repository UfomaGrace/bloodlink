// Layout: the frame around every signed-in screen.
//
// - Header, <main id="main"> with the route's <Outlet />, footer. RequireAuth (App.tsx)
//   has already sent signed-out users to /login before this renders.
// - Nav shows only the links the user's role can open. NavLink sets aria-current="page"
//   on the active link; we style it from the isActive flag.
// - "Skip to main content" is the first thing a keyboard user reaches. It moves focus into
//   <main> (tabIndex={-1}) so the next Tab starts inside the page, not back in the header.
// - Phone width: the nav drops to its own row and scrolls sideways inside itself,
//   so the page never scrolls horizontally. Long names truncate.
//
// RequireRole: wrap a route's page so other roles get a friendly message instead.
// HomeRedirect: "/" sends each role to its starting page.

import { Droplet } from "lucide-react";
import { useRef, type MouseEvent, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet } from "react-router";
import { IS_MOCK } from "../../api/client";
import type { Role } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { cn } from "../../shared/cn";
import { Button } from "../../shared/ui/button";

type NavItem = { to: string; label: string };

const REQUESTS: NavItem = { to: "/requests", label: "Requests" };
const UNITS: NavItem = { to: "/units", label: "Units" };
const RECORD_UNIT: NavItem = { to: "/units/new", label: "Record unit" };
const FIND_BLOOD: NavItem = { to: "/availability", label: "Find blood" };

// Each role gets its own list, in the order that role uses them most.
const NAV_BY_ROLE: Record<Role, readonly NavItem[]> = {
  BANK_STAFF: [REQUESTS, UNITS, RECORD_UNIT],
  HOSPITAL_STAFF: [FIND_BLOOD, REQUESTS],
  ADMIN: [REQUESTS, UNITS, FIND_BLOOD],
  DONOR: [],
};

// Shown under the name when the user has no organisation (administrator, donor).
const ROLE_LABELS: Record<Role, string> = {
  BANK_STAFF: "Blood bank staff",
  HOSPITAL_STAFF: "Hospital staff",
  ADMIN: "Administrator",
  DONOR: "Donor",
};

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

export default function Layout() {
  const { session, role, signOut } = useAuth();
  const mainRef = useRef<HTMLElement>(null);

  // RequireAuth normally catches this first; kept so `session` is non-null below.
  if (!session || !role) return <Navigate to="/login" replace />;

  const { user } = session;
  const subtitle = user.organisation?.name ?? ROLE_LABELS[role];
  const navItems = NAV_BY_ROLE[role];

  // Focus <main> directly instead of relying on the #main hash, which the router would see.
  function skipToMain(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    mainRef.current?.focus();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <a
        href="#main"
        onClick={skipToMain}
        className={cn(
          "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50",
          "focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-primary focus:px-4",
          "focus:text-sm focus:font-medium focus:text-(--color-on-primary)",
          focusRing,
        )}
      >
        Skip to main content
      </a>

      {/* Dark header. Teal on slate is too faint for a focus ring, so it turns white in here. */}
      <header className="bg-secondary text-(--color-on-secondary) [--color-focus:var(--color-on-secondary)]">
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
                          // Active: white text on a lifted background, with a crimson underline as the brand touch.
                          "inline-flex min-h-11 items-center whitespace-nowrap rounded-t-md border-b-2 px-3 text-sm font-medium transition-colors",
                          isActive
                            ? "border-brand-accent bg-(--color-secondary-hover) text-(--color-on-secondary)"
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
              onClick={() => signOut()}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        id="main"
        tabIndex={-1}
        className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 focus:outline-none sm:px-8 sm:py-8"
      >
        <Outlet />
      </main>

      <footer className="border-t border--border">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-sm text-muted-foreground sm:px-8">
          Demonstration product. All data is fictional.
          {IS_MOCK && " Running against a mock server (simulated data)."}
        </p>
      </footer>
    </div>
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
  if (role === "BANK_STAFF") return <Navigate to="/requests" replace />;
  if (role === "HOSPITAL_STAFF") return <Navigate to="/availability" replace />;
  return <Navigate to="/requests" replace />;
}
