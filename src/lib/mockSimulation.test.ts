import { describe, expect, it } from "vitest";
import type { BloodRequest, Booking, Reservation } from "../api/types";
import { withPassedHolds } from "./holds";
import { freeUnitsMeet, releasableHolds } from "./holdRelease";
import { canIssue, canReleaseHold, expiredHeldUnits, type Viewer } from "./requestActions";
import { canCancelBooking, canRecordAttendance, hasSlotEnded, hasSlotStarted, splitBookings } from "./donations";
import { buildWeek, donationsBand, donationsSummary, nextBooking, relativeDayLabel, slotClockRange, slotLagosDay } from "./donorWeek";
import {
  lagosMonthsAgo,
  SIMULATED_HOLD_MS,
  simulateBookings,
  simulateDonorWeek,
  simulateHoldReleaseScan,
  simulateRequest,
  simulateRequestDetail,
  simulateSlotDetail,
  simulateSlots,
} from "./mockSimulation";

const at = (iso: string) => Date.parse(iso);
const PICKED = at("2026-10-28T10:00:00Z");
const bank: Viewer = { role: "BANK_STAFF", organisationId: "bank-1" };

// Like Prism's canned answer: APPROVED, with a hold that ended on 26 Oct.
const canned = {
  id: "req-1",
  state: "APPROVED",
  declineReason: null,
  bank: { id: "bank-1" },
  hospital: { id: "hospital-1" },
  reservations: [
    {
      id: "res-1",
      unit: { id: "unit-1", reference: "LCB-2026-00042", expiryDate: "2026-11-30" },
      status: "ACTIVE",
      holdExpiresAt: "2026-10-26T11:06:00Z",
      createdAt: "2026-10-26T10:06:00Z",
    } satisfies Reservation,
  ],
  history: [{ at: "2026-10-26T10:05:00Z", event: "CREATED", actor: "Tunde Bello", note: null }],
} as unknown as BloodRequest;

describe("simulateRequest", () => {
  it("leaves the canned request reading as lapsed today, which is why we simulate", () => {
    expect(withPassedHolds(canned, PICKED).state).toBe("LAPSED");
  });

  it("Pending: no reservations, history untouched", () => {
    const result = simulateRequest(canned, "PENDING", PICKED);
    expect(result.state).toBe("PENDING");
    expect(result.reservations).toEqual([]);
    expect(result.history).toBe(canned.history);
  });

  it("Approved, hold running: a hold ending 30 minutes after it was picked, so it can be issued", () => {
    const result = simulateRequest(canned, "APPROVED_HOLD_RUNNING", PICKED);
    expect(result.state).toBe("APPROVED");
    expect(Date.parse(result.reservations[0].holdExpiresAt)).toBe(PICKED + SIMULATED_HOLD_MS);
    expect(withPassedHolds(result, PICKED + 60_000).state).toBe("APPROVED");
    expect(canIssue(result, bank, PICKED + 60_000)).toBe(true);
  });

  it("Approved, hold running: lapses for real once the 30 minutes pass", () => {
    const result = simulateRequest(canned, "APPROVED_HOLD_RUNNING", PICKED);
    expect(withPassedHolds(result, PICKED + SIMULATED_HOLD_MS).state).toBe("LAPSED");
  });

  it("Approved, unit expired: the hold runs but the unit is past its expiry date in Lagos", () => {
    const result = simulateRequest(canned, "APPROVED_UNIT_EXPIRED", PICKED);
    expect(result.reservations[0].unit.expiryDate).toBe("2026-10-27");
    expect(canIssue(result, bank, PICKED)).toBe(false);
    expect(expiredHeldUnits(result, PICKED)).toEqual(["LCB-2026-00042"]);
  });

  it("Fulfilled: every reservation issued", () => {
    const result = simulateRequest(canned, "FULFILLED", PICKED);
    expect(result.state).toBe("FULFILLED");
    expect(result.reservations.map((r) => r.status)).toEqual(["ISSUED"]);
  });

  it("never changes the request it was given", () => {
    const before = JSON.stringify(canned);
    simulateRequest(canned, "FULFILLED", PICKED);
    simulateRequest(canned, "APPROVED_UNIT_EXPIRED", PICKED);
    expect(JSON.stringify(canned)).toBe(before);
  });
});

describe("simulateSlots", () => {
  it("Slots with places left: every slot is in the future and has room", () => {
    const { items, computedAt } = simulateSlots("PLACES_LEFT", PICKED);
    expect(computedAt).toBe(new Date(PICKED).toISOString());
    expect(items.length).toBeGreaterThan(0);
    for (const s of items) {
      expect(Date.parse(s.startsAt)).toBeGreaterThan(PICKED);
      expect(s.placesLeft).toBe(s.capacity - s.booked);
      expect(s.placesLeft).toBeGreaterThan(0);
    }
  });

  it("A full slot: the first slot has no places left", () => {
    const [full] = simulateSlots("FULL", PICKED).items;
    expect(full.placesLeft).toBe(0);
    expect(full.booked).toBe(full.capacity);
    expect(Date.parse(full.startsAt)).toBeGreaterThan(PICKED);
  });

  it("A closed slot: the first slot started before the moment it was picked, with places left", () => {
    const [closed] = simulateSlots("CLOSED", PICKED).items;
    expect(Date.parse(closed.startsAt)).toBeLessThan(PICKED);
    expect(Date.parse(closed.endsAt)).toBeGreaterThan(PICKED);
    expect(closed.placesLeft).toBeGreaterThan(0);
  });

  it("Empty (first use): no slots", () => {
    expect(simulateSlots("EMPTY", PICKED).items).toEqual([]);
  });

  it("puts sample times on the Lagos clock (+01:00, no daylight saving)", () => {
    const [first] = simulateSlots("PLACES_LEFT", PICKED).items;
    expect(first.startsAt).toBe("2026-10-29T08:00:00.000Z"); // 09:00 Lagos, the day after PICKED
  });
});

describe("simulateBookings", () => {
  it("gives cancellable upcoming bookings, one in a started slot, and past ones, from the moment picked", () => {
    const bookings = simulateBookings("SAMPLE", PICKED, "Ngozi Adeyemi (demo)");
    const donor = { role: "DONOR", organisationId: null } as const;
    expect(bookings.filter((b) => canCancelBooking(b, donor, PICKED))).toHaveLength(2);
    expect(bookings.some((b) => b.status === "BOOKED" && hasSlotStarted(b.slot, PICKED) && !hasSlotEnded(b.slot, PICKED))).toBe(true);
    const { past } = splitBookings(bookings, PICKED);
    expect(past.map((b) => b.status)).toEqual(["NO_SHOW", "ATTENDED", "ATTENDED", "ATTENDED"]);
    expect(bookings.every((b) => b.donor.displayName === "Ngozi Adeyemi (demo)")).toBe(true);
  });

  it("uses well-formed ids, since a cancellation sends them to the mock", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const b of simulateBookings("SAMPLE", PICKED, "Ngozi")) {
      expect(b.id).toMatch(uuid);
      expect(b.slot.id).toMatch(uuid);
    }
  });

  it("Empty (first use): no bookings", () => {
    expect(simulateBookings("EMPTY", PICKED, "Ngozi")).toEqual([]);
  });
});

describe("the donor's sample donations", () => {
  const attendedDays = (bookings: readonly Booking[]) =>
    bookings.filter((b) => b.status === "ATTENDED").map((b) => slotLagosDay(b.slot));

  it("3 donations on both screens, 4, 8 and 12 months back (Lagos dates), all in the past", () => {
    const fromBookings = simulateBookings("SAMPLE", PICKED, "Ngozi");
    const fromWeek = simulateDonorWeek("WEEK", PICKED, "Ngozi").attended;
    expect(attendedDays(fromBookings)).toEqual(["2026-06-28", "2026-02-28", "2025-10-28"]);
    expect(attendedDays(fromWeek)).toEqual(attendedDays(fromBookings));
    expect(donationsSummary(fromWeek)?.count).toBe(3);
    expect(donationsBand(fromBookings, PICKED)).toEqual({ count: 3, lastLabel: "28 June" });
    for (const b of [...fromBookings, ...fromWeek].filter((b) => b.status === "ATTENDED")) {
      expect(hasSlotEnded(b.slot, PICKED)).toBe(true);
      expect(slotClockRange(b.slot).label).toBe("10:00–12:00");
      expect(Date.parse(b.createdAt)).toBeLessThan(Date.parse(b.slot.startsAt));
    }
  });

  it("counts calendar months in Lagos, falling back to the month's last day", () => {
    // 31 Oct 2026, 23:30 Lagos is still 31 Oct there (22:30 UTC).
    const lateOct31 = at("2026-10-31T22:30:00Z");
    expect([4, 8, 12].map((m) => lagosMonthsAgo(lateOct31, m))).toEqual(["2026-06-30", "2026-02-28", "2025-10-31"]);
    expect(lagosMonthsAgo(at("2026-01-15T10:00:00Z"), 4)).toBe("2025-09-15");
  });
});

describe("simulateDonorWeek", () => {
  it("a week from today with something for every part of the donor screen", () => {
    const { slots, booked, attended } = simulateDonorWeek("WEEK", PICKED, "Ngozi");
    const bookedIds = new Set(booked.map((b) => b.slot.id));
    const week = buildWeek(slots.items, bookedIds, PICKED);
    // Every slot falls inside the seven days.
    expect(week.flatMap((d) => d.slots)).toHaveLength(slots.items.length);
    // Today has only a started slot; tomorrow has three; one day has none.
    expect(week.map((d) => d.bookable)).toEqual([0, 2, 1, 0, 2, 1, 1]);
    expect(week[0].disabled).toBe(true);
    const tomorrow = week[1].slots;
    expect(tomorrow.some((s) => s.placesLeft === 1)).toBe(true);
    expect(tomorrow.some((s) => s.placesLeft === 0)).toBe(true);
    // The booked slot is in the list, so the marker shows; and it is the next donation, tomorrow.
    expect(tomorrow.some((s) => bookedIds.has(s.id))).toBe(true);
    const next = nextBooking(booked, PICKED);
    expect(next && relativeDayLabel(slotLagosDay(next.slot), PICKED)).toBe("Tomorrow");
    expect(donationsSummary(attended)?.count).toBe(3);
  });

  it("uses well-formed ids, since a booking sends the slot id to the mock", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const { slots, booked, attended } = simulateDonorWeek("WEEK", PICKED, "Ngozi");
    for (const id of [...slots.items.map((s) => s.id), ...[...booked, ...attended].flatMap((b) => [b.id, b.slot.id])]) {
      expect(id).toMatch(uuid);
    }
  });

  it("without bookings, and empty", () => {
    expect(simulateDonorWeek("WEEK_NO_BOOKINGS", PICKED, "Ngozi")).toMatchObject({ booked: [], attended: [] });
    expect(simulateDonorWeek("EMPTY", PICKED, "Ngozi").slots.items).toEqual([]);
  });
});

describe("simulateSlotDetail", () => {
  const bank = { id: "bank-1", name: "Lagos Central", type: "BLOOD_BANK", area: "Ikeja" } as const;
  const staff = { role: "BANK_STAFF", organisationId: "bank-1" } as const;

  it("A started slot with bookings: the URL's slot, run by the viewer's bank, three to record", () => {
    const { slot, bookings } = simulateSlotDetail("STARTED_WITH_BOOKINGS", PICKED, "slot-from-url", bank);
    expect(slot.id).toBe("slot-from-url");
    expect(hasSlotStarted(slot, PICKED) && !hasSlotEnded(slot, PICKED)).toBe(true);
    expect(bookings.filter((b) => canRecordAttendance(b, staff, PICKED))).toHaveLength(3);
    expect(slot.booked).toBe(4); // BOOKED and ATTENDED count; CANCELLED doesn't
    expect(slot.placesLeft).toBe(slot.capacity - slot.booked);
  });

  it("Not started: bookings, none recordable yet", () => {
    const { slot, bookings } = simulateSlotDetail("NOT_STARTED", PICKED, "s", bank);
    expect(hasSlotStarted(slot, PICKED)).toBe(false);
    expect(bookings).toHaveLength(2);
    expect(bookings.some((b) => canRecordAttendance(b, staff, PICKED))).toBe(false);
  });

  it("No bookings yet: the slot alone", () => {
    const { slot, bookings } = simulateSlotDetail("EMPTY", PICKED, "s", bank);
    expect(bookings).toEqual([]);
    expect(slot.booked).toBe(0);
  });
});

describe("hold-release simulations", () => {
  const emergencyCanned = { ...canned, bloodGroup: "O", rhesus: "NEGATIVE", component: "RED_CELLS", quantity: 1, urgency: "ROUTINE" } as BloodRequest;
  const shown = (state: "EMERGENCY_RELEASABLE_HOLD" | "EMERGENCY_NO_RELEASABLE_HOLD" | "EMERGENCY_ENOUGH_FREE") => {
    const request = simulateRequestDetail(emergencyCanned, state, PICKED);
    return { request, scan: simulateHoldReleaseScan(state, request, PICKED) };
  };
  const admin: Viewer = { role: "ADMIN", organisationId: null };

  it("shows the canned request as a pending emergency the bank may release a hold for", () => {
    const { request } = shown("EMERGENCY_RELEASABLE_HOLD");
    expect(request).toMatchObject({ state: "PENDING", urgency: "EMERGENCY", reservations: [] });
    expect(canReleaseHold(request, bank)).toBe(true);
    expect(canReleaseHold(request, admin)).toBe(true);
  });

  it("Releasable: two routine candidates, latest needed-by first, and no free units", () => {
    const { request, scan } = shown("EMERGENCY_RELEASABLE_HOLD");
    const candidates = releasableHolds(request, scan.approved, PICKED);
    expect(candidates.map((c) => c.request.reference)).toEqual(["REQ-2026-000302", "REQ-2026-000301"]);
    expect(freeUnitsMeet(request, scan.freeUnits)).toBe(false);
  });

  it("No releasable hold: approved requests, but none a routine match", () => {
    const { request, scan } = shown("EMERGENCY_NO_RELEASABLE_HOLD");
    expect(scan.approved.length).toBeGreaterThan(0);
    expect(releasableHolds(request, scan.approved, PICKED)).toEqual([]);
  });

  it("Enough free: free units already meet the emergency", () => {
    const { request, scan } = shown("EMERGENCY_ENOUGH_FREE");
    expect(freeUnitsMeet(request, scan.freeUnits)).toBe(true);
  });

  it("keeps the other options as simulateRequest", () => {
    expect(simulateRequestDetail(canned, "FULFILLED", PICKED)).toEqual(simulateRequest(canned, "FULFILLED", PICKED));
  });
});
