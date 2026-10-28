// Labels: turn the contract's codes into words people read on screen.
//
// - Every map is a Record over a generated type, so if the contract adds a value
//   (say a new Component), TypeScript fails here until it gets a label.
// - Dates from the contract are plain "YYYY-MM-DD" strings. We format them by hand,
//   without Date's time zone, so "2026-11-30" never shows as 29 Nov west of UTC.

import type { BloodGroup, Component, RequestState, ReservationStatus, Rhesus, UnitState, Urgency } from "../api/types";
import type { StatusBadgeTone } from "../shared/ui/status-badge";

export const BLOOD_GROUP_LABELS: Record<BloodGroup, string> = {
  A: "A",
  B: "B",
  AB: "AB",
  O: "O",
};

export const RHESUS_LABELS: Record<Rhesus, string> = {
  POSITIVE: "Positive (+)",
  NEGATIVE: "Negative (−)",
};

// U+2212 is the real minus sign; screen readers say "minus", not "dash".
const RHESUS_SIGNS: Record<Rhesus, string> = {
  POSITIVE: "+",
  NEGATIVE: "−",
};

export const COMPONENT_LABELS: Record<Component, string> = {
  WHOLE_BLOOD: "Whole blood",
  RED_CELLS: "Red cells",
  PLATELETS: "Platelets",
  PLASMA: "Plasma",
  CRYOPRECIPITATE: "Cryoprecipitate",
};

export const UNIT_STATE_LABELS: Record<UnitState, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  ISSUED: "Issued",
  EXPIRED: "Expired",
  DISCARDED: "Discarded",
};

// Badge colour per state. Colour is extra: the badge always shows the label as text.
export const UNIT_STATE_TONES: Record<UnitState, StatusBadgeTone> = {
  AVAILABLE: "success",
  RESERVED: "info",
  ISSUED: "neutral",
  EXPIRED: "danger",
  DISCARDED: "warning",
};

// Least to most urgent, which is also the order the select lists them.
export const URGENCY_LABELS: Record<Urgency, string> = {
  ROUTINE: "Routine",
  URGENT: "Urgent",
  EMERGENCY: "Emergency",
};

export const REQUEST_STATE_LABELS: Record<RequestState, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  FULFILLED: "Fulfilled",
  LAPSED: "Hold lapsed",
  UNIT_EXPIRED: "Unit expired",
};

export const REQUEST_STATE_TONES: Record<RequestState, StatusBadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  DECLINED: "danger",
  CANCELLED: "neutral",
  FULFILLED: "neutral",
  LAPSED: "warning",
  UNIT_EXPIRED: "danger",
};

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  ACTIVE: "On hold",
  LAPSED: "Hold lapsed",
  ISSUED: "Issued",
  UNIT_EXPIRED: "Unit expired",
  RELEASED: "Released",
   REVERSED: "Reversed",
};

export const RESERVATION_STATUS_TONES: Record<ReservationStatus, StatusBadgeTone> = {
  ACTIVE: "warning",
  LAPSED: "warning",
  ISSUED: "neutral",
  UNIT_EXPIRED: "danger",
  RELEASED: "neutral",
   REVERSED: "neutral",
};

// HistoryEntry.event is a free string in the contract (max 40 chars), so this map lists the
// events we know about and historyEventLabel() falls back to readable words for any other.
export const HISTORY_EVENT_LABELS: Readonly<Record<string, string>> = {
  CREATED: "Request sent",
  APPROVED: "Approved, units reserved",
  DECLINED: "Declined",
  CANCELLED: "Cancelled by the hospital",
  FULFILLED: "Fulfilled, all units issued",
  ISSUED: "Unit issued",
  ISSUE_REVERSED: "Issue reversed",
  HOLD_LAPSED: "Hold lapsed, units returned to stock",
  UNIT_EXPIRED: "A reserved unit expired",
};

/** "APPROVED" → "Approved, units reserved"; an unknown "UNITS_RELEASED" → "Units released". */
export function historyEventLabel(event: string): string {
  if (Object.hasOwn(HISTORY_EVENT_LABELS, event)) return HISTORY_EVENT_LABELS[event];
  const words = event.replace(/_/g, " ").trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : event;
}

/** "O" + "NEGATIVE" → "O−", "AB" + "POSITIVE" → "AB+". */
export function bloodTypeLabel(group: BloodGroup, rhesus: Rhesus): string {
  return `${BLOOD_GROUP_LABELS[group]}${RHESUS_SIGNS[rhesus]}`;
}

/** "O", "NEGATIVE", "RED_CELLS", 2 → "O− red cells × 2". */
export function requestItemLabel(group: BloodGroup, rhesus: Rhesus, component: Component, quantity: number): string {
  return `${bloodTypeLabel(group, rhesus)} ${COMPONENT_LABELS[component].toLowerCase()} × ${quantity}`;
}

/** The map's keys, typed. Object.keys alone returns string[]. */
export function keysOf<K extends string>(labels: Record<K, string>): K[] {
  return Object.keys(labels) as K[];
}

/** True when value is one of the map's keys. Narrows a string from the URL or a select. */
export function isKeyOf<K extends string>(labels: Record<K, string>, value: unknown): value is K {
  return typeof value === "string" && Object.hasOwn(labels, value);
}

export type LabelOption<K extends string> = { value: K; label: string };

/** The map as select options, in the order the map lists them. */
export function labelOptions<K extends string>(labels: Record<K, string>): LabelOption<K>[] {
  return keysOf(labels).map((value) => ({ value, label: labels[value] }));
}

export const BLOOD_GROUP_OPTIONS = labelOptions(BLOOD_GROUP_LABELS);
export const RHESUS_OPTIONS = labelOptions(RHESUS_LABELS);
export const COMPONENT_OPTIONS = labelOptions(COMPONENT_LABELS);
export const UNIT_STATE_OPTIONS = labelOptions(UNIT_STATE_LABELS);
export const URGENCY_OPTIONS = labelOptions(URGENCY_LABELS);
export const REQUEST_STATE_OPTIONS = labelOptions(REQUEST_STATE_LABELS);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-11-30" → "30 Nov 2026". Anything that isn't a valid date comes back unchanged. */
export function formatDate(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  const dayNumber = Number(day);
  if (!monthName || dayNumber < 1 || dayNumber > 31) return isoDate;
  return `${dayNumber} ${monthName} ${year}`;
}

// Date-times (like Availability.computedAt) are real instants, so these do use the viewer's time zone.
const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "2026-10-26T10:02:11Z" → "10:02" (24-hour, local time). Anything that isn't a date-time comes back unchanged. */
export function formatTime(isoDateTime: string): string {
  const time = Date.parse(isoDateTime);
  return Number.isNaN(time) ? isoDateTime : TIME_FORMAT.format(time);
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "2026-10-26T14:00:00Z" → "26 Oct 2026, 14:00" (local time). Anything that isn't a date-time comes back unchanged. */
export function formatDateTime(isoDateTime: string): string {
  const time = Date.parse(isoDateTime);
  return Number.isNaN(time) ? isoDateTime : DATE_TIME_FORMAT.format(time);
}

/** Time left, to the minute: "1h 12m", "45m", "2h", "less than a minute". Nothing left → "". */
export function durationLabel(ms: number): string {
  if (!(ms > 0)) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "less than a minute";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * How long before `now` the date-time was: "just now", "2 min ago", "1 hour ago", "3 days ago".
 * A time slightly in the future (clock skew) counts as "just now". Not a date-time → "".
 */
export function timeAgo(isoDateTime: string, now: number = Date.now()): string {
  const time = Date.parse(isoDateTime);
  if (Number.isNaN(time)) return "";
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
