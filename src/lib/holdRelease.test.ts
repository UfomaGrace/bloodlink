import { describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { Availability, BloodRequest, BloodRequestPage, Reservation } from "../api/types";
import {
  approvalHoldLine,
  CANDIDATE_PAGE_LIMIT,
  CANDIDATE_PAGE_SIZE,
  EMERGENCY_HOLD_LINE,
  HOLD_LENGTH_LABELS,
  freeUnitsFor,
  freeUnitsMeet,
  holdReleaseError,
  loadHoldReleaseScan,
  releasableHolds,
  releaseConsequence,
  runningHolds,
  truncatedLabel,
} from "./holdRelease";

const OUR_BANK = { id: "bank-ours", name: "Lagos Central", type: "BLOOD_BANK", area: "Ikeja" } as const;
const OTHER_BANK = { id: "bank-other", name: "Surulere Centre", type: "BLOOD_BANK", area: "Surulere" } as const;
const HOSPITAL = { id: "hospital-1", name: "Yaba General", type: "HOSPITAL", area: "Yaba" } as const;

const at = (iso: string) => Date.parse(iso);
const NOW = at("2026-10-28T10:00:00Z");

function hold(ref: string, holdExpiresAt = "2026-10-28T13:30:00Z", status: Reservation["status"] = "ACTIVE"): Reservation {
  return { id: `r-${ref}`, unit: { id: `u-${ref}`, reference: ref, expiryDate: "2026-11-30" }, status, holdExpiresAt, createdAt: "2026-10-28T09:00:00Z" };
}

function request(changes: Partial<BloodRequest>): BloodRequest {
  return {
    id: "req-x",
    reference: "REQ-X",
    hospital: HOSPITAL,
    bank: OUR_BANK,
    bloodGroup: "O",
    rhesus: "NEGATIVE",
    component: "RED_CELLS",
    quantity: 1,
    urgency: "ROUTINE",
    neededBy: "2026-10-29T10:00:00Z",
    state: "APPROVED",
    declineReason: null,
    createdAt: "2026-10-28T08:00:00Z",
    reservations: [hold("LCB-1")],
    history: [],
    ...changes,
  };
}

const emergency = request({ id: "emergency", reference: "REQ-E", urgency: "EMERGENCY", state: "PENDING", quantity: 2, reservations: [] });

function ok<T>(data: T): ApiResponse<T> {
  return { data, status: 200, requestId: "ref", headers: new Headers() };
}

describe("releasableHolds", () => {
  it("keeps only APPROVED ROUTINE requests at the emergency's bank with the same group, rhesus and component", () => {
    const keep = request({ id: "keep", reference: "REQ-KEEP" });
    const others = [
      request({ id: "urgent", urgency: "URGENT" }),
      request({ id: "emergency-2", urgency: "EMERGENCY" }),
      request({ id: "pending", state: "PENDING" }),
      // The administrator's list has every bank: the bank decides, not the role.
      request({ id: "other-bank", bank: OTHER_BANK }),
      request({ id: "group", bloodGroup: "A" }),
      request({ id: "rhesus", rhesus: "POSITIVE" }),
      request({ id: "component", component: "PLASMA" }),
      { ...emergency, state: "APPROVED" as const, urgency: "ROUTINE" as const }, // the emergency itself
    ];
    expect(releasableHolds(emergency, [keep, ...others], NOW).map((c) => c.request.id)).toEqual(["keep"]);
  });

  it("needs a hold still running: not one past holdExpiresAt, nor one no longer ACTIVE", () => {
    const passed = request({ id: "passed", reservations: [hold("LCB-1", "2026-10-28T09:59:00Z")] });
    const issued = request({ id: "issued", reservations: [hold("LCB-1", "2026-10-28T13:00:00Z", "ISSUED")] });
    const mixed = request({ id: "mixed", reservations: [hold("LCB-1", "2026-10-28T09:00:00Z"), hold("LCB-2")] });
    const result = releasableHolds(emergency, [passed, issued, mixed], NOW);
    expect(result.map((c) => c.request.id)).toEqual(["mixed"]);
    expect(result[0].heldUnits.map((r) => r.unit.reference)).toEqual(["LCB-2"]);
  });

  it("orders candidates by needed-by time, latest first", () => {
    const soon = request({ id: "soon", neededBy: "2026-10-28T18:00:00Z" });
    const late = request({ id: "late", neededBy: "2026-11-02T10:00:00Z" });
    const mid = request({ id: "mid", neededBy: "2026-10-30T10:00:00Z" });
    expect(releasableHolds(emergency, [soon, late, mid], NOW).map((c) => c.request.id)).toEqual(["late", "mid", "soon"]);
  });
});

describe("runningHolds", () => {
  it("is the ACTIVE holds whose holdExpiresAt is after now", () => {
    const r = request({ reservations: [hold("A"), hold("B", "2026-10-28T10:00:00Z"), hold("C", undefined, "RELEASED")] });
    expect(runningHolds(r, NOW).map((x) => x.unit.reference)).toEqual(["A"]);
  });
});

describe("freeUnitsFor / freeUnitsMeet", () => {
  const availability = (items: Availability["items"]): Availability => ({
    computedAt: "2026-10-28T10:00:00Z",
    matching: "Exact group, rhesus type and component only. No substitution.",
    items,
  });
  const row = (changes: Partial<Availability["items"][number]>) => ({
    bank: OUR_BANK,
    bloodGroup: "O" as const,
    rhesus: "NEGATIVE" as const,
    component: "RED_CELLS" as const,
    availableUnits: 1,
    earliestExpiryDate: "2026-11-30",
    ...changes,
  });

  it("counts only the emergency's bank and type", () => {
    const free = freeUnitsFor(emergency, availability([row({ availableUnits: 1 }), row({ bank: OTHER_BANK, availableUnits: 9 }), row({ component: "PLASMA", availableUnits: 9 })]));
    expect(free).toBe(1);
  });

  it("says free units meet the emergency only when there are at least as many as it needs", () => {
    expect(freeUnitsMeet(emergency, 1)).toBe(false);
    expect(freeUnitsMeet(emergency, 2)).toBe(true);
    expect(freeUnitsFor(emergency, availability([]))).toBe(0);
  });
});

describe("loadHoldReleaseScan", () => {
  const page = (count: number, totalItems: number, from = 0): BloodRequestPage => ({
    items: Array.from({ length: count }, (_, i) => request({ id: `req-${from + i}` })),
    page: 0,
    size: CANDIDATE_PAGE_SIZE,
    totalItems,
  });
  const availability = ok<Availability>({
    computedAt: "2026-10-28T10:02:00Z",
    matching: "Exact group, rhesus type and component only. No substitution.",
    items: [],
  });

  it("reads APPROVED requests and availability for the emergency's bank and type", async () => {
    const listRequests = vi.fn().mockResolvedValue(ok(page(2, 2)));
    const searchAvailability = vi.fn().mockResolvedValue(availability);
    const scan = await loadHoldReleaseScan(emergency, { listRequests, searchAvailability });
    expect(listRequests).toHaveBeenCalledWith({ state: "APPROVED", page: 0, size: CANDIDATE_PAGE_SIZE }, undefined);
    expect(searchAvailability).toHaveBeenCalledWith(
      { bankId: OUR_BANK.id, bloodGroup: "O", rhesus: "NEGATIVE", component: "RED_CELLS" },
      undefined,
    );
    expect(scan).toEqual({ approved: page(2, 2).items, freeUnits: 0, computedAt: "2026-10-28T10:02:00Z", truncatedAt: null });
  });

  it("reads further pages until it has them all", async () => {
    const listRequests = vi
      .fn()
      .mockResolvedValueOnce(ok(page(CANDIDATE_PAGE_SIZE, CANDIDATE_PAGE_SIZE + 3)))
      .mockResolvedValueOnce(ok(page(3, CANDIDATE_PAGE_SIZE + 3, CANDIDATE_PAGE_SIZE)));
    const scan = await loadHoldReleaseScan(emergency, { listRequests, searchAvailability: vi.fn().mockResolvedValue(availability) });
    expect(listRequests).toHaveBeenCalledTimes(2);
    expect(scan.approved).toHaveLength(CANDIDATE_PAGE_SIZE + 3);
    expect(scan.truncatedAt).toBeNull();
  });

  it("stops after the page limit and says how many it read", async () => {
    const total = CANDIDATE_PAGE_SIZE * (CANDIDATE_PAGE_LIMIT + 2);
    const listRequests = vi.fn().mockImplementation(() => Promise.resolve(ok(page(CANDIDATE_PAGE_SIZE, total))));
    const scan = await loadHoldReleaseScan(emergency, { listRequests, searchAvailability: vi.fn().mockResolvedValue(availability) });
    expect(listRequests).toHaveBeenCalledTimes(CANDIDATE_PAGE_LIMIT);
    expect(scan.truncatedAt).toBe(CANDIDATE_PAGE_SIZE * CANDIDATE_PAGE_LIMIT);
    expect(truncatedLabel(500)).toBe("Showing the first 500 approved requests; there may be more.");
  });
});

describe("wording (ADR-002)", () => {
  it("states the consequence with the service's hold end", () => {
    const candidate = { request: request({ reference: "REQ-R" }), heldUnits: [hold("LCB-1", "2026-10-28T13:30:00Z")] };
    const text = releaseConsequence(candidate, new Date("2026-10-28T13:30:00Z"));
    expect(text).toMatch(/^REQ-R \(routine, held until \d{2}:\d{2}\) goes back to pending\. Its courier may already be on the way\. Only release it if the emergency can't wait\.$/);
  });

  it("labels the emergency hold length as set by the service", () => {
    expect(EMERGENCY_HOLD_LINE).toBe("Emergency holds last 1 hour (set by the service), so collect promptly.");
  });

  it("has the contract's hold lengths: emergency 1 hour, urgent 2 hours, routine 4 hours", () => {
    expect(HOLD_LENGTH_LABELS).toEqual({ EMERGENCY: "1 hour", URGENT: "2 hours", ROUTINE: "4 hours" });
  });

  it("tells the approver how long this urgency's hold lasts", () => {
    expect(approvalHoldLine("EMERGENCY")).toBe(
      "They will be held for 1 hour (emergency hold, set by the service). If they aren't issued by then, the hold lapses.",
    );
    expect(approvalHoldLine("URGENT")).toMatch(/^They will be held for 2 hours \(urgent hold/);
    expect(approvalHoldLine("ROUTINE")).toMatch(/^They will be held for 4 hours \(routine hold/);
  });
});

describe("holdReleaseError", () => {
  const conflict = (code: ApiError["code"]) =>
    new ApiError({ status: 409, code, message: "Service says no.", requestId: "ref-409" });

  it("gives each 409 code its own message and keeps the reference", () => {
    const messages = (["HOLD_NOT_RELEASABLE", "REQUEST_NOT_PENDING", "UNITS_NO_LONGER_AVAILABLE"] as const).map((code) => {
      const mapped = holdReleaseError(conflict(code));
      expect(mapped.code).toBe(code);
      expect(mapped.requestId).toBe("ref-409");
      return mapped.message;
    });
    expect(new Set(messages).size).toBe(3);
    expect(messages).not.toContain("Service says no.");
  });

  it("leaves other errors as the service sent them", () => {
    const forbidden = new ApiError({ status: 403, code: "FORBIDDEN", message: "Not yours.", requestId: "r" });
    expect(holdReleaseError(forbidden)).toBe(forbidden);
  });
});
