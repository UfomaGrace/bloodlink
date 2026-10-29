// Mock simulation: show the mock's canned request in another state, so every action can be tried.
//
// - Prism always answers with the same request: APPROVED, with a hold that ended on 26 Oct 2026,
//   so on any later day it reads as lapsed and no action is offered.
// - simulateRequest rebuilds that request in the chosen state with dates fresh from `at` (the
//   moment the option was picked): a hold ending 30 minutes later, a unit in date or past it.
// - Display only. Write calls still go to Prism unchanged, and "Force response" still decides
//   their status code. History is left as the mock sent it (no invented entries).
// - Used only when IS_MOCK is true (components/MockControls).
//
// Dashboard: the contract has no Dashboard example, so Prism makes one up from the schema
// (counts of -2147483648, names "string", dates in 2019). simulateDashboard replaces it with
// "Sample figures" (realistic, dates from `at`) or "Empty (first use)". Display only, like above.

import type { BloodRequest, Dashboard, GroupCount, Organisation, Reservation, Unit } from "../api/types";
import { lagosToday } from "./expiry";

export type SimulatedState = "PENDING" | "APPROVED_HOLD_RUNNING" | "APPROVED_UNIT_EXPIRED" | "FULFILLED";

export const SIMULATED_STATE_LABELS: Record<SimulatedState, string> = {
  PENDING: "Pending",
  APPROVED_HOLD_RUNNING: "Approved, hold running",
  APPROVED_UNIT_EXPIRED: "Approved, unit expired",
  FULFILLED: "Fulfilled",
};

export const SIMULATED_HOLD_MS = 30 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

function held(r: Reservation, at: number, status: Reservation["status"], expiryDate: string): Reservation {
  return {
    ...r,
    status,
    holdExpiresAt: new Date(at + SIMULATED_HOLD_MS).toISOString(),
    createdAt: new Date(at).toISOString(),
    unit: { ...r.unit, expiryDate },
  };
}

/** The canned request as it would read in `state`, with dates computed from `at` (ms). */
export function simulateRequest(request: BloodRequest, state: SimulatedState, at: number): BloodRequest {
  const inDate = lagosToday(at + 30 * DAY_MS);
  const pastDate = lagosToday(at - DAY_MS);
  switch (state) {
    case "PENDING":
      return { ...request, state: "PENDING", declineReason: null, reservations: [] };
    case "APPROVED_HOLD_RUNNING":
      return { ...request, state: "APPROVED", reservations: request.reservations.map((r) => held(r, at, "ACTIVE", inDate)) };
    case "APPROVED_UNIT_EXPIRED":
      return { ...request, state: "APPROVED", reservations: request.reservations.map((r) => held(r, at, "ACTIVE", pastDate)) };
    case "FULFILLED":
      return { ...request, state: "FULFILLED", reservations: request.reservations.map((r) => held(r, at, "ISSUED", inDate)) };
  }
}

export type DashboardSimulation = "SAMPLE" | "EMPTY";

export const DASHBOARD_SIMULATION_LABELS: Record<DashboardSimulation, string> = {
  SAMPLE: "Sample figures",
  EMPTY: "Empty (first use)",
};

const MINUTE_MS = 60_000;

const SAMPLE_BANKS: readonly Organisation[] = [
  { id: "5b0e7c1a-1f2d-4a3b-9c4d-5e6f7a8b9c01", name: "Lagos Central Blood Bank (demo)", type: "BLOOD_BANK", area: "Ikeja" },
  { id: "5b0e7c1a-1f2d-4a3b-9c4d-5e6f7a8b9c02", name: "Surulere Blood Centre (demo)", type: "BLOOD_BANK", area: "Surulere" },
];

/** The bank "Sample figures" names when the signed-in bank staff user has no organisation. */
export const DEMO_BANK = SAMPLE_BANKS[0];

const SAMPLE_HOSPITALS: readonly Organisation[] = [
  { id: "6c1f8d2b-2a3e-4b4c-8d5e-6f7a8b9c0d01", name: "Yaba General Hospital (demo)", type: "HOSPITAL", area: "Yaba" },
  { id: "6c1f8d2b-2a3e-4b4c-8d5e-6f7a8b9c0d02", name: "Lekki Community Clinic (demo)", type: "HOSPITAL", area: "Lekki" },
];

// All eight groups; A− and B− are below the threshold of 5.
const SAMPLE_GROUPS: readonly GroupCount[] = [
  { bloodGroup: "A", rhesus: "POSITIVE", availableUnits: 14 },
  { bloodGroup: "A", rhesus: "NEGATIVE", availableUnits: 3 },
  { bloodGroup: "B", rhesus: "POSITIVE", availableUnits: 11 },
  { bloodGroup: "B", rhesus: "NEGATIVE", availableUnits: 2 },
  { bloodGroup: "AB", rhesus: "POSITIVE", availableUnits: 6 },
  { bloodGroup: "AB", rhesus: "NEGATIVE", availableUnits: 5 },
  { bloodGroup: "O", rhesus: "POSITIVE", availableUnits: 22 },
  { bloodGroup: "O", rhesus: "NEGATIVE", availableUnits: 7 },
];

const SAMPLE_THRESHOLD = 5;

function sampleUnit(
  n: number,
  bank: Organisation,
  group: Pick<Unit, "bloodGroup" | "rhesus" | "component" | "state">,
  daysLeft: number,
  at: number,
): Unit {
  return {
    id: `7d2a9e3c-3b4f-4c5d-9e6f-7a8b9c0d1e0${n}`,
    reference: `LCB-2026-0${4100 + n}`,
    ...group,
    collectionDate: lagosToday(at - (35 - daysLeft) * DAY_MS),
    expiryDate: lagosToday(at + daysLeft * DAY_MS),
    bank,
    recordedAt: new Date(at - (35 - daysLeft) * DAY_MS).toISOString(),
  };
}

/** A whole dashboard for `state`, with dates from `at` (ms). `bank` null means "All banks". */
export function simulateDashboard(state: DashboardSimulation, at: number, bank: Organisation | null): Dashboard {
  const base = {
    computedAt: new Date(at).toISOString(),
    bank,
    lowStockThreshold: SAMPLE_THRESHOLD,
    holdsEndingWithinMinutes: 120,
    expiringWithinDays: 7,
  };
  const ago = (minutes: number) => new Date(at - minutes * MINUTE_MS).toISOString();

  if (state === "EMPTY") {
    const groups = SAMPLE_GROUPS.map((g): GroupCount => ({ ...g, availableUnits: 0 }));
    return {
      ...base,
      availableByGroup: groups,
      lowGroups: groups, // 0 is below the threshold, so a real first-use answer lists every group
      openRequests: { pending: 0, approved: 0 },
      holdsEndingSoon: [],
      unitsExpiringSoon: [],
      recentActivity: [],
    };
  }

  const [bankA, bankB] = bank ? [bank, bank] : SAMPLE_BANKS;
  return {
    ...base,
    availableByGroup: [...SAMPLE_GROUPS],
    lowGroups: SAMPLE_GROUPS.filter((g) => g.availableUnits < SAMPLE_THRESHOLD),
    openRequests: { pending: 4, approved: 2 },
    holdsEndingSoon: [
      {
        requestId: "8e3b0f4d-4c5a-4d6e-8f7a-8b9c0d1e2f01",
        requestReference: "REQ-2026-000318",
        hospital: SAMPLE_HOSPITALS[0],
        unit: { id: "7d2a9e3c-3b4f-4c5d-9e6f-7a8b9c0d1e11", reference: "LCB-2026-04087", expiryDate: lagosToday(at + 12 * DAY_MS) },
        holdExpiresAt: new Date(at + 4 * MINUTE_MS + 30_000).toISOString(),
      },
      {
        requestId: "8e3b0f4d-4c5a-4d6e-8f7a-8b9c0d1e2f02",
        requestReference: "REQ-2026-000321",
        hospital: SAMPLE_HOSPITALS[1],
        unit: { id: "7d2a9e3c-3b4f-4c5d-9e6f-7a8b9c0d1e12", reference: "LCB-2026-04093", expiryDate: lagosToday(at + 20 * DAY_MS) },
        holdExpiresAt: new Date(at + 75 * MINUTE_MS).toISOString(),
      },
    ],
    unitsExpiringSoon: [
      sampleUnit(1, bankA, { bloodGroup: "O", rhesus: "NEGATIVE", component: "RED_CELLS", state: "AVAILABLE" }, 0, at),
      sampleUnit(2, bankB, { bloodGroup: "A", rhesus: "POSITIVE", component: "PLATELETS", state: "RESERVED" }, 1, at),
      sampleUnit(3, bankA, { bloodGroup: "B", rhesus: "POSITIVE", component: "WHOLE_BLOOD", state: "AVAILABLE" }, 3, at),
      sampleUnit(4, bankB, { bloodGroup: "AB", rhesus: "NEGATIVE", component: "PLASMA", state: "AVAILABLE" }, 6, at),
    ],
    recentActivity: [
      { at: ago(3), event: "RECORDED", subject: "UNIT", reference: "LCB-2026-04112", actor: "Adaeze Okafor", note: null },
      { at: ago(18), event: "APPROVED", subject: "REQUEST", reference: "REQ-2026-000321", actor: "Tunde Bakare", note: null },
      { at: ago(42), event: "CREATED", subject: "REQUEST", reference: "REQ-2026-000324", actor: "Dr Chioma Eze", note: null },
      { at: ago(65), event: "ISSUED", subject: "UNIT", reference: "LCB-2026-04071", actor: "Adaeze Okafor", note: null },
      {
        at: ago(130),
        event: "DECLINED",
        subject: "REQUEST",
        reference: "REQ-2026-000309",
        actor: "Tunde Bakare",
        note: "No AB− platelets in stock.",
      },
      { at: ago(190), event: "HOLD_LAPSED", subject: "REQUEST", reference: "REQ-2026-000301", actor: "System", note: null },
      { at: ago(260), event: "BOOKED", subject: "BOOKING", reference: lagosToday(at + DAY_MS) + " 10:00", actor: "Ngozi Adeyemi", note: null },
    ],
  };
}
