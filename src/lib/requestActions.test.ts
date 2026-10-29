import { describe, expect, it } from "vitest";
import type { BloodRequest, Organisation, RequestState, Reservation, Session } from "../api/types";
import {
  actsForBank,
  canCancel,
  canDecide,
  canIssue,
  canReleaseHold,
  canReverseIssue,
  isClosed,
  expiredHeldUnits,
  expiredUnitsMessage,
  issuedUnitReferences,
  reversalOutcomeLabel,
  reversalOutcomes,
  unconfirmedMessage,
  viewerOf,
  type Viewer,
} from "./requestActions";

const OUR_BANK = "bank-ours";
const OTHER_BANK = "bank-other";
const HOSPITAL = "hospital-1";

const at = (iso: string) => Date.parse(iso);
const NOW = at("2026-10-28T10:00:00Z");

function reservation(
  ref: string,
  status: Reservation["status"] = "ACTIVE",
  holdExpiresAt = "2026-10-28T12:00:00Z",
  expiryDate = "2026-11-30",
): Reservation {
  return { id: `r-${ref}`, unit: { id: `u-${ref}`, reference: ref, expiryDate }, status, holdExpiresAt, createdAt: "2026-10-28T09:00:00Z" };
}

function request(state: RequestState, reservations: Reservation[] = []): BloodRequest {
  return {
    state,
    bank: { id: OUR_BANK },
    hospital: { id: HOSPITAL },
    reservations,
    history: [],
  } as unknown as BloodRequest;
}

const approved = (...reservations: Reservation[]) => request("APPROVED", reservations);

const ourBankStaff: Viewer = { role: "BANK_STAFF", organisationId: OUR_BANK };
const otherBankStaff: Viewer = { role: "BANK_STAFF", organisationId: OTHER_BANK };
const admin: Viewer = { role: "ADMIN", organisationId: null };
const hospitalStaff: Viewer = { role: "HOSPITAL_STAFF", organisationId: HOSPITAL };

describe("viewerOf", () => {
  it("reads the role and the organisation id from the session", () => {
    const session = {
      user: { role: "BANK_STAFF", organisation: { id: OUR_BANK } as Organisation },
    } as unknown as Session;
    expect(viewerOf(session)).toEqual(ourBankStaff);
  });

  it("has no organisation for the administrator, and nothing when signed out", () => {
    const session = { user: { role: "ADMIN", organisation: null } } as unknown as Session;
    expect(viewerOf(session)).toEqual(admin);
    expect(viewerOf(null)).toEqual({ role: null, organisationId: null });
  });
});

describe("actsForBank", () => {
  it("is true for staff of the addressed bank and for the administrator", () => {
    expect(actsForBank(request("PENDING"), ourBankStaff)).toBe(true);
    expect(actsForBank(request("PENDING"), admin)).toBe(true);
  });

  // Fails if the organisation comparison is removed and the role alone decides.
  it("is false for staff of another bank", () => {
    expect(actsForBank(request("PENDING"), otherBankStaff)).toBe(false);
  });

  it("is false for bank staff with no organisation, hospital staff and donors", () => {
    expect(actsForBank(request("PENDING"), { role: "BANK_STAFF", organisationId: null })).toBe(false);
    expect(actsForBank(request("PENDING"), hospitalStaff)).toBe(false);
    expect(actsForBank(request("PENDING"), { role: "DONOR", organisationId: null })).toBe(false);
  });
});

describe("canDecide", () => {
  it("lets the addressed bank and the administrator decide a PENDING request", () => {
    expect(canDecide(request("PENDING"), ourBankStaff)).toBe(true);
    expect(canDecide(request("PENDING"), admin)).toBe(true);
  });

  // Fails if the organisation comparison is removed.
  it("never lets another bank decide", () => {
    expect(canDecide(request("PENDING"), otherBankStaff)).toBe(false);
  });

  it("is false for the requesting hospital", () => {
    expect(canDecide(request("PENDING"), hospitalStaff)).toBe(false);
  });

  it("is false once the request is no longer PENDING", () => {
    const states: RequestState[] = ["APPROVED", "DECLINED", "CANCELLED", "FULFILLED", "LAPSED", "UNIT_EXPIRED"];
    for (const state of states) {
      expect(canDecide(request(state), ourBankStaff)).toBe(false);
      expect(canDecide(request(state), admin)).toBe(false);
    }
  });
});

describe("isClosed", () => {
  it("is false only for PENDING and APPROVED", () => {
    expect(isClosed("PENDING")).toBe(false);
    expect(isClosed("APPROVED")).toBe(false);
    for (const state of ["DECLINED", "CANCELLED", "FULFILLED", "LAPSED", "UNIT_EXPIRED"] as const) {
      expect(isClosed(state)).toBe(true);
    }
  });
});

describe("canCancel", () => {
  it("lets the requesting hospital cancel a PENDING or APPROVED request", () => {
    expect(canCancel(request("PENDING"), hospitalStaff)).toBe(true);
    expect(canCancel(approved(reservation("U1")), hospitalStaff)).toBe(true);
  });

  // Fails if the organisation comparison is removed and the role alone decides.
  it("never lets another hospital cancel", () => {
    const otherHospital: Viewer = { role: "HOSPITAL_STAFF", organisationId: "hospital-2" };
    expect(canCancel(request("PENDING"), otherHospital)).toBe(false);
    expect(canCancel(request("PENDING"), { role: "HOSPITAL_STAFF", organisationId: null })).toBe(false);
  });

  it("is false for the bank, the administrator and donors", () => {
    expect(canCancel(request("PENDING"), ourBankStaff)).toBe(false);
    expect(canCancel(request("PENDING"), admin)).toBe(false);
    expect(canCancel(request("PENDING"), { role: "DONOR", organisationId: null })).toBe(false);
  });

  it("is false once the request is closed", () => {
    for (const state of ["DECLINED", "CANCELLED", "FULFILLED", "LAPSED", "UNIT_EXPIRED"] as const) {
      expect(canCancel(request(state), hospitalStaff)).toBe(false);
    }
  });
});

describe("canIssue", () => {
  it("lets the addressed bank and the administrator issue an APPROVED request with running holds", () => {
    const req = approved(reservation("U1"), reservation("U2"));
    expect(canIssue(req, ourBankStaff, NOW)).toBe(true);
    expect(canIssue(req, admin, NOW)).toBe(true);
  });

  // Fails if the organisation comparison is removed.
  it("never lets another bank issue", () => {
    expect(canIssue(approved(reservation("U1")), otherBankStaff, NOW)).toBe(false);
  });

  it("is false for the requesting hospital", () => {
    expect(canIssue(approved(reservation("U1")), hospitalStaff, NOW)).toBe(false);
  });

  it("is false in any state but APPROVED", () => {
    const states: RequestState[] = ["PENDING", "DECLINED", "CANCELLED", "FULFILLED", "LAPSED", "UNIT_EXPIRED"];
    for (const state of states) expect(canIssue(request(state, [reservation("U1")]), ourBankStaff, NOW)).toBe(false);
  });

  it("is false with no reservations", () => {
    expect(canIssue(approved(), ourBankStaff, NOW)).toBe(false);
  });

  it("is false once any hold has passed, even before withPassedHolds marks it", () => {
    const req = approved(reservation("U1"), reservation("U2", "ACTIVE", "2026-10-28T10:00:00Z"));
    expect(canIssue(req, ourBankStaff, NOW)).toBe(false);
  });

  it("is false when any reservation is not ACTIVE", () => {
    expect(canIssue(approved(reservation("U1"), reservation("U2", "LAPSED")), ourBankStaff, NOW)).toBe(false);
  });

  it("allows a unit on its expiry date in Lagos, and refuses it the day after", () => {
    const onExpiry = approved(reservation("U1", "ACTIVE", "2026-10-29T12:00:00Z", "2026-10-28"));
    expect(canIssue(onExpiry, ourBankStaff, NOW)).toBe(true);
    // 23:30 UTC on the 28th is already the 29th in Lagos.
    expect(canIssue(onExpiry, ourBankStaff, at("2026-10-28T23:30:00Z"))).toBe(false);
  });
});

describe("expiredHeldUnits", () => {
  it("names the held units past their expiry date in Lagos", () => {
    const req = approved(
      reservation("LCB-013", "ACTIVE", "2026-10-28T12:00:00Z", "2026-10-28"),
      reservation("LCB-014", "ACTIVE", "2026-10-28T12:00:00Z", "2026-10-27"),
    );
    expect(expiredHeldUnits(req, NOW)).toEqual(["LCB-014"]);
    // From Lagos midnight the unit expiring on the 28th is past its date too.
    expect(expiredHeldUnits(req, at("2026-10-28T23:30:00Z"))).toEqual(["LCB-013", "LCB-014"]);
  });

  it("is empty when every held unit is in date, and ignores holds that are not ACTIVE", () => {
    expect(expiredHeldUnits(approved(reservation("U1")), NOW)).toEqual([]);
    const lapsed = approved(reservation("U1", "LAPSED", "2026-10-28T12:00:00Z", "2026-10-01"));
    expect(expiredHeldUnits(lapsed, NOW)).toEqual([]);
  });

  it("goes with canIssue: an expired held unit is why the issue is refused", () => {
    const req = approved(reservation("LCB-014", "ACTIVE", "2026-10-28T12:00:00Z", "2026-10-27"));
    expect(canIssue(req, ourBankStaff, NOW)).toBe(false);
    expect(expiredHeldUnits(req, NOW)).toEqual(["LCB-014"]);
  });
});

describe("expiredUnitsMessage", () => {
  it("names one unit and says the status is derived", () => {
    expect(expiredUnitsMessage(["LCB-014"])).toBe(
      "Can't record as issued: unit LCB-014 passed its expiry date (based on expiry date).",
    );
  });

  it("names several units", () => {
    expect(expiredUnitsMessage(["LCB-013", "LCB-014"])).toBe(
      "Can't record as issued: units LCB-013, LCB-014 passed their expiry dates (based on expiry date).",
    );
  });
});

describe("issuedUnitReferences", () => {
  it("lists the units on a running hold", () => {
    const req = approved(reservation("LCB-1"), reservation("LCB-2", "LAPSED"), reservation("LCB-3"));
    expect(issuedUnitReferences(req)).toEqual(["LCB-1", "LCB-3"]);
  });
});

describe("canReverseIssue", () => {
  const fulfilled = () => request("FULFILLED", [reservation("U1", "ISSUED")]);

  it("lets the addressed bank and the administrator reverse a FULFILLED request", () => {
    expect(canReverseIssue(fulfilled(), ourBankStaff)).toBe(true);
    expect(canReverseIssue(fulfilled(), admin)).toBe(true);
  });

  // Fails if the organisation comparison is removed.
  it("never lets another bank or the hospital reverse", () => {
    expect(canReverseIssue(fulfilled(), otherBankStaff)).toBe(false);
    expect(canReverseIssue(fulfilled(), hospitalStaff)).toBe(false);
  });

  it("is false in any state but FULFILLED", () => {
    const states: RequestState[] = ["PENDING", "APPROVED", "DECLINED", "CANCELLED", "LAPSED", "UNIT_EXPIRED"];
    for (const state of states) expect(canReverseIssue(request(state, [reservation("U1", "ISSUED")]), ourBankStaff)).toBe(false);
  });
});

describe("reversalOutcomes", () => {
  it("sends in-date issued units back to stock and expired ones to EXPIRED, by the Lagos date", () => {
    const req = request("FULFILLED", [
      reservation("LCB-1", "ISSUED", "2026-10-28T12:00:00Z", "2026-10-28"),
      reservation("LCB-2", "ISSUED", "2026-10-28T12:00:00Z", "2026-10-27"),
    ]);
    expect(reversalOutcomes(req, NOW)).toEqual([
      { reference: "LCB-1", expired: false },
      { reference: "LCB-2", expired: true },
    ]);
    // 23:30 UTC on the 28th is already the 29th in Lagos.
    expect(reversalOutcomes(req, at("2026-10-28T23:30:00Z")).map((o) => o.expired)).toEqual([true, true]);
  });

  it("only lists issued units", () => {
    const req = request("FULFILLED", [reservation("LCB-1", "ISSUED"), reservation("LCB-2", "RELEASED")]);
    expect(reversalOutcomes(req, NOW).map((o) => o.reference)).toEqual(["LCB-1"]);
  });
});

describe("reversalOutcomeLabel", () => {
  it("says where each unit goes and that it is derived from the expiry date", () => {
    expect(reversalOutcomeLabel({ reference: "LCB-1", expired: false })).toBe(
      "LCB-1: back in stock as available (based on expiry date).",
    );
    expect(reversalOutcomeLabel({ reference: "LCB-2", expired: true })).toBe(
      "LCB-2: past its expiry date, so it becomes expired, not available (based on expiry date).",
    );
  });
});

describe("unconfirmedMessage", () => {
  it("says what the request shows now", () => {
    expect(unconfirmedMessage("FULFILLED")).toBe("We couldn't confirm. The request now shows as Fulfilled.");
    expect(unconfirmedMessage("APPROVED")).toBe("We couldn't confirm. The request now shows as Approved.");
  });

  it("names the request when there are several on screen", () => {
    expect(unconfirmedMessage("CANCELLED", "Request REQ-1")).toBe("We couldn't confirm. Request REQ-1 now shows as Cancelled.");
  });

  it("asks the user to check again when the reload failed too", () => {
    expect(unconfirmedMessage(null)).toMatch(/Check the request again/);
  });
});

describe("canReleaseHold", () => {
  const emergency = (state: RequestState, urgency: BloodRequest["urgency"] = "EMERGENCY") =>
    ({ ...request(state), urgency }) as BloodRequest;

  it("is true on a PENDING EMERGENCY for staff of the addressed bank and the administrator", () => {
    expect(canReleaseHold(emergency("PENDING"), ourBankStaff)).toBe(true);
    expect(canReleaseHold(emergency("PENDING"), admin)).toBe(true);
  });

  it("is false for hospital staff, staff of another bank and donors", () => {
    expect(canReleaseHold(emergency("PENDING"), hospitalStaff)).toBe(false);
    expect(canReleaseHold(emergency("PENDING"), otherBankStaff)).toBe(false);
    expect(canReleaseHold(emergency("PENDING"), { role: "DONOR", organisationId: null })).toBe(false);
  });

  it("is false unless the request is an emergency that is still pending", () => {
    expect(canReleaseHold(emergency("PENDING", "URGENT"), ourBankStaff)).toBe(false);
    expect(canReleaseHold(emergency("PENDING", "ROUTINE"), ourBankStaff)).toBe(false);
    for (const state of ["APPROVED", "DECLINED", "CANCELLED", "FULFILLED", "LAPSED"] as const) {
      expect(canReleaseHold(emergency(state), ourBankStaff)).toBe(false);
    }
  });
});
