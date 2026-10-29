// Mock simulation: show the mock's canned request in another state, so every action can be tried.
//
// - Prism always answers with the same request: APPROVED, with a hold that ended on 26 Oct 2026,
//   so on any later day it reads as lapsed and no action is offered.
// - simulateRequest rebuilds that request in the chosen state with dates fresh from `at` (the
//   moment the option was picked): a hold ending 30 minutes later, a unit in date or past it.
// - Display only. Write calls still go to Prism unchanged, and "Force response" still decides
//   their status code. History is left as the mock sent it (no invented entries).
// - Used only when IS_MOCK is true (components/MockControls).
// - The request detail screen adds three hold-release cases (REQUEST_DETAIL_SIMULATION_LABELS):
//   the canned request shown as a PENDING EMERGENCY, and simulateHoldReleaseScan standing in for
//   what GET /requests?state=APPROVED and GET /availability would find. A release still goes to
//   Prism, on the simulated routine request's id.
//
// Dashboard: the contract has no Dashboard example, so Prism makes one up from the schema
// (counts of -2147483648, names "string", dates in 2019). simulateDashboard replaces it with
// "Sample figures" (realistic, dates from `at`) or "Empty (first use)". Display only, like above.
//
// Donation slots: Prism's only DonationSlot example starts on 29 Oct 2026 at 09:00, so it soon
// reads as started. simulateSlots replaces the list with slots counted from `at`: some with
// places left, a full one, one that has started (closed to bookings), or none (first use).
// Display only: a booking still goes to Prism with the simulated slot's id.
//
// Bookings: Prism sends one canned booking in that started slot, so nothing can be cancelled.
// simulateBookings gives upcoming ones (cancellable), one in a started slot, and past ones.
// simulateSlotDetail gives one slot (the id in the URL, run by the viewer's bank) started with
// bookings to record, not started yet, or with nobody booked.

import type {
  BloodRequest,
  Booking,
  Dashboard,
  DonationSlot,
  DonationSlotList,
  GroupCount,
  Organisation,
  Reservation,
  Unit,
} from "../api/types";
import { lagosToday } from "./expiry";
import type { HoldReleaseScan } from "./holdRelease";

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

export type HoldReleaseSimulation = "EMERGENCY_RELEASABLE_HOLD" | "EMERGENCY_NO_RELEASABLE_HOLD" | "EMERGENCY_ENOUGH_FREE";

/** The request detail screen's choices: the request states plus the hold-release cases. */
export type RequestDetailSimulation = SimulatedState | HoldReleaseSimulation;

export const REQUEST_DETAIL_SIMULATION_LABELS: Record<RequestDetailSimulation, string> = {
  ...SIMULATED_STATE_LABELS,
  EMERGENCY_RELEASABLE_HOLD: "Emergency, routine hold releasable",
  EMERGENCY_NO_RELEASABLE_HOLD: "Emergency, no releasable hold",
  EMERGENCY_ENOUGH_FREE: "Emergency, enough free units",
};

export function isHoldReleaseSimulation(state: RequestDetailSimulation): state is HoldReleaseSimulation {
  return state.startsWith("EMERGENCY_");
}

/** The canned request as the detail screen shows it in `state`: an emergency case is a PENDING EMERGENCY. */
export function simulateRequestDetail(request: BloodRequest, state: RequestDetailSimulation, at: number): BloodRequest {
  if (!isHoldReleaseSimulation(state)) return simulateRequest(request, state, at);
  return { ...request, state: "PENDING", urgency: "EMERGENCY", declineReason: null, reservations: [] };
}

const HOUR_MS = 60 * 60_000;

/** An approved request at the emergency's bank, held for `holdHours` more from `at` (as if the service set it). */
function sampleApproved(
  emergency: BloodRequest,
  n: number,
  changes: Pick<BloodRequest, "urgency" | "quantity" | "component"> & { hospital: Organisation; neededInDays: number; holdHours: number },
  at: number,
): BloodRequest {
  const holdExpiresAt = new Date(at + changes.holdHours * HOUR_MS).toISOString();
  const approvedAt = new Date(at - HOUR_MS).toISOString();
  return {
    ...emergency,
    id: `e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a${String(n).padStart(2, "0")}`,
    reference: `REQ-2026-0003${String(n).padStart(2, "0")}`,
    hospital: changes.hospital,
    urgency: changes.urgency,
    quantity: changes.quantity,
    component: changes.component,
    state: "APPROVED",
    declineReason: null,
    neededBy: new Date(at + changes.neededInDays * DAY_MS).toISOString(),
    createdAt: new Date(at - 2 * HOUR_MS).toISOString(),
    reservations: Array.from({ length: changes.quantity }, (_, i): Reservation => ({
      id: `f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b${String(n * 10 + i).padStart(2, "0")}`,
      unit: {
        id: `a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c${String(n * 10 + i).padStart(2, "0")}`,
        reference: `LCB-2026-0${4200 + n * 10 + i}`,
        expiryDate: lagosToday(at + 20 * DAY_MS),
      },
      status: "ACTIVE",
      holdExpiresAt,
      createdAt: approvedAt,
    })),
    history: [
      { at: new Date(at - 2 * HOUR_MS).toISOString(), event: "CREATED", actor: `Staff, ${changes.hospital.name}`, note: null },
      { at: approvedAt, event: "APPROVED", actor: `Staff, ${emergency.bank.name}`, note: null },
    ],
  };
}

/**
 * What the hold-release scan would find for `emergency` in `state`, dates from `at` (ms).
 * Releasable: two matching routine requests (neededBy tomorrow and in 3 days) and an urgent one,
 * no free units. No releasable hold: only an urgent request and a routine one for another
 * component. Enough free: a matching routine request, but free units already meet the emergency.
 */
export function simulateHoldReleaseScan(state: HoldReleaseSimulation, emergency: BloodRequest, at: number): HoldReleaseScan {
  const [lekki, yaba] = [SAMPLE_HOSPITALS[1], SAMPLE_HOSPITALS[0]];
  const other = emergency.component === "PLASMA" ? "PLATELETS" : "PLASMA";
  const routineSoon = sampleApproved(emergency, 1, { urgency: "ROUTINE", quantity: 1, component: emergency.component, hospital: lekki, neededInDays: 1, holdHours: 3 }, at);
  const routineLater = sampleApproved(emergency, 2, { urgency: "ROUTINE", quantity: 2, component: emergency.component, hospital: yaba, neededInDays: 3, holdHours: 2 }, at);
  const urgent = sampleApproved(emergency, 3, { urgency: "URGENT", quantity: 1, component: emergency.component, hospital: lekki, neededInDays: 0, holdHours: 1 }, at);
  const otherComponent = sampleApproved(emergency, 4, { urgency: "ROUTINE", quantity: 1, component: other, hospital: yaba, neededInDays: 2, holdHours: 3 }, at);
  const base = { computedAt: new Date(at).toISOString(), truncatedAt: null };
  switch (state) {
    case "EMERGENCY_RELEASABLE_HOLD":
      return { ...base, approved: [routineSoon, urgent, routineLater], freeUnits: 0 };
    case "EMERGENCY_NO_RELEASABLE_HOLD":
      return { ...base, approved: [urgent, otherComponent], freeUnits: 0 };
    case "EMERGENCY_ENOUGH_FREE":
      return { ...base, approved: [routineSoon], freeUnits: emergency.quantity + 2 };
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

export type SlotListSimulation = "PLACES_LEFT" | "FULL" | "CLOSED" | "EMPTY";

export const SLOT_LIST_SIMULATION_LABELS: Record<SlotListSimulation, string> = {
  PLACES_LEFT: "Slots with places left",
  FULL: "A full slot",
  CLOSED: "A closed slot (started)",
  EMPTY: "Empty (first use)",
};

/** "HH:mm" on the Lagos day `daysAhead` after `at`, as an instant. Lagos has no daylight saving, so +01:00 always holds. */
function lagosAt(at: number, daysAhead: number, time: string): string {
  return new Date(`${lagosToday(at + daysAhead * DAY_MS)}T${time}:00+01:00`).toISOString();
}

function sampleSlot(n: number, bank: Organisation, startsAt: string, endsAt: string, capacity: number, booked: number): DonationSlot {
  return {
    id: `9f4c1a2b-5d6e-4f7a-8b9c-0d1e2f3a4b${String(n).padStart(2, "0")}`,
    bank,
    startsAt,
    endsAt,
    capacity,
    booked,
    placesLeft: Math.max(0, capacity - booked),
  };
}

/** A slot list for `state`, with dates from `at` (ms) and computedAt at `at`. */
export function simulateSlots(state: SlotListSimulation, at: number): DonationSlotList {
  const [bankA, bankB] = SAMPLE_BANKS;
  const open = [
    sampleSlot(1, bankA, lagosAt(at, 1, "09:00"), lagosAt(at, 1, "11:00"), 10, 7),
    sampleSlot(2, bankB, lagosAt(at, 2, "13:00"), lagosAt(at, 2, "15:00"), 6, 1),
    sampleSlot(3, bankA, lagosAt(at, 5, "10:00"), lagosAt(at, 5, "12:00"), 4, 0),
  ];
  const computedAt = new Date(at).toISOString();
  switch (state) {
    case "PLACES_LEFT":
      return { computedAt, items: open };
    case "FULL":
      return { computedAt, items: [sampleSlot(4, bankB, lagosAt(at, 1, "08:00"), lagosAt(at, 1, "10:00"), 4, 4), ...open.slice(1)] };
    case "CLOSED":
      // Started 30 minutes before `at`, still running: places left, but closed to bookings.
      return {
        computedAt,
        items: [
          sampleSlot(5, bankA, new Date(at - 30 * MINUTE_MS).toISOString(), new Date(at + 90 * MINUTE_MS).toISOString(), 8, 3),
          ...open.slice(1),
        ],
      };
    case "EMPTY":
      return { computedAt, items: [] };
  }
}

export type BookingListSimulation = "SAMPLE" | "EMPTY";

export const BOOKING_LIST_SIMULATION_LABELS: Record<BookingListSimulation, string> = {
  SAMPLE: "Upcoming and past bookings",
  EMPTY: "Empty (first use)",
};

function sampleBooking(n: number, slot: DonationSlot, status: Booking["status"], donorName: string, at: number): Booking {
  return {
    id: `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c0${n}`,
    slot,
    donor: { id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d01", displayName: donorName },
    status,
    createdAt: new Date(at - 20 * DAY_MS).toISOString(),
  };
}

/**
 * A donor's bookings for `state`, with dates from `at` (ms): two upcoming they can cancel, one in
 * a slot that has started (too late to cancel), one cancelled, and two past (attended, no-show).
 */
export function simulateBookings(state: BookingListSimulation, at: number, donorName: string): Booking[] {
  if (state === "EMPTY") return [];
  const [bankA, bankB] = SAMPLE_BANKS;
  const minutes = (n: number) => new Date(at + n * MINUTE_MS).toISOString();
  return [
    sampleBooking(1, sampleSlot(11, bankA, lagosAt(at, 1, "09:00"), lagosAt(at, 1, "11:00"), 10, 7), "BOOKED", donorName, at),
    sampleBooking(2, sampleSlot(12, bankB, lagosAt(at, 4, "13:00"), lagosAt(at, 4, "15:00"), 6, 2), "BOOKED", donorName, at),
    sampleBooking(3, sampleSlot(13, bankA, minutes(-30), minutes(90), 8, 5), "BOOKED", donorName, at),
    sampleBooking(4, sampleSlot(14, bankB, lagosAt(at, 2, "10:00"), lagosAt(at, 2, "12:00"), 6, 3), "CANCELLED", donorName, at),
    sampleBooking(5, sampleSlot(15, bankA, lagosAt(at, -7, "09:00"), lagosAt(at, -7, "11:00"), 10, 9), "ATTENDED", donorName, at),
    sampleBooking(6, sampleSlot(16, bankB, lagosAt(at, -14, "14:00"), lagosAt(at, -14, "16:00"), 6, 6), "NO_SHOW", donorName, at),
  ];
}

export type SlotDetailSimulation = "STARTED_WITH_BOOKINGS" | "NOT_STARTED" | "EMPTY";

export const SLOT_DETAIL_SIMULATION_LABELS: Record<SlotDetailSimulation, string> = {
  STARTED_WITH_BOOKINGS: "A started slot with bookings",
  NOT_STARTED: "A slot not started yet, with bookings",
  EMPTY: "No bookings yet (first use)",
};

const SAMPLE_DONORS = ["Ngozi Adeyemi", "Emeka Obi", "Funmi Lawal", "Ibrahim Musa", "Chiamaka Nwosu"];

/**
 * The slot at `slotId` (the one in the URL) run by `bank`, and its bookings, for `state`, with dates
 * from `at` (ms). Started: began 30 minutes before `at`, three still BOOKED (to record), one
 * attended, one cancelled. Not started: tomorrow, two BOOKED. Empty: the slot, nobody booked.
 */
export function simulateSlotDetail(
  state: SlotDetailSimulation,
  at: number,
  slotId: string,
  bank: Organisation,
): { slot: DonationSlot; bookings: Booking[] } {
  const started = state === "STARTED_WITH_BOOKINGS";
  const statuses: Booking["status"][] =
    state === "STARTED_WITH_BOOKINGS" ? ["BOOKED", "BOOKED", "BOOKED", "ATTENDED", "CANCELLED"] : state === "NOT_STARTED" ? ["BOOKED", "BOOKED"] : [];
  const active = statuses.filter((s) => s !== "CANCELLED").length;
  const slot: DonationSlot = {
    id: slotId,
    bank,
    startsAt: started ? new Date(at - 30 * MINUTE_MS).toISOString() : lagosAt(at, 1, "09:00"),
    endsAt: started ? new Date(at + 90 * MINUTE_MS).toISOString() : lagosAt(at, 1, "11:00"),
    capacity: 8,
    booked: active,
    placesLeft: 8 - active,
  };
  const bookings = statuses.map((status, i): Booking => ({
    id: `c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e${String(i + 1).padStart(2, "0")}`,
    slot,
    donor: { id: `d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f${String(i + 1).padStart(2, "0")}`, displayName: SAMPLE_DONORS[i] },
    status,
    createdAt: new Date(at - (i + 2) * DAY_MS).toISOString(),
  }));
  return { slot, bookings };
}
