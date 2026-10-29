import { describe, expect, it } from "vitest";
import type { DonationSlot } from "../api/types";
import {
  addDays,
  bookingClosedReason,
  bookingRefusal,
  canBook,
  canCreateSlot,
  checkSlotRange,
  formatLagosDay,
  formatLagosTime,
  hasSlotStarted,
  placesLeftLabel,
  slotTimeRangeLabel,
  slotWhenLabel,
} from "./donations";
import type { Viewer } from "./requestActions";

const at = (iso: string) => Date.parse(iso);
const NOW = at("2026-10-29T10:00:00Z"); // 11:00 in Lagos

const donor: Viewer = { role: "DONOR", organisationId: null };
const bankStaff: Viewer = { role: "BANK_STAFF", organisationId: "bank-1" };
const admin: Viewer = { role: "ADMIN", organisationId: null };
const hospital: Viewer = { role: "HOSPITAL_STAFF", organisationId: "hospital-1" };

function slot(overrides: Partial<DonationSlot> = {}): DonationSlot {
  return {
    id: "slot-1",
    bank: { id: "bank-1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" },
    startsAt: "2026-10-30T08:00:00Z", // 09:00 Lagos, the next day
    endsAt: "2026-10-30T09:00:00Z",
    capacity: 10,
    booked: 7,
    placesLeft: 3,
    ...overrides,
  };
}

describe("placesLeftLabel", () => {
  it("says how many of how many are left, as text", () => {
    expect(placesLeftLabel({ placesLeft: 3, capacity: 10 })).toBe("3 of 10 places left");
    expect(placesLeftLabel({ placesLeft: 1, capacity: 4 })).toBe("1 of 4 places left");
    expect(placesLeftLabel({ placesLeft: 10, capacity: 10 })).toBe("10 of 10 places left");
  });

  it("uses the singular for a one-place slot", () => {
    expect(placesLeftLabel({ placesLeft: 1, capacity: 1 })).toBe("1 of 1 place left");
  });

  it("says a full slot has no places left, in words", () => {
    expect(placesLeftLabel({ placesLeft: 0, capacity: 4 })).toBe("No places left (4 of 4 booked)");
  });
});

describe("checkSlotRange (to at most 31 days after from)", () => {
  it("allows exactly 31 days", () => {
    expect(addDays("2026-11-01", 31)).toBe("2026-12-02");
    expect(checkSlotRange("2026-11-01", "2026-12-02", NOW)).toBeNull();
  });

  it("refuses 32 days, naming the latest last day", () => {
    expect(checkSlotRange("2026-11-01", "2026-12-03", NOW)).toBe(
      "Choose a range of 31 days or fewer. With this first day, the last day can be 2 Dec 2026 at the latest.",
    );
  });

  it("allows a single day, and refuses a last day before the first", () => {
    expect(checkSlotRange("2026-11-01", "2026-11-01", NOW)).toBeNull();
    expect(checkSlotRange("2026-11-02", "2026-11-01", NOW)).toBe("The last day must be on or after the first day.");
  });

  it("leaves an empty last day to the service's 14-day default", () => {
    expect(checkSlotRange("2026-11-01", "", NOW)).toBeNull();
    expect(checkSlotRange("", "", NOW)).toBeNull();
  });

  it("counts an empty first day as today in Lagos, not in UTC", () => {
    // 23:30 UTC on 30 Nov is already 1 Dec in Lagos, so 31 days later is 1 Jan.
    const lateEvening = at("2026-11-30T23:30:00Z");
    expect(checkSlotRange("", "2027-01-01", lateEvening)).toBeNull();
    expect(checkSlotRange("", "2027-01-02", lateEvening)).toMatch(/1 Jan 2027 at the latest/);
  });

  it("crosses a month and a year end", () => {
    expect(addDays("2026-12-15", 31)).toBe("2027-01-15");
    expect(addDays("2027-02-01", 31)).toBe("2027-03-04");
  });
});

describe("Lagos times", () => {
  it("shows the Lagos clock, an hour ahead of UTC, whatever the viewer's zone", () => {
    expect(formatLagosTime("2026-10-30T08:00:00Z")).toBe("09:00");
    expect(formatLagosTime("2026-10-30T09:00:00+01:00")).toBe("09:00");
  });

  it("shows the Lagos day, which can differ from the UTC day", () => {
    expect(formatLagosDay("2026-10-30T08:00:00Z")).toBe("Fri 30 Oct 2026");
    expect(formatLagosDay("2026-10-30T23:30:00Z")).toBe("Sat 31 Oct 2026");
  });

  it("labels the range as Lagos time", () => {
    expect(slotTimeRangeLabel(slot())).toBe("09:00–10:00 Lagos time");
    expect(slotWhenLabel(slot())).toBe("Fri 30 Oct 2026, 09:00–10:00 Lagos time");
  });

  it("names the end day when a slot runs past Lagos midnight", () => {
    const late = slot({ startsAt: "2026-10-30T21:00:00Z", endsAt: "2026-10-31T01:00:00Z" });
    expect(slotTimeRangeLabel(late)).toBe("22:00 – Sat 31 Oct 2026, 02:00 Lagos time");
  });

  it("leaves anything that isn't a date-time unchanged", () => {
    expect(formatLagosTime("soon")).toBe("soon");
    expect(formatLagosDay("soon")).toBe("soon");
  });
});

describe("which actions a role can take on a slot", () => {
  it("lets a donor book an open slot with places left", () => {
    expect(canBook(slot(), donor, NOW)).toBe(true);
  });

  it("never offers Book to bank staff, the administrator or hospital staff", () => {
    for (const viewer of [bankStaff, admin, hospital]) expect(canBook(slot(), viewer, NOW)).toBe(false);
  });

  it("doesn't offer Book on a full slot, and says why", () => {
    const full = slot({ booked: 10, placesLeft: 0 });
    expect(canBook(full, donor, NOW)).toBe(false);
    expect(bookingClosedReason(full, NOW)).toBe("Full: no places left.");
  });

  it("doesn't offer Book once the slot has started, even with places left", () => {
    const started = slot({ startsAt: "2026-10-29T09:30:00Z", endsAt: "2026-10-29T11:30:00Z" });
    expect(hasSlotStarted(started, NOW)).toBe(true);
    expect(canBook(started, donor, NOW)).toBe(false);
    expect(bookingClosedReason(started, NOW)).toBe("Booking closed: this slot has started.");
  });

  it("counts the start time itself as started", () => {
    expect(hasSlotStarted(slot({ startsAt: "2026-10-29T10:00:00Z" }), NOW)).toBe(true);
    expect(hasSlotStarted(slot({ startsAt: "2026-10-29T10:00:01Z" }), NOW)).toBe(false);
  });

  it("lets only bank staff open a slot", () => {
    expect(canCreateSlot(bankStaff)).toBe(true);
    for (const viewer of [donor, admin, hospital]) expect(canCreateSlot(viewer)).toBe(false);
  });
});

describe("bookingRefusal", () => {
  it("gives each 409 its own message", () => {
    expect(bookingRefusal("SLOT_FULL")).toEqual({ tone: "error", message: expect.stringMatching(/^This slot just filled up/) });
    expect(bookingRefusal("SLOT_CLOSED")).toEqual({ tone: "error", message: expect.stringMatching(/has started/) });
    expect(bookingRefusal("ALREADY_BOOKED")).toEqual({ tone: "info", message: expect.stringMatching(/already have a place/) });
  });

  it("leaves other errors to the service's own message", () => {
    expect(bookingRefusal("FORBIDDEN")).toBeNull();
    expect(bookingRefusal("TIMEOUT")).toBeNull();
  });
});
