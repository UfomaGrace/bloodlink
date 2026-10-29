import { describe, expect, it } from "vitest";
import type { BloodRequest, Reservation } from "../api/types";
import { withPassedHolds } from "./holds";
import { canIssue, expiredHeldUnits, type Viewer } from "./requestActions";
import { canCancelBooking, hasSlotEnded, hasSlotStarted, splitBookings } from "./donations";
import { SIMULATED_HOLD_MS, simulateBookings, simulateRequest, simulateSlots } from "./mockSimulation";

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
    expect(past.map((b) => b.status)).toEqual(["ATTENDED", "NO_SHOW"]);
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
