// Request actions: which actions the signed-in user may take on a request.
//
// - The service has the last word (403 / 404). These only decide which buttons to show, so
//   nobody is offered an action the service would refuse.
// - Bank staff act only on requests addressed to their own bank; the administrator on any.
//   The role alone is not enough: staff of another bank must not see the buttons.
// - Pure: the viewer and the request are passed in, so the rules are easy to test.

import { userOrganisation, type BloodRequest, type RequestState, type Role, type Session } from "../api/types";
import { isUnitExpired } from "./expiry";
import { REQUEST_STATE_LABELS } from "./labels";

/** Who is looking: their role and the bank or hospital they work for (null for admin and donors). */
export type Viewer = { role: Role | null; organisationId: string | null };

export function viewerOf(session: Session | null): Viewer {
  if (!session) return { role: null, organisationId: null };
  return { role: session.user.role, organisationId: userOrganisation(session.user)?.id ?? null };
}

/** Staff of the bank the request is addressed to, or the administrator. */
export function actsForBank(request: BloodRequest, viewer: Viewer): boolean {
  if (viewer.role === "ADMIN") return true;
  return viewer.role === "BANK_STAFF" && viewer.organisationId !== null && viewer.organisationId === request.bank.id;
}

/** Approve or decline: the addressed bank or the administrator, while the request is PENDING. */
export function canDecide(request: BloodRequest, viewer: Viewer): boolean {
  return request.state === "PENDING" && actsForBank(request, viewer);
}

/**
 * Record as issued: the addressed bank or the administrator, while the request is APPROVED with
 * every hold still running and no reserved unit past its expiry date (the contract's rule for
 * POST /requests/{id}/issue). Pass the request through withPassedHolds first, or let `now` catch it.
 */
export function canIssue(request: BloodRequest, viewer: Viewer, now: number): boolean {
  return (
    request.state === "APPROVED" &&
    actsForBank(request, viewer) &&
    request.reservations.length > 0 &&
    request.reservations.every(
      (r) => r.status === "ACTIVE" && Date.parse(r.holdExpiresAt) > now && !isUnitExpired(r.unit.expiryDate, now),
    )
  );
}

/** The references of the units an issue hands over: those on a running hold. */
export function issuedUnitReferences(request: BloodRequest): string[] {
  return request.reservations.filter((r) => r.status === "ACTIVE").map((r) => r.unit.reference);
}

/**
 * After a lost connection we can't tell whether the action happened, so we reload and say what
 * the request shows now. `state` is null when that reload failed too.
 */
export function unconfirmedMessage(state: RequestState | null): string {
  if (state === null) return "We couldn't confirm whether that went through, or check the latest state. Check the request again before trying once more.";
  return `We couldn't confirm. The request now shows as ${REQUEST_STATE_LABELS[state]}.`;
}
