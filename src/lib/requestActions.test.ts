import { describe, expect, it } from "vitest";
import type { BloodRequest, Organisation, RequestState, Session } from "../api/types";
import { actsForBank, canDecide, viewerOf, type Viewer } from "./requestActions";

const OUR_BANK = "bank-ours";
const OTHER_BANK = "bank-other";
const HOSPITAL = "hospital-1";

function request(state: RequestState): BloodRequest {
  return {
    state,
    bank: { id: OUR_BANK },
    hospital: { id: HOSPITAL },
    reservations: [],
    history: [],
  } as unknown as BloodRequest;
}

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
