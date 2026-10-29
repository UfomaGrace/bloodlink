// Donations: slot wording, the date-range rule, Lagos times, and who can do what with a slot or booking.
//
// - Slots run at banks in Lagos, so their times are shown in Africa/Lagos and labelled
//   "Lagos time", whatever the viewer's own time zone. Lagos is UTC+1 all year: it has no
//   daylight saving, so a fixed +01:00 offset is always right there.
// - GET /donation-slots takes `from` and `to` as Lagos dates ("YYYY-MM-DD"), with `to` at most
//   31 days after `from` (contract listDonationSlots). checkSlotRange enforces that in the form,
//   so the service never has to refuse it.
// - The service has the last word (403 / 409). The can* helpers only decide which buttons to
//   show, so nobody is offered an action the service would refuse.
// - Pure: `now` is passed in (milliseconds), so the rules are easy to test.

import type { ClientErrorCode } from "../api/client";
import type { Booking, BookingStatus, DonationSlot } from "../api/types";
import { lagosToday } from "./expiry";
import { BOOKING_STATUS_LABELS, formatDate } from "./labels";
import type { Viewer } from "./requestActions";

/** Most days `to` may be after `from` in GET /donation-slots. */
export const MAX_SLOT_RANGE_DAYS = 31;

const DAY_MS = 24 * 60 * 60_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "3 of 10 places left"; "No places left (10 of 10 booked)" when full. */
export function placesLeftLabel(slot: Pick<DonationSlot, "placesLeft" | "capacity">): string {
  if (slot.placesLeft <= 0) return `No places left (${slot.capacity} of ${slot.capacity} booked)`;
  return `${slot.placesLeft} of ${slot.capacity} ${slot.capacity === 1 ? "place" : "places"} left`;
}

export function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** "2026-10-29" + 31 → "2026-11-29". Calendar arithmetic in UTC, so no time zone can shift the day. */
export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Why a from/to pair can't be sent to GET /donation-slots, or null when it can. Either may be
 * empty: `from` then means today in Lagos (the service's default) and an empty `to` lets the
 * service use its 14-day default, which is always within the limit.
 */
export function checkSlotRange(from: string, to: string, now: number): string | null {
  if (!to) return null;
  const start = from || lagosToday(now);
  if (to < start) return "The last day must be on or after the first day.";
  const latest = addDays(start, MAX_SLOT_RANGE_DAYS);
  if (to > latest) {
    return `Choose a range of ${MAX_SLOT_RANGE_DAYS} days or fewer. With this first day, the last day can be ${formatDate(latest)} at the latest.`;
  }
  return null;
}

const LAGOS_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const LAGOS_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "2026-10-29T08:00:00Z" → "Thu 29 Oct 2026" (the Lagos date). Not a date-time → unchanged. */
export function formatLagosDay(isoDateTime: string): string {
  const time = Date.parse(isoDateTime);
  if (Number.isNaN(time)) return isoDateTime;
  // Built from the parts: the punctuation between them differs between ICU versions.
  const parts = LAGOS_DAY.formatToParts(time);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}`;
}

/** "2026-10-29T08:00:00Z" → "09:00" (24-hour, Lagos). Not a date-time → unchanged. */
export function formatLagosTime(isoDateTime: string): string {
  const time = Date.parse(isoDateTime);
  return Number.isNaN(time) ? isoDateTime : LAGOS_TIME.format(time);
}

/**
 * "09:00–10:00 Lagos time". A slot that runs past midnight names the end day too:
 * "22:00 – Fri 30 Oct 2026, 02:00 Lagos time".
 */
export function slotTimeRangeLabel(slot: Pick<DonationSlot, "startsAt" | "endsAt">): string {
  const sameDay = lagosToday(Date.parse(slot.startsAt)) === lagosToday(Date.parse(slot.endsAt));
  const start = formatLagosTime(slot.startsAt);
  const end = formatLagosTime(slot.endsAt);
  return sameDay ? `${start}–${end} Lagos time` : `${start} – ${formatLagosDay(slot.endsAt)}, ${end} Lagos time`;
}

/** "Thu 29 Oct 2026, 09:00–10:00 Lagos time": a slot's whole time, for dialogs and messages. */
export function slotWhenLabel(slot: Pick<DonationSlot, "startsAt" | "endsAt">): string {
  return `${formatLagosDay(slot.startsAt)}, ${slotTimeRangeLabel(slot)}`;
}

/** Started (or past): the contract stops bookings from the start time (409 SLOT_CLOSED). */
export function hasSlotStarted(slot: Pick<DonationSlot, "startsAt">, now: number): boolean {
  return Date.parse(slot.startsAt) <= now;
}

/** Book: donors only, before the slot starts, while it has a place left. */
export function canBook(slot: DonationSlot, viewer: Viewer, now: number): boolean {
  return viewer.role === "DONOR" && !hasSlotStarted(slot, now) && slot.placesLeft > 0;
}

/** Why a donor can't book a slot, in words, or null when they can (or aren't a donor). */
export function bookingClosedReason(slot: DonationSlot, now: number): string | null {
  if (hasSlotStarted(slot, now)) return "Booking closed: this slot has started.";
  if (slot.placesLeft <= 0) return "Full: no places left.";
  return null;
}

/** Open a new slot: bank staff only (the bank comes from their token). */
export function canCreateSlot(viewer: Viewer): boolean {
  return viewer.role === "BANK_STAFF";
}

/** How a refused booking reads: an error, or "info" when nothing went wrong for the donor. */
export type BookingRefusal = { tone: "error" | "info"; message: string };

/**
 * Our words for each 409 from POST /donation-slots/{id}/bookings, or null for any other error
 * (the service's own message is shown then). After each of these the list is loaded again.
 */
export function bookingRefusal(code: ClientErrorCode): BookingRefusal | null {
  switch (code) {
    case "SLOT_FULL":
      return { tone: "error", message: "This slot just filled up. The list now shows the latest places; please choose another time." };
    case "SLOT_CLOSED":
      return { tone: "error", message: "This slot has started, so it can't be booked any more. Please choose a later time." };
    case "ALREADY_BOOKED":
      // A double tap or a second tab: the donor has their place, so this is news, not a failure.
      return { tone: "info", message: "You already have a place in this slot, so we didn't book a second one. Your booking stands." };
    default:
      return null;
  }
}

/** Ended: the slot's end time has passed. Until then a booking counts as upcoming. */
export function hasSlotEnded(slot: Pick<DonationSlot, "endsAt">, now: number): boolean {
  return Date.parse(slot.endsAt) <= now;
}

/**
 * A donor's bookings split by their slot: upcoming (not ended yet, soonest first, including one
 * running now) and past (ended, most recent first). Cancelled bookings stay where their slot falls.
 */
export function splitBookings(bookings: readonly Booking[], now: number): { upcoming: Booking[]; past: Booking[] } {
  const byStart = (a: Booking, b: Booking) => Date.parse(a.slot.startsAt) - Date.parse(b.slot.startsAt);
  return {
    upcoming: bookings.filter((b) => !hasSlotEnded(b.slot, now)).sort(byStart),
    past: bookings.filter((b) => hasSlotEnded(b.slot, now)).sort((a, b) => byStart(b, a)),
  };
}

/**
 * Cancel a booking: donors only, while it is BOOKED and the slot hasn't started (contract
 * cancelBooking). The service also checks it is the donor's own (others get 404); a donor's
 * GET /bookings holds only their own, so the role is enough to decide on the button.
 */
export function canCancelBooking(booking: Booking, viewer: Viewer, now: number): boolean {
  return viewer.role === "DONOR" && booking.status === "BOOKED" && !hasSlotStarted(booking.slot, now);
}

/** Our words for each 409 from POST /bookings/{id}/cancellation, or null for any other error. */
export function cancelBookingRefusal(code: ClientErrorCode): string | null {
  switch (code) {
    case "BOOKING_NOT_ACTIVE":
      return "This booking was already cancelled or recorded, so there was nothing to cancel. The list now shows where it stands.";
    case "SLOT_CLOSED":
      return "This slot has started, so the booking can't be cancelled any more.";
    default:
      return null;
  }
}

/**
 * After a lost connection we can't tell whether the cancellation happened, so we read the
 * bookings again and say what this one shows. `status` is undefined when it is no longer listed,
 * null when that read failed too.
 */
export function unconfirmedCancelMessage(status: BookingStatus | null | undefined, where: string): string {
  if (status === null) {
    return "We couldn't confirm whether your booking was cancelled, or check your bookings. Check again before trying once more.";
  }
  if (status === undefined) return `We couldn't confirm. Your booking for ${where} is no longer in your list.`;
  return `We couldn't confirm. Your booking for ${where} now shows as ${BOOKING_STATUS_LABELS[status]}.`;
}
