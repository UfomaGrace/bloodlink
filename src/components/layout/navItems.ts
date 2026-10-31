// navItems: the one list of nav links. The top bar and the staff sidebar both render from it.
//
// - The list order is the order every role sees, and items of a group sit next to each other,
//   so navGroupsFor() keeps the order too. Only routes that exist in App.tsx belong here.
// - navGroupsFor(): the staff sidebar's groups. The leading Overview and Requests items share one
//   group with no label (labelled: false); every other group shows its name.

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

// Groups that sit together at the top of the sidebar, under no label.
const UNLABELLED_GROUPS: readonly NavGroup[] = ["Overview", "Requests"];

export type NavGroupEntry = { group: NavGroup; labelled: boolean; items: NavItem[] };

export function navGroupsFor(role: Role): NavGroupEntry[] {
  const groups: NavGroupEntry[] = [];
  for (const item of navItemsFor(role)) {
    const labelled = !UNLABELLED_GROUPS.includes(item.group);
    const group = labelled ? item.group : UNLABELLED_GROUPS[0];
    const last = groups.at(-1);
    if (last?.group === group) last.items.push(item);
    else groups.push({ group, labelled, items: [item] });
  }
  return groups;
}
