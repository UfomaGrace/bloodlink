// Donor week: the donor's view of the next seven Lagos days, their next booking and their donations.
//
// - Days are Lagos dates ("YYYY-MM-DD"), today first. A slot belongs to the Lagos day it starts on.
// - Bookable: places left and not started (the same rule as canBook, without the role).
// - A day's count is its bookable slots. A slot the donor has booked still counts while it has
//   places left. A day is disabled when it has nothing to book and no booking of the donor's.
// - Pure: `now` is passed in (milliseconds), so the rules are easy to test.

import type { Booking, DonationSlot } from "../api/types";
import { addDays, formatLagosTime, hasSlotEnded, hasSlotStarted, placesLeftLabel } from "./donations";
import { lagosToday } from "./expiry";

export const WEEK_LENGTH = 7;

export type WeekDay = {
  /** Lagos date, "2026-10-31". */
  date: string;
  /** Every slot that starts that day, in start order. */
  slots: DonationSlot[];
  /** Slots with places left that haven't started. */
  bookable: number;
  /** The donor has a BOOKED place in one of this day's slots. */
  hasBooking: boolean;
  disabled: boolean;
};

/** The Lagos date a slot starts on. */
export function slotLagosDay(slot: Pick<DonationSlot, "startsAt">): string {
  return lagosToday(Date.parse(slot.startsAt));
}

export function isBookableNow(slot: DonationSlot, now: number): boolean {
  return slot.placesLeft > 0 && !hasSlotStarted(slot, now);
}

/** Seven days from today in Lagos, with each day's slots and counts. Slots outside the week are left out. */
export function buildWeek(slots: readonly DonationSlot[], bookedSlotIds: ReadonlySet<string>, now: number): WeekDay[] {
  const today = lagosToday(now);
  return Array.from({ length: WEEK_LENGTH }, (_, i) => {
    const date = addDays(today, i);
    const daySlots = slots
      .filter((slot) => slotLagosDay(slot) === date)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    const bookable = daySlots.filter((slot) => isBookableNow(slot, now)).length;
    const hasBooking = daySlots.some((slot) => bookedSlotIds.has(slot.id));
    return { date, slots: daySlots, bookable, hasBooking, disabled: bookable === 0 && !hasBooking };
  });
}

/** The first day that can be picked, or null when none can. */
export function defaultDay(week: readonly WeekDay[]): string | null {
  return week.find((day) => !day.disabled)?.date ?? null;
}

/** "3 slots", "1 slot", "No slots". */
export function slotCountLabel(count: number): string {
  if (count === 0) return "No slots";
  return count === 1 ? "1 slot" : `${count} slots`;
}

// Date-only values are read at noon UTC, so no time zone can move them to another day.
const DAY_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "2026-10-31" → its names: Sat / Saturday, 31, Oct / October. */
export function dayNames(date: string): { weekday: string; weekdayShort: string; day: string; month: string; monthShort: string } {
  const parts = DAY_PARTS.formatToParts(new Date(`${date}T12:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = part("weekday");
  const month = part("month");
  return { weekday, weekdayShort: weekday.slice(0, 3), day: part("day"), month, monthShort: month.slice(0, 3) };
}

/** "Saturday 31 October". */
export function longDayLabel(date: string): string {
  const { weekday, day, month } = dayNames(date);
  return `${weekday} ${day} ${month}`;
}

/** "Sat 31 Oct". */
export function shortDayLabel(date: string): string {
  const { weekdayShort, day, monthShort } = dayNames(date);
  return `${weekdayShort} ${day} ${monthShort}`;
}

/** "Today" or "Tomorrow" for a Lagos date, seen at `now`; null for any other day. */
export function relativeDayLabel(date: string, now: number): "Today" | "Tomorrow" | null {
  const today = lagosToday(now);
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return null;
}

/** "10:00–12:00" in Lagos, and whether it ends on a later Lagos day than it starts. */
export function slotClockRange(slot: Pick<DonationSlot, "startsAt" | "endsAt">): { label: string; endsNextDay: boolean } {
  return {
    label: `${formatLagosTime(slot.startsAt)}–${formatLagosTime(slot.endsAt)}`,
    endsNextDay: slotLagosDay({ startsAt: slot.endsAt }) !== slotLagosDay(slot),
  };
}

/** "Only 1 place left" (a warning), otherwise placesLeftLabel. */
export function donorPlacesLabel(slot: Pick<DonationSlot, "placesLeft" | "capacity">): { text: string; lastPlace: boolean } {
  if (slot.placesLeft === 1) return { text: "Only 1 place left", lastPlace: true };
  return { text: placesLeftLabel(slot), lastPlace: false };
}

/** The soonest BOOKED booking whose slot hasn't ended, or null. */
export function nextBooking(bookings: readonly Booking[], now: number): Booking | null {
  const upcoming = bookings
    .filter((b) => b.status === "BOOKED" && !hasSlotEnded(b.slot, now))
    .sort((a, b) => Date.parse(a.slot.startsAt) - Date.parse(b.slot.startsAt));
  return upcoming[0] ?? null;
}

/** How many donations, and the Lagos date of the latest; null when there are none. */
export function donationsSummary(attended: readonly Booking[]): { count: number; lastDate: string } | null {
  const done = attended.filter((b) => b.status === "ATTENDED");
  if (done.length === 0) return null;
  const latest = done.reduce((a, b) => (Date.parse(b.slot.startsAt) > Date.parse(a.slot.startsAt) ? b : a));
  return { count: done.length, lastDate: slotLagosDay(latest.slot) };
}

/** "3 donations · last on 4 Oct". */
export function donationsPillLabel(summary: { count: number; lastDate: string }): string {
  const { day, monthShort } = dayNames(summary.lastDate);
  return `${summary.count} ${summary.count === 1 ? "donation" : "donations"} · last on ${day} ${monthShort}`;
}
