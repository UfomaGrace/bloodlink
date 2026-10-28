// Mock simulation: show the mock's canned request in another state, so every action can be tried.
//
// - Prism always answers with the same request: APPROVED, with a hold that ended on 26 Oct 2026,
//   so on any later day it reads as lapsed and no action is offered.
// - simulateRequest rebuilds that request in the chosen state with dates fresh from `at` (the
//   moment the option was picked): a hold ending 30 minutes later, a unit in date or past it.
// - Display only. Write calls still go to Prism unchanged, and "Force response" still decides
//   their status code. History is left as the mock sent it (no invented entries).
// - Used only when IS_MOCK is true (components/MockControls).

import type { BloodRequest, Reservation } from "../api/types";
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
