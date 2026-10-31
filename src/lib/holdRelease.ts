// Hold release: which routine holds bank staff may release for a PENDING emergency, and every
// sentence the screen says about it.
//
// Policy: ADR-002 (bloodlink-service/docs/adr/002-hold-length-and-emergency-pre-emption.md,
// accepted 25 Oct 2026).
// - Hold length depends on urgency: emergency 1 h, urgent 2 h, routine 4 h. These are service
//   settings (HOLD_EMERGENCY, HOLD_URGENT, HOLD_ROUTINE), so we never work out a hold end
//   ourselves: every time shown is the service's holdExpiresAt. The lengths appear only in wording
//   below, labelled as set by the service. If ADR-002 changes, this file is the one to change.
// - No automatic pre-emption. Staff of the owning bank (or the administrator) may release a
//   ROUTINE hold for an EMERGENCY request, with a reason. The routine request goes back to PENDING
//   with a history entry; one transaction; refused when free matching units could already meet
//   the emergency.
//
// The call is made on the ROUTINE request: POST /requests/{routineId}/hold-release with
// { forRequestId: emergencyId, reason }. The answer is the emergency request only.
//
// Finding the candidates: BloodRequest says nothing about other requests' holds, so we read
// GET /requests?state=APPROVED (page by page, up to a limit) and GET /availability, and filter
// here. The administrator sees every bank's requests, so candidates are filtered by the
// emergency's bank, never by role alone. The service has the last word (409).

import { ApiError, type ApiResponse } from "../api/client";
import type {
  Availability,
  AvailabilityQuery,
  BloodRequest,
  BloodRequestPage,
  RequestQuery,
  Reservation,
} from "../api/types";
import { formatTime, holdTimeLabel } from "./labels";

/** Requests per page when scanning for candidates (the contract's maximum). */
export const CANDIDATE_PAGE_SIZE = 100;
/** Pages read before we stop and say there may be more. */
export const CANDIDATE_PAGE_LIMIT = 5;

/** A routine request that holds matching units, and its holds still running. */
export type HoldReleaseCandidate = { request: BloodRequest; heldUnits: Reservation[] };

/** What the scan read: the approved requests seen, free matching units, and when. */
export type HoldReleaseScan = {
  approved: BloodRequest[];
  freeUnits: number;
  /** Availability.computedAt: the candidates are labelled "based on records at" this. */
  computedAt: string;
  /** totalItems from the list, when we stopped before reading them all; null when we read them all. */
  truncatedAt: number | null;
};

/** Holds the service still reports as running and whose holdExpiresAt has not passed. */
export function runningHolds(request: BloodRequest, now: number): Reservation[] {
  return request.reservations.filter((r) => r.status === "ACTIVE" && Date.parse(r.holdExpiresAt) > now);
}

/** The contract's rule for the released request: APPROVED, ROUTINE, same bank, group, rhesus and component. */
function matchesEmergency(emergency: BloodRequest, other: BloodRequest): boolean {
  return (
    other.id !== emergency.id &&
    other.state === "APPROVED" &&
    other.urgency === "ROUTINE" &&
    other.bank.id === emergency.bank.id &&
    other.bloodGroup === emergency.bloodGroup &&
    other.rhesus === emergency.rhesus &&
    other.component === emergency.component
  );
}

/** Routine requests whose running holds could go to `emergency`, latest needed-by first (they can wait longest). */
export function releasableHolds(
  emergency: BloodRequest,
  approved: readonly BloodRequest[],
  now: number,
): HoldReleaseCandidate[] {
  return approved
    .filter((other) => matchesEmergency(emergency, other))
    .map((request) => ({ request, heldUnits: runningHolds(request, now) }))
    .filter((candidate) => candidate.heldUnits.length > 0)
    .sort((a, b) => Date.parse(b.request.neededBy) - Date.parse(a.request.neededBy));
}

/** Free matching units at the emergency's bank, from an availability answer. */
export function freeUnitsFor(emergency: BloodRequest, availability: Availability): number {
  return availability.items
    .filter(
      (row) =>
        row.bank.id === emergency.bank.id &&
        row.bloodGroup === emergency.bloodGroup &&
        row.rhesus === emergency.rhesus &&
        row.component === emergency.component,
    )
    .reduce((sum, row) => sum + row.availableUnits, 0);
}

/** Free units alone meet the emergency, so the service would refuse a release: approve directly. */
export function freeUnitsMeet(emergency: BloodRequest, freeUnits: number): boolean {
  return freeUnits >= emergency.quantity;
}

/** The two reads the scan needs, as api provides them (passed in so the scan is easy to test). */
export type ScanReads = {
  listRequests: (query: RequestQuery, signal?: AbortSignal) => Promise<ApiResponse<BloodRequestPage>>;
  searchAvailability: (query: AvailabilityQuery, signal?: AbortSignal) => Promise<ApiResponse<Availability>>;
};

/** Reads approved requests (up to CANDIDATE_PAGE_LIMIT pages) and free matching units for `emergency`. */
export async function loadHoldReleaseScan(
  emergency: BloodRequest,
  reads: ScanReads,
  signal?: AbortSignal,
): Promise<HoldReleaseScan> {
  const [{ data: availability }, list] = await Promise.all([
    reads.searchAvailability(
      {
        bankId: emergency.bank.id,
        bloodGroup: emergency.bloodGroup,
        rhesus: emergency.rhesus,
        component: emergency.component,
      },
      signal,
    ),
    readApproved(reads, signal),
  ]);
  return {
    approved: list.approved,
    freeUnits: freeUnitsFor(emergency, availability),
    computedAt: availability.computedAt,
    truncatedAt: list.approved.length < list.totalItems ? list.approved.length : null,
  };
}

async function readApproved(reads: ScanReads, signal?: AbortSignal) {
  const approved: BloodRequest[] = [];
  let totalItems = 0;
  for (let page = 0; page < CANDIDATE_PAGE_LIMIT; page++) {
    const { data } = await reads.listRequests({ state: "APPROVED", page, size: CANDIDATE_PAGE_SIZE }, signal);
    approved.push(...data.items);
    totalItems = data.totalItems;
    if (data.items.length === 0 || approved.length >= totalItems) break;
  }
  return { approved, totalItems };
}

// ---- Wording (ADR-002, accepted 25 Oct 2026). Keep every policy-dependent sentence here. ----

/** Hold lengths as the service sets them (ADR-002). For wording only: never used to compute a time. */
const HOLD_LENGTH_LABELS = { EMERGENCY: "1 hour", URGENT: "2 hours", ROUTINE: "4 hours" } as const;

/** One line in the emergency's Decision section. */
export const EMERGENCY_HOLD_LINE = `Emergency holds last ${HOLD_LENGTH_LABELS.EMERGENCY} (set by the service), so collect promptly.`;

/** The release section's introduction. */
export const RELEASE_INTRO =
  "No emergency takes a held unit automatically. If this emergency can't wait, you can release a routine request's hold for it. You give a reason, and the routine request goes back to pending with a history entry naming this emergency and you.";

/** "Based on records at 10:02." */
export function basedOnLabel(computedAt: string): string {
  return `Based on records at ${formatTime(computedAt)}.`;
}

export function truncatedLabel(read: number): string {
  return `Showing the first ${read} approved requests; there may be more.`;
}

export const ENOUGH_FREE_TITLE = "Enough free units: approve it directly";

export function enoughFreeMessage(freeUnits: number, quantity: number): string {
  return `${freeUnits} matching ${freeUnits === 1 ? "unit is" : "units are"} free and this request needs ${quantity}, so no routine hold can be released for it.`;
}

export const NO_CANDIDATES_MESSAGE =
  "No routine request at this bank holds matching units right now, so there is no hold to release.";

export function candidatesFoundMessage(count: number): string {
  return count === 1
    ? "1 routine request holds matching units."
    : `${count} routine requests hold matching units.`;
}

/** The soonest running hold end of a candidate: the service's holdExpiresAt, never computed. */
export function candidateHoldEnd(candidate: HoldReleaseCandidate): string {
  return candidate.heldUnits
    .map((r) => r.holdExpiresAt)
    .reduce((soonest, at) => (Date.parse(at) < Date.parse(soonest) ? at : soonest));
}

/** The plain consequence, for the chosen candidate. */
export function releaseConsequence(candidate: HoldReleaseCandidate, now: Date = new Date()): string {
  return `${candidate.request.reference} (routine, held until ${holdTimeLabel(candidateHoldEnd(candidate), now)}) goes back to pending. Its courier may already be on the way. Only release it if the emergency can't wait.`;
}

export function heldUnitsHeading(count: number): string {
  return count === 1 ? "Unit released from its hold" : `${count} units released from their holds`;
}

/** What the contract does not say. Labelled as our reading; it is on the contract questions list. */
export const LEFTOVER_UNITS_NOTE =
  "Our reading of the contract: the service then approves this emergency as a normal approval would and picks its units itself, so it may not take these exact units. Any it doesn't take go back to stock, or are marked expired if past their expiry date.";

export function releasedMessage(emergency: BloodRequest, routineReference: string): string {
  return `Hold released. ${emergency.reference} is approved and holds its units. ${routineReference} is back to pending.`;
}

/** Under the alert after a release: the response holds only the emergency request. */
export const RELEASED_LINK_HINT = "was loaded before the release. Open it and reload to see its new state.";
/** Under the alert after a lost connection: we can't tell whether the routine request changed. */
export const UNCONFIRMED_LINK_HINT = "may have changed too. Open it and reload to see its state.";

const CONFLICT_MESSAGES: Partial<Record<ApiError["code"], string>> = {
  HOLD_NOT_RELEASABLE:
    "That hold can't be released for this emergency: the routine request may no longer be approved, it may not match, or free units can now meet the emergency. Nothing changed. We've checked again.",
  REQUEST_NOT_PENDING:
    "This emergency request is no longer pending (it may have been approved, declined or cancelled). Nothing was released. We've reloaded it.",
  UNITS_NO_LONGER_AVAILABLE:
    "Even with that hold released, there aren't enough matching units to meet this emergency, so nothing was released. The routine request keeps its hold. We've checked again.",
};

/** A 409 from hold-release with our own message for its code; anything else unchanged. */
export function holdReleaseError(error: ApiError): ApiError {
  const message = error.status === 409 ? CONFLICT_MESSAGES[error.code] : undefined;
  if (!message) return error;
  return new ApiError({
    status: error.status,
    code: error.code,
    message,
    requestId: error.requestId,
    details: error.details,
  });
}
