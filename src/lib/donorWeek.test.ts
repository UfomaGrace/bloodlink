// donorWeek: Lagos days, counts per day, disabled days, the default day, labels, next booking, donations,
// the hero heading and the donations line.
import { describe, expect, it } from "vitest";
import type { Booking, DonationSlot, Organisation } from "../api/types";
import {
  buildWeek,
  dayHeading,
  defaultDay,
  DEFAULT_HERO_HEADING,
  donationsLine,
  donationsSummary,
  donorPlacesLabel,
  heroHeading,
  longDayLabel,
  nextBooking,
  relativeDayLabel,
  shortDayLabel,
  slotClockRange,
  slotCountLabel,
} from "./donorWeek";

const BANK: Organisation = { id: "b1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" };

// Sat 31 Oct 2026, 12:00 Lagos (11:00 UTC).
const NOW = Date.parse("2026-10-31T11:00:00Z");

function slot(id: string, startsAt: string, endsAt: string, capacity: number, booked: number): DonationSlot {
  return { id, bank: BANK, startsAt, endsAt, capacity, booked, placesLeft: capacity - booked };
}

function booking(id: string, s: DonationSlot, status: Booking["status"]): Booking {
  return { id, slot: s, donor: { id: "d1", displayName: "Ngozi" }, status, createdAt: "2026-10-01T00:00:00Z" };
}

describe("buildWeek", () => {
  const started = slot("started", "2026-10-31T08:00:00Z", "2026-10-31T12:00:00Z", 8, 2); // today, running
  const late = slot("late", "2026-10-31T22:30:00Z", "2026-10-31T23:30:00Z", 4, 0); // 23:30 Lagos, still Saturday
  const sunOpen = slot("sun-open", "2026-11-01T09:00:00Z", "2026-11-01T11:00:00Z", 10, 7);
  const sunFull = slot("sun-full", "2026-11-01T13:00:00Z", "2026-11-01T15:00:00Z", 4, 4);
  const monFull = slot("mon-full", "2026-11-02T09:00:00Z", "2026-11-02T11:00:00Z", 4, 4);
  // 23:30 UTC on Fri 6 Nov is 00:30 on Sat 7 Nov in Lagos: the eighth day, outside the week.
  const outside = slot("outside", "2026-11-06T23:30:00Z", "2026-11-07T01:00:00Z", 4, 0);

  it("seven Lagos days from today, each with its bookable count", () => {
    const week = buildWeek([sunOpen, sunFull, started, late, monFull, outside], new Set(), NOW);
    expect(week.map((d) => d.date)).toEqual([
      "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06",
    ]);
    expect(week.map((d) => d.bookable)).toEqual([1, 1, 0, 0, 0, 0, 0]);
    expect(week[0].slots.map((s) => s.id)).toEqual(["started", "late"]);
    expect(week[1].slots.map((s) => s.id)).toEqual(["sun-open", "sun-full"]);
    expect(week.flatMap((d) => d.slots).some((s) => s.id === "outside")).toBe(false);
  });

  it("disables a day with nothing to book, unless the donor has a booking there", () => {
    expect(buildWeek([monFull], new Set(), NOW)[2].disabled).toBe(true);
    const withBooking = buildWeek([monFull], new Set(["mon-full"]), NOW)[2];
    expect(withBooking).toMatchObject({ disabled: false, bookable: 0, hasBooking: true });
  });

  it("a slot the donor booked still counts while it has places left", () => {
    expect(buildWeek([sunOpen], new Set(["sun-open"]), NOW)[1].bookable).toBe(1);
  });

  it("defaults to the first day that can be picked, or null", () => {
    expect(defaultDay(buildWeek([monFull, sunOpen], new Set(), NOW))).toBe("2026-11-01");
    expect(defaultDay(buildWeek([monFull], new Set(), NOW))).toBeNull();
  });
});

describe("labels", () => {
  it("counts", () => {
    expect([0, 1, 3].map(slotCountLabel)).toEqual(["No slots", "1 slot", "3 slots"]);
  });

  it("days", () => {
    expect(shortDayLabel("2026-10-31")).toBe("Sat 31 Oct");
    expect(longDayLabel("2026-10-31")).toBe("Saturday 31 October");
  });

  it("Today and Tomorrow in Lagos", () => {
    expect(relativeDayLabel("2026-10-31", NOW)).toBe("Today");
    expect(relativeDayLabel("2026-11-01", NOW)).toBe("Tomorrow");
    expect(relativeDayLabel("2026-11-02", NOW)).toBeNull();
    // 23:30 UTC is already the next day in Lagos.
    expect(relativeDayLabel("2026-11-01", Date.parse("2026-10-31T23:30:00Z"))).toBe("Today");
  });

  it("times in Lagos, and a slot past midnight", () => {
    expect(slotClockRange({ startsAt: "2026-10-31T09:00:00Z", endsAt: "2026-10-31T11:00:00Z" })).toEqual({
      label: "10:00–12:00",
      endsNextDay: false,
    });
    expect(slotClockRange({ startsAt: "2026-10-31T21:00:00Z", endsAt: "2026-11-01T01:00:00Z" })).toEqual({
      label: "22:00–02:00",
      endsNextDay: true,
    });
  });

  it("places: the last one is a warning", () => {
    expect(donorPlacesLabel({ placesLeft: 1, capacity: 6 })).toEqual({ text: "Only 1 place left", lastPlace: true });
    expect(donorPlacesLabel({ placesLeft: 6, capacity: 8 })).toEqual({ text: "6 of 8 places left", lastPlace: false });
  });
});

describe("nextBooking and donationsSummary", () => {
  const ended = slot("ended", "2026-10-30T09:00:00Z", "2026-10-30T11:00:00Z", 4, 1);
  const running = slot("running", "2026-10-31T10:00:00Z", "2026-10-31T12:00:00Z", 4, 1);
  const later = slot("later", "2026-11-03T09:00:00Z", "2026-11-03T11:00:00Z", 4, 1);

  it("the soonest BOOKED booking that hasn't ended", () => {
    const bookings = [booking("1", later, "BOOKED"), booking("2", ended, "BOOKED"), booking("3", running, "CANCELLED")];
    expect(nextBooking(bookings, NOW)?.id).toBe("1");
    expect(nextBooking([...bookings, booking("4", running, "BOOKED")], NOW)?.id).toBe("4");
    expect(nextBooking([booking("2", ended, "BOOKED")], NOW)).toBeNull();
  });

  it("counts ATTENDED bookings and finds the latest", () => {
    const oct4 = slot("a", "2026-10-04T09:00:00Z", "2026-10-04T11:00:00Z", 4, 4);
    const jun1 = slot("b", "2026-06-01T09:00:00Z", "2026-06-01T11:00:00Z", 4, 4);
    const summary = donationsSummary([booking("1", jun1, "ATTENDED"), booking("2", oct4, "ATTENDED")]);
    expect(summary).toEqual({ count: 2, lastDate: "2026-10-04" });
    expect(donationsSummary([])).toBeNull();
  });
});

describe("hero words", () => {
  const HOUR = 3_600_000;
  const at = (startsAt: string) =>
    booking("b", slot("s", startsAt, new Date(Date.parse(startsAt) + 2 * HOUR).toISOString(), 4, 1), "BOOKED");

  it("heading: today, tomorrow, a later day, or the default with no booking", () => {
    expect(heroHeading(at("2026-10-31T15:00:00Z"), NOW)).toBe("You're donating today.");
    expect(heroHeading(at("2026-11-01T09:00:00Z"), NOW)).toBe("You're donating tomorrow.");
    expect(heroHeading(at("2026-11-01T09:00:00Z"), Date.parse("2026-10-30T11:00:00Z"))).toBe(
      "You're donating on Sunday 1 November.",
    );
    expect(heroHeading(null, NOW)).toBe(DEFAULT_HERO_HEADING);
    expect(DEFAULT_HERO_HEADING).toBe("Give blood this week.");
  });

  it("heading goes by the Lagos day, not the UTC one", () => {
    // Now: 22:30 Saturday in Lagos. 23:30 UTC Saturday is 00:30 Sunday in Lagos.
    expect(heroHeading(at("2026-10-31T23:30:00Z"), Date.parse("2026-10-31T21:30:00Z"))).toBe("You're donating tomorrow.");
  });

  it("donations line: counts ATTENDED; null with none, or no list", () => {
    const done = (id: string) => booking(id, slot(`s${id}`, "2026-10-04T09:00:00Z", "2026-10-04T11:00:00Z", 4, 4), "ATTENDED");
    expect(donationsLine([done("1")])).toBe("1 donation so far · thank you");
    expect(donationsLine([done("1"), done("2"), done("3")])).toBe("3 donations so far · thank you");
    expect(donationsLine([])).toBeNull();
    expect(donationsLine(null)).toBeNull();
  });

  it("day heading", () => {
    expect(dayHeading("2026-10-31", 3)).toBe("Saturday 31 October · 3 slots · Lagos time");
    expect(dayHeading("2026-10-31", 1)).toBe("Saturday 31 October · 1 slot · Lagos time");
  });
});
