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

/** Staff of the hospital that made the request. Not the administrator: the contract gives them 403. */
export function isRequestingHospital(request: BloodRequest, viewer: Viewer): boolean {
  return (
    viewer.role === "HOSPITAL_STAFF" && viewer.organisationId !== null && viewer.organisationId === request.hospital.id
  );
}

/** Closed: nothing more can happen to it. Only PENDING and APPROVED are open. */
export function isClosed(state: RequestState): boolean {
  return state !== "PENDING" && state !== "APPROVED";
}

/** Cancel: the requesting hospital only, while the request is not closed. */
export function canCancel(request: BloodRequest, viewer: Viewer): boolean {
  return !isClosed(request.state) && isRequestingHospital(request, viewer);
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

/**
 * The units on hold that have passed their expiry date, which stop the issue. Worked out from
 * expiryDate on our side: UnitSummary has no state field yet.
 */
export function expiredHeldUnits(request: BloodRequest, now: number): string[] {
  return request.reservations
    .filter((r) => r.status === "ACTIVE" && isUnitExpired(r.unit.expiryDate, now))
    .map((r) => r.unit.reference);
}

/** Why the issue is refused, naming the expired units. Marked as derived from the expiry date. */
export function expiredUnitsMessage(unitReferences: readonly string[]): string {
  if (unitReferences.length === 1) {
    return `Can't record as issued: unit ${unitReferences[0]} passed its expiry date (based on expiry date).`;
  }
  return `Can't record as issued: units ${unitReferences.join(", ")} passed their expiry dates (based on expiry date).`;
}

/** The references of the units an issue hands over: those on a running hold. */
export function issuedUnitReferences(request: BloodRequest): string[] {
  return request.reservations.filter((r) => r.status === "ACTIVE").map((r) => r.unit.reference);
}

/**
 * After a lost connection we can't tell whether the action happened, so we reload and say what
 * the request shows now. `state` is null when that reload failed too. `subject` names the request
 * where there are several ("Request REQ-2026-000123").
 */
export function unconfirmedMessage(state: RequestState | null, subject = "The request"): string {
  if (state === null) return "We couldn't confirm whether that went through, or check the latest state. Check the request again before trying once more.";
  return `We couldn't confirm. ${subject} now shows as ${REQUEST_STATE_LABELS[state]}.`;
}
