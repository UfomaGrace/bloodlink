// Dashboard: pure helpers for the figures GET /dashboard sends (pages/DashboardPage).
//
// - Every figure comes from the service. These helpers only order, label and measure what it sent;
//   they never fill in groups it left out or hide odd values (a negative count shows as sent).
// - availableByGroup and lowGroups count every component together (red cells, platelets, …), so
//   the screen labels them "All components combined".
// - `now` is always passed in (milliseconds), so the helpers stay pure and easy to test.

import type { ActivityEntry, Dashboard, GroupCount, HoldEndingSoon, Organisation } from "../api/types";
import { daysUntilExpiry } from "./expiry";
import { BLOOD_GROUP_LABELS, bloodTypeLabel, durationLabel, keysOf, RHESUS_LABELS } from "./labels";
import type { HoldTiming } from "./holds";

const GROUP_ORDER = keysOf(BLOOD_GROUP_LABELS);
const RHESUS_ORDER = keysOf(RHESUS_LABELS);

/** "All banks" when the service summarised every bank (bank is null), otherwise the bank's name. */
export function dashboardScopeLabel(bank: Organisation | null | undefined): string {
  return bank ? bank.name : "All banks";
}

export type GroupRow = {
  key: string;
  label: string;
  availableUnits: number;
  low: boolean;
};

function groupKey(group: Pick<GroupCount, "bloodGroup" | "rhesus">): string {
  return `${group.bloodGroup}|${group.rhesus}`;
}

/** A+, A−, B+, B−, AB+, AB−, O+, O−. */
function compareGroups(a: GroupCount, b: GroupCount): number {
  return (
    GROUP_ORDER.indexOf(a.bloodGroup) - GROUP_ORDER.indexOf(b.bloodGroup) ||
    RHESUS_ORDER.indexOf(a.rhesus) - RHESUS_ORDER.indexOf(b.rhesus)
  );
}

/** The groups the service sent, in the usual order, each flagged if it is also in lowGroups. */
export function groupRows(dashboard: Pick<Dashboard, "availableByGroup" | "lowGroups">): GroupRow[] {
  const low = new Set(dashboard.lowGroups.map(groupKey));
  return [...dashboard.availableByGroup].sort(compareGroups).map((group) => ({
    key: groupKey(group),
    label: bloodTypeLabel(group.bloodGroup, group.rhesus),
    availableUnits: group.availableUnits,
    low: low.has(groupKey(group)),
  }));
}

/** Low groups, fewest units first; ties in the usual group order. */
export function lowGroupsFewestFirst(groups: readonly GroupCount[]): GroupCount[] {
  return [...groups].sort((a, b) => a.availableUnits - b.availableUnits || compareGroups(a, b));
}

/** Sum of available units over the groups sent. */
export function totalAvailable(groups: readonly GroupCount[]): number {
  return groups.reduce((sum, group) => sum + group.availableUnits, 0);
}

/** Bar length as a whole percentage of `max`, 0–100. Zero, negative or non-finite values give 0. */
export function barPercent(units: number, max: number): number {
  if (!(units > 0) || !(max > 0) || !Number.isFinite(units) || !Number.isFinite(max)) return 0;
  return Math.min(100, Math.round((units / max) * 100));
}

/** The holds as the hold clock reads them: each counts as running until its end passes. */
export function holdClockEntries(holds: readonly HoldEndingSoon[]): HoldTiming[] {
  return holds.map((hold) => ({ status: "ACTIVE", holdExpiresAt: hold.holdExpiresAt }));
}

export type HoldTimeLeft = { lapsed: boolean; label: string };

/** "4m left", "1h 12m left", "less than a minute left"; at or after the end, "Lapsed". */
export function holdTimeLeft(holdExpiresAt: string, now: number): HoldTimeLeft {
  const end = Date.parse(holdExpiresAt);
  if (Number.isNaN(end)) return { lapsed: false, label: "" };
  if (end <= now) return { lapsed: true, label: "Lapsed" };
  return { lapsed: false, label: `${durationLabel(end - now)} left` };
}

/** "Expires today", "Expires tomorrow", "Expires in 3 days", "Expired". Not a date → "". */
export function expiryLabel(expiryDate: string, now: number): string {
  const days = daysUntilExpiry(expiryDate, now);
  if (Number.isNaN(days)) return "";
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

export const ACTIVITY_SUBJECT_LABELS: Record<ActivityEntry["subject"], string> = {
  UNIT: "Unit",
  REQUEST: "Request",
  BOOKING: "Booking",
};

/**
 * Nothing recorded yet: no units in any group, nothing expiring, no holds, no open requests and
 * no activity. (A real first-use answer also lists every group as low, so lowGroups is not checked.)
 */
export function isFirstUse(dashboard: Dashboard): boolean {
  return (
    dashboard.availableByGroup.every((group) => group.availableUnits === 0) &&
    dashboard.unitsExpiringSoon.length === 0 &&
    dashboard.holdsEndingSoon.length === 0 &&
    dashboard.openRequests.pending === 0 &&
    dashboard.openRequests.approved === 0 &&
    dashboard.recentActivity.length === 0
  );
}
