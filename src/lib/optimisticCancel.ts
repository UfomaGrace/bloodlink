// Optimistic cancel: show a request as CANCELLED before the service answers, and undo it cleanly.
//
// Cancel is the app's one optimistic update, chosen because:
// - it is the hospital's own request, so nobody else's work is at stake;
// - it is low risk: the service only refuses it when the request has already closed (409) or isn't
//   theirs (403 / 404), and refusing it changes nothing on the service;
// - it is easy to undo on screen: the request we showed before is still there underneath.
//
// - The overlay is only the set of request ids being cancelled. The loaded data underneath is
//   never changed, so a rollback is removing the id: whatever is underneath shows again (the copy
//   from before, or a newer one if a reload came in meanwhile).
// - asCancelled changes the state and ends running holds (RELEASED, as the service does), so the
//   hold clock stops. It adds no history entry: the history shows only what the service recorded.
// - `now`-free and side-effect free, so the rollback is easy to test.

import type { ApiError } from "../api/client";
import type { BloodRequest, Reservation } from "../api/types";

/** Ids of the requests shown as cancelled while the service hasn't confirmed it. */
export type CancelOverlay = ReadonlySet<string>;

export const NO_CANCELS: CancelOverlay = new Set();

/** The request as it reads once cancelled: CANCELLED, with running holds RELEASED. */
export function asCancelled(request: BloodRequest): BloodRequest {
  const reservations = request.reservations.map((r): Reservation => (r.status === "ACTIVE" ? { ...r, status: "RELEASED" } : r));
  return { ...request, state: "CANCELLED", reservations };
}

export function startCancel(overlay: CancelOverlay, id: string): CancelOverlay {
  return new Set(overlay).add(id);
}

/** Take the request out of the overlay: on confirmation, rollback, or once a reload has answered. */
export function endCancel(overlay: CancelOverlay, id: string): CancelOverlay {
  if (!overlay.has(id)) return overlay;
  const next = new Set(overlay);
  next.delete(id);
  return next;
}

/** The request as the screen should show it. The same object back when it isn't being cancelled. */
export function withCancels(request: BloodRequest, overlay: CancelOverlay): BloodRequest {
  return overlay.has(request.id) ? asCancelled(request) : request;
}

/**
 * What to do with the overlay once the call settles. `error` is null on success.
 * - confirmed: the service cancelled it; show its copy.
 * - await-reload: a lost connection, so we can't tell. Keep showing CANCELLED until a reload answers.
 * - rollback: refused (409 REQUEST_CLOSED, 403, 404, 422 or anything else). Put the request back.
 */
export function cancelOutcome(error: ApiError | null): "confirmed" | "await-reload" | "rollback" {
  if (error === null) return "confirmed";
  if (error.isConnectionProblem) return "await-reload";
  return "rollback";
}

/** After a refusal, reload when our copy may be out of date: it closed, or isn't ours to see. */
export function reloadsAfterRefusal(error: ApiError): boolean {
  return error.status === 409 || error.status === 403 || error.status === 404;
}
