// Holds: how a request's reservations stand at a given moment.
//
// - The service reports a hold past `holdExpiresAt` as LAPSED at read time. These helpers do the
//   same on our side, so a screen that stays open never shows a passed hold as still held.
// - `now` is always passed in (milliseconds), so the helpers stay pure and easy to test.

import type { BloodRequest, RequestState, Reservation } from "../api/types";

/** Less than this left on a hold counts as "ends soon". */
export const HOLD_SOON_MS = 60 * 60_000;

export function holdHasPassed(reservation: Reservation, now: number): boolean {
  return reservation.status === "ACTIVE" && Date.parse(reservation.holdExpiresAt) <= now;
}

/**
 * The request as it stands at `now`: an ACTIVE hold whose time has passed reads LAPSED, and an
 * APPROVED request with nothing left on hold or issued reads LAPSED too. Unchanged otherwise.
 */
export function withPassedHolds(request: BloodRequest, now: number): BloodRequest {
  if (!request.reservations.some((r) => holdHasPassed(r, now))) return request;
  const reservations = request.reservations.map((r): Reservation => (holdHasPassed(r, now) ? { ...r, status: "LAPSED" } : r));
  const allLapsed = reservations.every((r) => r.status === "LAPSED");
  const state: RequestState = request.state === "APPROVED" && allLapsed ? "LAPSED" : request.state;
  return { ...request, state, reservations };
}

/** The soonest end among holds still running at `now` (ms), or null when none is. */
export function nextHoldEnd(reservations: readonly Reservation[], now: number): number | null {
  const ends = reservations
    .filter((r) => r.status === "ACTIVE")
    .map((r) => Date.parse(r.holdExpiresAt))
    .filter((at) => at > now);
  return ends.length > 0 ? Math.min(...ends) : null;
}
