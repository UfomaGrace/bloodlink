// StaffSidebar: the dark nav column of the staff shell (bank staff and the administrator, lg and up).
//
// - Nav only. It sits under the white top bar (sticky at top-15, the rest of the viewport tall);
//   the logo, organisation, user and Sign out are all in StaffTopBar.
// - Groups from navGroupsFor(): the first has no label; the others have a small uppercase label
//   that also names their list.
// - Active: aria-current="page" on the exact route. On a detail route (/requests/:id, …) the
//   parent item gets the same look with aria-current="true" ("current section", not this page).
//   An exact match always wins, so /units/new lights up only Record unit.
// - Collapsed (68px): icons only. Each link keeps its name through aria-label, and shows its label
//   as a tooltip on hover and on keyboard focus. The tooltip is aria-hidden (the name is already
//   on the link) and Escape hides it until the pointer or focus leaves that link (WCAG 1.4.13).
//   Group labels become thin dividers; the lists keep their names through sr-only text.
// - A wrapper <div>, not <aside>: it is the main nav, not complementary content.

import { useEffect, useRef, useState } from "react";
import { Link, matchPath, useLocation } from "react-router";
import type { Role } from "../../api/types";
import { cn } from "../../shared/cn";
import { focusRing, onDarkFocus } from "./layoutStyles";
import { navGroupsFor, navItemsFor } from "./navItems";

type ActiveState = "page" | "section" | null;

function activeStateFor(to: string, pathname: string, role: Role): ActiveState {
  if (matchPath({ path: to, end: true }, pathname)) return "page";
  const exactElsewhere = navItemsFor(role).some((item) => matchPath({ path: item.to, end: true }, pathname));
  if (!exactElsewhere && matchPath({ path: `${to}/:id`, end: true }, pathname)) return "section";
  return null;
}

export function StaffSidebar({
  id,
  role,
  collapsed,
  className,
}: {
  id: string;
  role: Role;
  collapsed: boolean;
  className?: string;
}) {
  const { pathname } = useLocation();
  const groups = navGroupsFor(role);

  // The link whose tooltip Escape has hidden; cleared when the pointer or focus leaves it.
  const [dismissedTip, setDismissedTip] = useState<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!collapsed) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const focused = navRef.current?.contains(document.activeElement)
        ? (document.activeElement as HTMLElement).dataset.navTo
        : undefined;
      const target = hoveredRef.current ?? focused;
      if (target) setDismissedTip(target);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapsed]);

  function leave(to: string) {
    if (hoveredRef.current === to) hoveredRef.current = null;
    setDismissedTip((current) => (current === to ? null : current));
  }

  return (
    <div
      id={id}
      data-testid="staff-sidebar"
      data-collapsed={collapsed || undefined}
      className={cn(
        "sticky top-15 z-20 h-[calc(100dvh-60px)] shrink-0 flex-col self-start bg-secondary text-on-secondary",
        "transition-[width] duration-150 ease-out motion-reduce:transition-none",
        collapsed ? "w-17" : "w-60",
        onDarkFocus,
        className,
      )}
    >
      {/* Collapsed, nothing scrolls, so the tooltips can stick out past the edge. */}
      <nav
        ref={navRef}
        aria-label="Main"
        className={cn("min-h-0 flex-1 px-3 py-3", collapsed ? "overflow-visible" : "overflow-y-auto")}
      >
        {groups.map(({ group, labelled, items }) => {
          const labelId = `nav-group-${group.toLowerCase()}`;
          return (
            <div key={group}>
              {labelled &&
                (collapsed ? (
                  <>
                    <div aria-hidden="true" className="mx-3 my-2.5 h-px bg-on-secondary-muted/30" />
                    <p id={labelId} className="sr-only">
                      {group}
                    </p>
                  </>
                ) : (
                  <p
                    id={labelId}
                    className="mt-4.5 mb-1.5 px-3 text-[11px] leading-4 font-medium tracking-wider text-on-secondary-muted uppercase"
                  >
                    {group}
                  </p>
                ))}
              <ul aria-labelledby={labelled ? labelId : undefined} className="flex flex-col gap-0.5">
                {items.map(({ to, label, icon: Icon }) => {
                  const active = activeStateFor(to, pathname, role);
                  return (
                    <li key={to}>
                      <Link
                        to={to}
                        data-nav-to={to}
                        aria-current={active === "page" ? "page" : active === "section" ? "true" : undefined}
                        aria-label={collapsed ? label : undefined}
                        onMouseEnter={() => {
                          hoveredRef.current = to;
                        }}
                        onMouseLeave={() => leave(to)}
                        onBlur={() => leave(to)}
                        className={cn(
                          "group relative flex min-h-11 items-center rounded-md text-sm transition-colors",
                          collapsed ? "justify-center px-0" : "gap-3 px-3",
                          active
                            ? "bg-(--color-secondary-hover) font-medium text-on-secondary"
                            : "text-on-secondary-muted hover:bg-(--color-secondary-hover) hover:text-on-secondary",
                          focusRing,
                        )}
                      >
                        <Icon aria-hidden="true" className="size-4 shrink-0" />
                        {collapsed ? (
                          <span
                            aria-hidden="true"
                            data-tooltip
                            className={cn(
                              "pointer-events-none absolute top-1/2 left-full z-40 ml-3 -translate-y-1/2",
                              "rounded-md bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-surface shadow-md",
                              "invisible group-hover:visible group-focus-visible:visible",
                              dismissedTip === to && "hidden",
                            )}
                          >
                            {label}
                          </span>
                        ) : (
                          <span className="min-w-0 truncate">{label}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
