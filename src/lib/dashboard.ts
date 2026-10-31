// Dashboard: pure helpers for the figures GET /dashboard sends (pages/DashboardPage).
//
// - Every figure comes from the service. These helpers only order, label and measure what it sent;
//   they never fill in groups it left out or hide odd values (a negative count shows as sent).
// - availableByGroup and lowGroups count every component together (red cells, platelets, …), so
//   the screen labels them "All components combined".
// - `now` is always passed in (milliseconds), so the helpers stay pure and easy to test.
// - The Dashboard has no list of requests, so "Waiting for you" and the emergency strip read
//   GET /requests?state=PENDING (every page, up to a limit) and order it here.
// - Days and times are Lagos ones, where the banks are.

import type { ApiResponse } from "../api/client";
import type {
  ActivityEntry,
  BloodRequest,
  BloodRequestPage,
  Dashboard,
  GroupCount,
  HoldEndingSoon,
  Organisation,
  RequestQuery,
} from "../api/types";
import { formatLagosTime } from "./donations";
import { lagosToday } from "./expiry";
import { BLOOD_GROUP_LABELS, bloodTypeLabel, durationLabel, historyEventLabel, keysOf, RHESUS_LABELS } from "./labels";
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

/** Time left on the next hold still running, as "28m" or "1h 12m"; null when none is. */
export function nextHoldLeft(holds: readonly HoldEndingSoon[], now: number): string | null {
  for (const hold of holds) {
    const end = Date.parse(hold.holdExpiresAt);
    if (end > now) return durationLabel(end - now);
  }
  return null;
}

// ---- Pending requests (GET /requests?state=PENDING) ----

/** Requests per page when reading the pending list (the contract's maximum). */
export const PENDING_PAGE_SIZE = 100;
/** Pages read before we stop and say there may be more. Prism makes up totalItems, so there must be a limit. */
export const PENDING_PAGE_LIMIT = 10;

export type PendingRequests = {
  items: BloodRequest[];
  /** How many were read, when we stopped before reading them all; null when we read them all. */
  truncatedAt: number | null;
};

type ListRequests = (query: RequestQuery, signal?: AbortSignal) => Promise<ApiResponse<BloodRequestPage>>;

/** Every pending request the caller can see, page by page up to PENDING_PAGE_LIMIT. */
export async function readPendingRequests(listRequests: ListRequests, signal?: AbortSignal): Promise<PendingRequests> {
  const items: BloodRequest[] = [];
  let totalItems = 0;
  for (let page = 0; page < PENDING_PAGE_LIMIT; page++) {
    const { data } = await listRequests({ state: "PENDING", page, size: PENDING_PAGE_SIZE }, signal);
    items.push(...data.items);
    totalItems = data.totalItems;
    if (data.items.length === 0 || items.length >= totalItems) break;
  }
  return { items, truncatedAt: items.length < totalItems ? items.length : null };
}

function createdTime(request: BloodRequest): number {
  const time = Date.parse(request.createdAt);
  return Number.isNaN(time) ? Infinity : time;
}

/**
 * The requests waiting for a decision at `bankId` (every bank when undefined): emergencies first,
 * then oldest first. The state is checked again because the mock ignores the filter, and the bank
 * here because the list endpoint has no bank filter (the administrator sees every bank).
 */
export function waitingRequests(items: readonly BloodRequest[], bankId: string | undefined): BloodRequest[] {
  return items
    .filter((r) => r.state === "PENDING" && (bankId === undefined || r.bank.id === bankId))
    .sort(
      (a, b) =>
        Number(b.urgency === "EMERGENCY") - Number(a.urgency === "EMERGENCY") || createdTime(a) - createdTime(b),
    );
}

/** Units available in the request's group, as the dashboard counted them; null when that group wasn't sent. */
export function availableFor(dashboard: Pick<Dashboard, "availableByGroup">, request: BloodRequest): number | null {
  const group = dashboard.availableByGroup.find((g) => g.bloodGroup === request.bloodGroup && g.rhesus === request.rhesus);
  return group ? group.availableUnits : null;
}

/** "1 unit", "3 units". */
export function unitsLabel(n: number): string {
  return n === 1 ? "1 unit" : `${n} units`;
}

// ---- Lagos days and times ----

const LAGOS_LONG_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  weekday: "long",
  day: "numeric",
  month: "long",
});

const LAGOS_SHORT_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short" });

// Built from the parts: the punctuation between them differs between ICU versions.
function partsOf(format: Intl.DateTimeFormat, time: number) {
  const parts = format.formatToParts(time);
  return (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
}

/** "Saturday 31 October": the Lagos day at `now`. */
export function lagosDayLabel(now: number): string {
  const part = partsOf(LAGOS_LONG_DAY, now);
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * "08:12" on the Lagos day of `now`, "Yesterday 08:12" the day before, "29 Oct 08:12" on any
 * other day. Never "N days ago". Not a date-time → unchanged.
 */
export function lagosWhen(isoDateTime: string, now: number): string {
  const time = Date.parse(isoDateTime);
  if (Number.isNaN(time)) return isoDateTime;
  const clock = formatLagosTime(isoDateTime);
  const day = lagosToday(time);
  if (day === lagosToday(now)) return clock;
  if (day === lagosToday(now - DAY_MS)) return `Yesterday ${clock}`;
  const part = partsOf(LAGOS_SHORT_DAY, time);
  return `${part("day")} ${part("month")} ${clock}`;
}

/** "Request REQ-2026-000321: approved, units reserved (Tunde Bakare)." */
export function activitySentence(entry: ActivityEntry): string {
  const event = historyEventLabel(entry.event);
  const what = event.charAt(0).toLowerCase() + event.slice(1);
  return `${ACTIVITY_SUBJECT_LABELS[entry.subject] ?? "Record"} ${entry.reference}: ${what} (${entry.actor}).`;
}
