import { describe, expect, it } from "vitest";
import type { BloodRequest, Reservation } from "../api/types";
import { holdHasPassed, nextHoldEnd, withPassedHolds } from "./holds";

const at = (iso: string) => Date.parse(iso);

function reservation(id: string, status: Reservation["status"], holdExpiresAt: string): Reservation {
  return {
    id,
    unit: { id: `unit-${id}`, reference: `U-${id}`, expiryDate: "2026-12-01" },
    status,
    holdExpiresAt,
    createdAt: "2026-10-26T09:00:00Z",
  };
}

function approved(reservations: Reservation[]): BloodRequest {
  return { state: "APPROVED", reservations } as unknown as BloodRequest;
}

describe("holdHasPassed", () => {
  it("is true only for an ACTIVE hold at or past its end", () => {
    const r = reservation("1", "ACTIVE", "2026-10-26T12:00:00Z");
    expect(holdHasPassed(r, at("2026-10-26T11:59:59Z"))).toBe(false);
    expect(holdHasPassed(r, at("2026-10-26T12:00:00Z"))).toBe(true);
    expect(holdHasPassed({ ...r, status: "ISSUED" }, at("2026-10-26T13:00:00Z"))).toBe(false);
  });
});

describe("withPassedHolds", () => {
  it("returns the same object when nothing has passed", () => {
    const request = approved([reservation("1", "ACTIVE", "2026-10-26T12:00:00Z")]);
    expect(withPassedHolds(request, at("2026-10-26T11:00:00Z"))).toBe(request);
  });

  it("marks passed holds LAPSED, and the request when every hold has lapsed", () => {
    const request = approved([
      reservation("1", "ACTIVE", "2026-10-26T12:00:00Z"),
      reservation("2", "ACTIVE", "2026-10-26T12:00:00Z"),
    ]);
    const result = withPassedHolds(request, at("2026-10-26T12:00:01Z"));
    expect(result.state).toBe("LAPSED");
    expect(result.reservations.map((r) => r.status)).toEqual(["LAPSED", "LAPSED"]);
  });

  it("leaves the request APPROVED while a unit is still held or issued", () => {
    const request = approved([
      reservation("1", "ACTIVE", "2026-10-26T12:00:00Z"),
      reservation("2", "ISSUED", "2026-10-26T12:00:00Z"),
    ]);
    const result = withPassedHolds(request, at("2026-10-26T12:30:00Z"));
    expect(result.state).toBe("APPROVED");
    expect(result.reservations.map((r) => r.status)).toEqual(["LAPSED", "ISSUED"]);
  });
});

describe("nextHoldEnd", () => {
  it("picks the soonest running hold and skips passed or inactive ones", () => {
    const reservations = [
      reservation("1", "ACTIVE", "2026-10-26T11:00:00Z"),
      reservation("2", "ACTIVE", "2026-10-26T14:00:00Z"),
      reservation("3", "ACTIVE", "2026-10-26T13:00:00Z"),
      reservation("4", "ISSUED", "2026-10-26T12:30:00Z"),
    ];
    expect(nextHoldEnd(reservations, at("2026-10-26T12:00:00Z"))).toBe(at("2026-10-26T13:00:00Z"));
    expect(nextHoldEnd(reservations, at("2026-10-26T15:00:00Z"))).toBeNull();
    expect(nextHoldEnd([], 0)).toBeNull();
  });
});
