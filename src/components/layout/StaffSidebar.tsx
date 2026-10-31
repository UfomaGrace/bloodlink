// StaffSidebar: the dark sidebar of the staff shell (bank staff and the administrator, lg and up).
//
// - Organisation card, the nav in its groups, then the user and Sign out at the bottom.
// - Sticky under the 4rem top bar and exactly as tall as the rest of the viewport; the nav
//   scrolls inside it if it ever runs out of room, so Sign out stays in view.
// - NavLink sets aria-current="page" on the active item. `end`: /units must not also light up on
//   /units/new. A wrapper <div>, not <aside>: it is the main nav, not complementary content.

import { NavLink } from "react-router";
import type { Role, User } from "../../api/types";
import { cn } from "../../shared/cn";
import { Button } from "../../shared/ui/button";
import { focusRing, onDarkFocus, ROLE_LABELS } from "./layoutStyles";
import { navGroupsFor } from "./navItems";

export function StaffSidebar({
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
  const organisation = role === "ADMIN" ? null : user.organisation;
  const groups = navGroupsFor(role);

  return (
    <div
      data-testid="staff-sidebar"
      className={cn(
        "sticky top-16 h-[calc(100dvh-4rem)] w-64 shrink-0 flex-col self-start bg-secondary text-on-secondary",
        onDarkFocus,
        className,
      )}
    >
      <div className="mx-4 mt-4 rounded-md bg-(--color-secondary-hover) px-3 py-2 text-sm leading-snug">
        {role === "ADMIN" ? (
          <p className="font-medium">Administration · All banks</p>
        ) : (
          <>
            <p className="font-medium wrap-break-word">{organisation?.name ?? ROLE_LABELS[role]}</p>
            {organisation?.area && <p className="text-on-secondary-muted">{organisation.area}</p>}
          </>
        )}
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-5">
          {groups.map(({ group, items }) => {
            const labelId = `nav-group-${group.toLowerCase()}`;
            return (
              <div key={group}>
                <p id={labelId} className="mb-1 px-3 text-xs font-medium tracking-wider text-on-secondary-muted uppercase">
                  {group}
                </p>
                <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
                  {items.map(({ to, label, icon: Icon }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end
                        className={({ isActive }) =>
                          cn(
                            "flex min-h-11 items-center gap-3 rounded-r-md border-l-4 px-3 text-sm font-medium transition-colors",
                            isActive
                              ? "border-on-secondary bg-(--color-secondary-hover) text-on-secondary"
                              : "border-transparent text-on-secondary-muted hover:bg-(--color-secondary-hover) hover:text-on-secondary",
                            focusRing,
                          )
                        }
                      >
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        {label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--color-on-secondary)_15%,transparent)] px-4 py-4">
        <p className="min-w-0 px-3 text-sm leading-tight">
          <span className="block truncate font-medium">{user.displayName}</span>
          <span className="block truncate text-on-secondary-muted">{ROLE_LABELS[role]}</span>
        </p>
        {/* RequireAuth sees the cleared session and redirects to /login. */}
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 w-full border border-(--color-on-secondary-muted) text-(--color-on-secondary) hover:bg-(--color-secondary-hover)"
          onClick={onSignOut}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
