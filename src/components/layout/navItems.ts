// navItems: the one list of nav links. The top bar and the staff sidebar both render from it.
//
// - The list order is the order every role sees, and items of a group sit next to each other,
//   so navGroupsFor() keeps the order too. Only routes that exist in App.tsx belong here.
// - pageTitleFor(): what the staff top bar shows for the current path. A nav route shows its own
//   label; a sub-route shows its parent (as a link) and a fixed page name. No data is fetched.

import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Droplets,
  LayoutDashboard,
  PlusCircle,
  Search,
  type LucideIcon,
} from "lucide-react";
import { matchPath } from "react-router";
import type { Role } from "../../api/types";

export type NavGroup = "Overview" | "Requests" | "Inventory" | "Donations";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  group: NavGroup;
  roles: readonly Role[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, group: "Overview", roles: ["BANK_STAFF", "ADMIN"] },
  { label: "Find blood", to: "/availability", icon: Search, group: "Requests", roles: ["HOSPITAL_STAFF", "ADMIN"] },
  {
    label: "Requests",
    to: "/requests",
    icon: ClipboardList,
    group: "Requests",
    roles: ["BANK_STAFF", "HOSPITAL_STAFF", "ADMIN"],
  },
  { label: "Units", to: "/units", icon: Droplets, group: "Inventory", roles: ["BANK_STAFF", "ADMIN"] },
  { label: "Record unit", to: "/units/new", icon: PlusCircle, group: "Inventory", roles: ["BANK_STAFF"] },
  {
    label: "Donation slots",
    to: "/slots",
    icon: CalendarDays,
    group: "Donations",
    roles: ["BANK_STAFF", "ADMIN", "DONOR"],
  },
  { label: "New slot", to: "/slots/new", icon: CalendarPlus, group: "Donations", roles: ["BANK_STAFF"] },
  { label: "My bookings", to: "/bookings", icon: CalendarCheck, group: "Donations", roles: ["DONOR"] },
];

export function navItemsFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function navGroupsFor(role: Role): { group: NavGroup; items: NavItem[] }[] {
  const groups: { group: NavGroup; items: NavItem[] }[] = [];
  for (const item of navItemsFor(role)) {
    const last = groups.at(-1);
    if (last?.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}

// Sub-routes, checked after the nav routes so /units/new is never read as /units/:unitId.
const SUB_PAGES: readonly { pattern: string; parent: string; label: string }[] = [
  { pattern: "/requests/new", parent: "/requests", label: "New request" },
  { pattern: "/requests/:requestId", parent: "/requests", label: "Request details" },
  { pattern: "/units/:unitId", parent: "/units", label: "Unit details" },
  { pattern: "/slots/:slotId", parent: "/slots", label: "Donation slot" },
];

export type PageTitle = { label: string; parent?: NavItem };

export function pageTitleFor(pathname: string, role: Role): PageTitle | null {
  const items = navItemsFor(role);
  const own = items.find((item) => matchPath(item.to, pathname));
  if (own) return { label: own.label };

  const sub = SUB_PAGES.find((page) => matchPath(page.pattern, pathname));
  if (!sub) return null;
  return { label: sub.label, parent: items.find((item) => item.to === sub.parent) };
}
