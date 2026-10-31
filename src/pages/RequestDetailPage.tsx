// RequestDetailPage (/requests/:requestId): one request, its reserved units and its history.
//
// Cancel is this app's one optimistic update (lib/optimisticCancel): it is the hospital's own
// request, it is low risk (a refusal changes nothing on the service), and it is easy to undo on
// screen (the request we showed before is still underneath). Every other action waits for the service.
//
// - GET /requests/{id}. 404 means "not found or not yours", so both get "Request not found".
// - Staff of the addressed bank and the administrator see Approve and Decline while the request is
//   PENDING (lib/requestActions canDecide). Staff of another bank never see them.
//     Approve → ConfirmDialog → POST /requests/{id}/approval (all or nothing).
//     Decline → dialog with a reason (lib/validation declineReason) → POST /requests/{id}/declination.
//   Success shows the request the service sent back, plus a success alert.
// - The same people see "Record as issued" while the request is APPROVED with every hold running
//   and no unit past its expiry date (canIssue). ConfirmDialog lists the unit references →
//   POST /requests/{id}/issue. 409 REQUEST_NOT_APPROVED (the hold lapsed, or it was already
//   issued) shows the message and reloads. If a held unit has passed its expiry date, the Issue
//   section says which one instead of offering the button (worked out from expiryDate, and
//   labelled so: UnitSummary has no state field yet).
// - The same people see "Reverse issue" while the request is FULFILLED (canReverseIssue), for an
//   issue recorded in error. A dialog (components/ReverseIssueDialog) lists each issued unit and
//   where it goes: back to stock, or EXPIRED if past its expiry date (reversalOutcomes, labelled
//   "based on expiry date"), and asks for a reason (lib/validation reversalReason) →
//   POST /requests/{id}/issue/reversal. Not optimistic: the dialog stays open until the service answers.
//     Reversed → the service's copy (PENDING again, history with both entries) and a success message.
//     409 REQUEST_NOT_FULFILLED (someone already reversed it) or 404 → the message, and a reload.
//     422 → the dialog stays open with the reason as typed and the field errors.
//     Lost connection → reload, then say what the request shows now. No retry.
// - Staff of the requesting hospital (only them, not the administrator) see "Cancel request" while
//   the request is PENDING or APPROVED (canCancel). A reason (lib/validation cancelReason) →
//   POST /requests/{id}/cancellation. The dialog closes and the request shows CANCELLED at once.
//     Confirmed → the service's copy and a success message.
//     Refused (409 REQUEST_CLOSED, 403, 404, anything else) → the request is put back as it was,
//       the message (our own for REQUEST_CLOSED: cancelRefusalError, else the service's) shows here and in an error Toast with "Reload", and after 409 / 403 /
//       404 the request is reloaded. In the mock the simulated state stays, so the rollback shows.
//     422 → put back, and the dialog reopens with the reason as typed and the field errors.
//     Lost connection → CANCELLED stays until the reload answers, then we say what it shows.
// - Staff of the addressed bank and the administrator see "Release a routine hold" while the
//   request is a PENDING EMERGENCY (canReleaseHold; ADR-002, wording in lib/holdRelease). The
//   section reads GET /requests?state=APPROVED and GET /availability (loadHoldReleaseScan) and
//   lists routine requests at the emergency's bank holding matching units, "based on records at".
//   If free units already meet the emergency it says so and points to Approve instead. A dialog
//   (components/ReleaseHoldDialog) lets the user choose one and give a reason →
//   POST /requests/{routineId}/hold-release with { forRequestId: this request, reason }. Not optimistic.
//     Released → the service's copy (this request, APPROVED) and a success message, plus a link to
//       the routine request: the answer doesn't include it, so it must be opened to see its new state.
//     409 HOLD_NOT_RELEASABLE, REQUEST_NOT_PENDING, UNITS_NO_LONGER_AVAILABLE → our own message per
//       code (holdReleaseError), then this request and the candidates are reloaded.
//     422 → the dialog stays open with the choice, the reason as typed and the field errors.
//     Lost connection → reload, then say what the request shows now. No retry.
// - While an action is in flight, the status line under the heading says so ("Recording issue…"),
//   because the busy button only shows a spinner. An open dialog hides that line from screen
//   readers, so the Issue, Reverse, Cancel and Release dialogs each have their own role="status" line too.
// - Issue and reverse are not idempotent and take no Idempotency-Key yet. On TIMEOUT or NETWORK_ERROR we
//   neither say "failed" nor retry: we reload, then say what the request shows now
//   ("We couldn't confirm. The request now shows as Fulfilled.").
// - 409 (UNITS_NO_LONGER_AVAILABLE, REQUEST_NOT_PENDING), 404 or a lost connection: the alert
//   shows the service's message, the dialog closes and the request is loaded again. After a 409
//   our copy is out of date (someone else decided it, or the units went), and after a lost
//   connection we can't tell whether the action happened, so only a fresh GET shows the truth.
// - The result shows in ResultAlert (components/ResultAlert): role="status" for success,
//   role="alert" for an error. Focus moves to it after each action.
// - Mock only (components/MockControls, never on the live API): Prism always answers with one
//   canned request whose hold has long ended. "Simulate state" shows it as Pending, Approved
//   (hold running or unit expired) or Fulfilled, with fresh dates, so every action can be tried;
//   "Force response" makes Prism refuse writes. Three more options show it as a pending emergency
//   with a releasable routine hold, with none, or with enough free units (simulateHoldReleaseScan
//   stands in for the candidate reads). Simulation is display only: the write still goes
//   to Prism, and once it answers the page shows what Prism sent, so the simulation ends.
// - Active holds count down ("Hold ends in 1h 12m"). The moment a hold passes we show it as
//   lapsed ourselves (the service does the same at read time), and if no unit is left on hold
//   or issued the request shows as LAPSED too. Then we reload once, quietly, to pick up what the
//   service recorded. A hold that is already past on arrival is shown lapsed but not reloaded
//   for, so a clock that runs ahead of the service's can't cause a reload loop.
// - Closed states (DECLINED, LAPSED, UNIT_EXPIRED, CANCELLED, FULFILLED) each get a banner
//   saying in plain words what happened.
// - Reserved unit references link to /units/:unitId for staff of the addressed bank and the
//   administrator (actsForBank). Hospital staff get plain text: GET /units/{id} answers them 403.

import { Form, Formik, type FormikHelpers } from "formik";
import { useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import * as Yup from "yup";
import { IS_MOCK, toApiError, type ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { BloodRequest, FieldIssue, RequestState, Reservation } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { applyApiError } from "../components/form/applyApiError";
import { FormAlert } from "../components/form/FormAlert";
import { FormikTextarea } from "../components/form/FormikTextarea";
import { HistoryList } from "../components/HistoryList";
import { CancelRequestDialog, cancelReopened, type CancelReopened } from "../components/CancelRequestDialog";
import { MockControls } from "../components/MockControls";
import { RequestStateBadge } from "../components/RequestStateBadge";
import { ReleaseHoldDialog } from "../components/ReleaseHoldDialog";
import { ResultAlert, type Notice } from "../components/ResultAlert";
import { ReverseIssueDialog } from "../components/ReverseIssueDialog";
import { UrgencyLabel } from "../components/UrgencyLabel";
import { useAsync } from "../hooks/useAsync";
import { useHoldClock } from "../hooks/useHoldClock";
import {
  basedOnLabel,
  candidatesFoundMessage,
  EMERGENCY_HOLD_LINE,
  ENOUGH_FREE_TITLE,
  enoughFreeMessage,
  freeUnitsMeet,
  holdReleaseError,
  loadHoldReleaseScan,
  NO_CANDIDATES_MESSAGE,
  RELEASE_INTRO,
  releasableHolds,
  RELEASED_LINK_HINT,
  releasedMessage,
  truncatedLabel,
  UNCONFIRMED_LINK_HINT,
  type HoldReleaseCandidate,
} from "../lib/holdRelease";
import { withPassedHolds } from "../lib/holds";
import {
  bloodTypeLabel,
  COMPONENT_LABELS,
  durationLabel,
  formatDate,
  formatDateTime,
  holdTimeLabel,
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_TONES,
  timeAgo,
} from "../lib/labels";
import {
  isHoldReleaseSimulation,
  REQUEST_DETAIL_SIMULATION_LABELS,
  simulateHoldReleaseScan,
  simulateRequestDetail,
  type RequestDetailSimulation,
} from "../lib/mockSimulation";
import {
  cancelOutcome,
  cancelRefusalError,
  endCancel,
  NO_CANCELS,
  reloadsAfterRefusal,
  startCancel,
  withCancels,
  type CancelOverlay,
} from "../lib/optimisticCancel";
import {
  actsForBank,
  canCancel,
  canDecide,
  canIssue,
  canReleaseHold,
  canReverseIssue,
  expiredHeldUnits,
  expiredUnitsMessage,
  issuedUnitReferences,
  reversalOutcomeLabel,
  reversalOutcomes,
  unconfirmedMessage,
  viewerOf,
  type ReversalOutcome,
} from "../lib/requestActions";
import { DECLINE_REASON_MAX, declineReason } from "../lib/validation";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { ConfirmDialog, Dialog } from "../shared/ui/dialog";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";
import { StatusBadge } from "../shared/ui/status-badge";
import { useToast } from "../shared/ui/toast";

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const backLink = cn(
  "inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-(--color-primary) underline underline-offset-2",
  focusRing,
);

const DECLINE_FIELDS = ["reason"] as const;
const declineSchema = Yup.object({ reason: declineReason() });
type DeclineValues = { reason: string };

/** "O" + "NEGATIVE" + "RED_CELLS" → "O− red cells". */
function whatLabel(request: BloodRequest): string {
  return `${bloodTypeLabel(request.bloodGroup, request.rhesus)} ${COMPONENT_LABELS[request.component].toLowerCase()}`;
}

function unitsLabel(count: number): string {
  return `${count} ${count === 1 ? "unit" : "units"}`;
}

/** The soonest hold end among the reservations, or null when there are none. */
function soonestHoldEnd(reservations: readonly Reservation[]): string | null {
  const times = reservations.map((r) => r.holdExpiresAt).filter((at) => !Number.isNaN(Date.parse(at)));
  if (times.length === 0) return null;
  return times.reduce((soonest, at) => (Date.parse(at) < Date.parse(soonest) ? at : soonest));
}

function approvedMessage(request: BloodRequest): string {
  const holdEnd = soonestHoldEnd(request.reservations);
  return holdEnd ? `Approved. Units reserved until ${holdTimeLabel(holdEnd)}.` : "Approved. Units reserved.";
}

function issuedMessage(unitReferences: readonly string[]): string {
  return unitReferences.length > 0
    ? `Recorded as issued: ${unitReferences.join(", ")}.`
    : "Recorded as issued.";
}

function reversedMessage(outcomes: readonly ReversalOutcome[]): string {
  return ["Issue reversed. The request is pending again.", ...outcomes.map(reversalOutcomeLabel)].join(" ");
}

export default function RequestDetailPage() {
  const { requestId = "" } = useParams();
  // A new id starts with fresh state: no leftover alert, override or open dialog.
  return <RequestDetail key={requestId} requestId={requestId} />;
}

function RequestDetail({ requestId }: { requestId: string }) {
  const { session } = useAuth();
  const viewer = viewerOf(session);
  const { toast } = useToast();

  const loaded = useAsync((signal) => api.getRequest(requestId, signal).then((res) => res.data), [requestId]);
  // The request an action sent back, and the loaded copy it replaced. It wins until a reload
  // brings a newer copy, so a quiet reload never flashes back to the state before the action.
  const [updated, setUpdatedState] = useState<{ request: BloodRequest; over: BloodRequest | null } | null>(null);
  const setUpdated = (next: BloodRequest | null) =>
    setUpdatedState(next && { request: next, over: loaded.data });
  const [notice, setNotice] = useState<Notice | null>(null);
  // Mock only: the state to show the canned request in, and when it was picked (dates count from then).
  const [simulated, setSimulatedState] = useState<{ state: RequestDetailSimulation; at: number } | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineIssues, setDeclineIssues] = useState<{ error: ApiError; issues: FieldIssue[] } | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);
  // What is in flight, for the status line ("Recording issue…"). Null when nothing is.
  const [inFlight, setInFlight] = useState<string | null>(null);
  // Set after a lost connection: the copy we had when the reload started, and whether a cancel
  // stays on screen until then.
  const [unconfirmed, setUnconfirmed] = useState<{ from: BloodRequest | null; endsCancel: boolean } | null>(null);
  // The optimistic cancel (lib/optimisticCancel). Holds this request's id while it is shown CANCELLED.
  const [cancels, setCancels] = useState<CancelOverlay>(NO_CANCELS);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelRefusedReason, setCancelRefusedReason] = useState<CancelReopened | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  // After a hold release (or a lost connection during one): the routine request, which the answer doesn't include.
  const [routineLink, setRoutineLink] = useState<{ id: string; reference: string; confirmed: boolean } | null>(null);
  const approveRef = useRef<HTMLButtonElement>(null);

  const fetched = updated && updated.over === loaded.data ? updated.request : loaded.data;
  const shown = fetched && IS_MOCK && simulated ? simulateRequestDetail(fetched, simulated.state, simulated.at) : fetched;
  const now = useHoldClock(shown?.reservations ?? [], loaded.reload);
  // As the service last told us, and as the screen shows it (CANCELLED while a cancel is unconfirmed).
  const confirmed = shown && withPassedHolds(shown, now);
  const request = confirmed && withCancels(confirmed, cancels);
  const cancelling = cancels.has(requestId);

  // Hold release: the candidates, read only when the action may be offered. In the mock a
  // hold-release simulation stands in for the two reads.
  const releaseAllowed = confirmed !== null && canReleaseHold(confirmed, viewer);
  const simulatedScan =
    IS_MOCK && simulated && isHoldReleaseSimulation(simulated.state) && confirmed
      ? simulateHoldReleaseScan(simulated.state, confirmed, simulated.at)
      : null;
  const readsScan = releaseAllowed && !simulatedScan;
  const fetchedScan = useAsync(
    (signal) => (readsScan && confirmed ? loadHoldReleaseScan(confirmed, api, signal) : Promise.resolve(null)),
    [requestId, readsScan],
  );
  const scan = simulatedScan ?? (readsScan ? fetchedScan.data : null);

  // After a lost connection, once the reload has answered, say what the request shows now.
  if (unconfirmed && !loaded.loading && (loaded.data !== unconfirmed.from || loaded.error)) {
    setUnconfirmed(null);
    if (unconfirmed.endsCancel) setCancels((overlay) => endCancel(overlay, requestId));
    setNotice({ tone: "info", message: unconfirmedMessage(loaded.error ? null : (confirmed?.state ?? null)) });
  }

  /** Mock only: a "Simulate state" choice. Its dates count from the moment it is picked. */
  function pickSimulation(state: RequestDetailSimulation | null) {
    setSimulatedState(state && { state, at: Date.now() });
  }

  // Once a write has answered, show what Prism sent: the simulation ends.
  function succeeded(next: BloodRequest, message: string) {
    setUpdated(next);
    setSimulatedState(null);
    setRoutineLink(null);
    setNotice({ tone: "success", message });
  }

  /** Show the error; reload when our copy may no longer be true. */
  function failed(error: ApiError) {
    setSimulatedState(null);
    setRoutineLink(null);
    setNotice({ tone: "error", error });
    if (error.status === 409 || error.status === 404 || error.isConnectionProblem) {
      setUpdated(null);
      loaded.reload();
    }
  }

  /** A lost connection: we can't tell whether it happened. No "failed", no retry: reload and report. */
  function checkAfterLostConnection(endsCancel = false) {
    setSimulatedState(null);
    setRoutineLink(null);
    setNotice(null);
    setUpdated(null);
    setUnconfirmed({ from: loaded.data, endsCancel });
    loaded.reload();
  }

  function openCancel() {
    setCancelRefusedReason(null);
    setCancelOpen(true);
  }

  // Optimistic: closes the dialog and shows CANCELLED before the service answers.
  async function cancel(reason: string) {
    setCancelOpen(false);
    setNotice(null);
    setCancels((overlay) => startCancel(overlay, requestId));
    setInFlight("Cancelling request…");
    try {
      const res = await api.cancelRequest(requestId, { reason });
      setCancels((overlay) => endCancel(overlay, requestId));
      succeeded(
        res.data,
        "Request cancelled. Any units held for it are back in stock, or are marked expired if past their expiry date.",
      );
    } catch (e) {
      const error = cancelRefusalError(toApiError(e));
      if (cancelOutcome(error) === "await-reload") {
        checkAfterLostConnection(true); // CANCELLED stays until the reload answers
        return;
      }
      setCancels((overlay) => endCancel(overlay, requestId)); // rollback
      if (error.code === "VALIDATION_FAILED") {
        setCancelRefusedReason(cancelReopened(reason, error));
        setCancelOpen(true);
        return;
      }
      // The simulated state (mock) stays, so the request is put back exactly as it was shown.
      setNotice({ tone: "error", error });
      toast({
        variant: "error",
        title: "Cancellation undone",
        description: `${error.message} Reference: ${error.requestId}`,
        action: { label: "Reload", onClick: loaded.reload },
      });
      if (reloadsAfterRefusal(error)) {
        setUpdated(null);
        loaded.reload();
      }
    } finally {
      setInFlight(null);
    }
  }

  // Resolves either way, so ConfirmDialog never stays open; we close it ourselves in the same update.
  async function issue(unitReferences: readonly string[]) {
    setInFlight("Recording issue…");
    try {
      const res = await api.issueRequest(requestId);
      setIssueOpen(false);
      succeeded(res.data, issuedMessage(unitReferences));
    } catch (e) {
      setIssueOpen(false);
      const error = toApiError(e);
      if (error.isConnectionProblem) checkAfterLostConnection();
      else failed(error);
    } finally {
      setInFlight(null);
    }
  }

  // Not optimistic. Resolves with the error after a 422 so the dialog keeps the reason; otherwise
  // we close the dialog ourselves and resolve null.
  async function reverse(reason: string, outcomes: readonly ReversalOutcome[]): Promise<ApiError | null> {
    setInFlight("Reversing issue…");
    try {
      const res = await api.reverseIssue(requestId, { reason });
      setReverseOpen(false);
      succeeded(res.data, reversedMessage(outcomes));
      return null;
    } catch (e) {
      const error = toApiError(e);
      if (error.code === "VALIDATION_FAILED") return error;
      setReverseOpen(false);
      if (error.isConnectionProblem) checkAfterLostConnection();
      else failed(error);
      return null;
    } finally {
      setInFlight(null);
    }
  }

  // Not optimistic. The call is made on the routine request, for this one. Resolves with the error
  // after a 422 so the dialog keeps the choice and reason; otherwise we close the dialog ourselves.
  async function releaseHold(candidate: HoldReleaseCandidate, reason: string): Promise<ApiError | null> {
    const routine = candidate.request;
    setInFlight("Releasing hold…");
    try {
      const res = await api.releaseHoldForEmergency(routine.id, { forRequestId: requestId, reason });
      setReleaseOpen(false);
      succeeded(res.data, releasedMessage(res.data, routine.reference));
      setRoutineLink({ id: routine.id, reference: routine.reference, confirmed: true });
      return null;
    } catch (e) {
      const error = toApiError(e);
      if (error.code === "VALIDATION_FAILED") return error;
      setReleaseOpen(false);
      if (error.isConnectionProblem) {
        checkAfterLostConnection();
        setRoutineLink({ id: routine.id, reference: routine.reference, confirmed: false });
      } else {
        failed(holdReleaseError(error));
      }
      // The candidates may have changed too (another hold released, units taken).
      if (error.status === 409 || error.isConnectionProblem) fetchedScan.reload();
      return null;
    } finally {
      setInFlight(null);
    }
  }

  // Resolves either way, so ConfirmDialog never stays open; we close it ourselves in the same update.
  async function approve() {
    try {
      const res = await api.approveRequest(requestId);
      setApproveOpen(false);
      succeeded(res.data, approvedMessage(res.data));
    } catch (e) {
      setApproveOpen(false);
      failed(toApiError(e));
    }
  }

  async function decline(values: DeclineValues, helpers: FormikHelpers<DeclineValues>) {
    setDeclining(true);
    setDeclineIssues(null);
    try {
      const res = await api.declineRequest(requestId, { reason: values.reason.trim() });
      setDeclineOpen(false);
      succeeded(res.data, "Request declined.");
    } catch (e) {
      const error = toApiError(e);
      if (error.code === "VALIDATION_FAILED") {
        // The reason itself was refused: keep the dialog open so it can be fixed.
        const issues = applyApiError(error, DECLINE_FIELDS, helpers.setFieldError);
        setDeclineIssues({ error, issues });
      } else {
        setDeclineOpen(false);
        failed(error);
      }
    } finally {
      setDeclining(false);
    }
  }

  function changeDeclineOpen(next: boolean) {
    if (!next && declining) return; // don't close while the decline is in flight
    if (next) setDeclineIssues(null);
    setDeclineOpen(next);
  }

  const alert = notice && <ResultAlert notice={notice} />;

  if (!request) {
    if (loaded.error?.status === 404) {
      return (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Request not found</h1>
          {alert && <div className="mt-4">{alert}</div>}
          <p className="mt-2 text-muted-foreground">
            It may have been removed, or it belongs to another hospital or bank.
          </p>
          <Link to="/requests" className={cn(backLink, "mt-4")}>
            Back to requests
          </Link>
        </>
      );
    }

    return (
      <>
        <Link to="/requests" className={backLink}>
          <span aria-hidden="true">←&nbsp;</span>All requests
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Request details</h1>
        {alert && <div className="mt-4">{alert}</div>}
        <div className="mt-6" aria-busy={loaded.loading || undefined}>
          {loaded.error ? (
            <ErrorState
              className="whitespace-pre-line"
              title="We couldn't load this request"
              description={`${loaded.error.message}\nReference: ${loaded.error.requestId}`}
              onRetry={loaded.reload}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <p role="status" className="text-sm font-medium">
                Loading request…
              </p>
              <Skeleton lines={8} />
            </div>
          )}
        </div>
      </>
    );
  }

  const what = whatLabel(request);
  const unitReferences = issuedUnitReferences(request);
  const issuable = canIssue(request, viewer, now);
  const reversible = canReverseIssue(request, viewer);
  const outcomes = reversible ? reversalOutcomes(request, now) : [];
  const expiredUnits =
    request.state === "APPROVED" && actsForBank(request, viewer) ? expiredHeldUnits(request, now) : [];
  const candidates = releaseAllowed && confirmed && scan ? releasableHolds(confirmed, scan.approved, now) : [];
  const busy = loaded.loading || inFlight !== null;
  const statusLine =
    inFlight ??
    (unconfirmed ? "We couldn't confirm. Checking the latest state…" : loaded.loading ? "Checking the latest state…" : "");

  return (
    <>
      <Link to="/requests" className={backLink}>
        <span aria-hidden="true">←&nbsp;</span>All requests
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight wrap-break-word">Request {request.reference}</h1>
        <RequestStateBadge state={request.state} />
      </div>
      {/* What is in flight, or that the request is reloading, so nobody acts on the old state. */}
      <p role="status" className="mt-1 min-h-5 text-sm text-muted-foreground">
        {statusLine}
      </p>

      {alert && <div className="mt-4">{alert}</div>}

      {routineLink && (
        <p className="mt-2 text-sm">
          <Link to={`/requests/${encodeURIComponent(routineLink.id)}`} className={backLink}>
            {routineLink.reference}
          </Link>{" "}
          {routineLink.confirmed ? RELEASED_LINK_HINT : UNCONFIRMED_LINK_HINT}
        </p>
      )}

      {loaded.error && (
        // A reload after an action failed; the details below may be out of date.
        <ErrorState
          className="mt-4 whitespace-pre-line"
          headingLevel="h2"
          title="We couldn't check the latest state"
          description={`${loaded.error.message}\nReference: ${loaded.error.requestId}`}
          onRetry={loaded.reload}
        />
      )}

      <MockControls
        className="mt-4"
        simulation={{ value: simulated?.state ?? null, onChange: pickSimulation, labels: REQUEST_DETAIL_SIMULATION_LABELS }}
      />

      {canDecide(request, viewer) && (
        <section
          aria-labelledby="decision-heading"
          className="mt-6 rounded-md border border-border bg-surface p-4"
        >
          <h2 id="decision-heading" className="text-lg font-semibold">
            Decision
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Approving reserves {unitsLabel(request.quantity)} of {what} for {request.hospital.name}.
          </p>
          {request.urgency === "EMERGENCY" && <p className="mt-1 text-sm font-medium">{EMERGENCY_HOLD_LINE}</p>}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button ref={approveRef} className="min-h-11" disabled={busy} onClick={() => setApproveOpen(true)}>
              Approve
            </Button>
            <Button
              variant="secondary"
              className="min-h-11"
              disabled={busy}
              onClick={() => changeDeclineOpen(true)}
            >
              Decline
            </Button>
          </div>
        </section>
      )}

      {releaseAllowed && (
        <section aria-labelledby="release-heading" className="mt-6 rounded-md border border-border bg-surface p-4">
          <h2 id="release-heading" className="text-lg font-semibold">
            Release a routine hold
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{RELEASE_INTRO}</p>
          {!scan ? (
            fetchedScan.error && !fetchedScan.loading ? (
              <ErrorState
                className="mt-4 whitespace-pre-line"
                headingLevel="h3"
                title="We couldn't check for routine holds"
                description={`${fetchedScan.error.message}\nReference: ${fetchedScan.error.requestId}`}
                onRetry={fetchedScan.reload}
              />
            ) : (
              <p className="mt-4 text-sm">Looking for routine holds at {request.bank.name}…</p>
            )
          ) : (
            <div className="mt-4 flex flex-col gap-2 text-sm">
              {freeUnitsMeet(request, scan.freeUnits) ? (
                <>
                  <p className="font-semibold">{ENOUGH_FREE_TITLE}</p>
                  <p>{enoughFreeMessage(scan.freeUnits, request.quantity)}</p>
                  <div>
                    <button type="button" className={backLink} onClick={() => approveRef.current?.focus()}>
                      Go to Approve
                    </button>
                  </div>
                </>
              ) : candidates.length === 0 ? (
                <p className="font-medium">{NO_CANDIDATES_MESSAGE}</p>
              ) : (
                <>
                  <p className="font-medium">{candidatesFoundMessage(candidates.length)}</p>
                  <div>
                    <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setReleaseOpen(true)}>
                      Release a routine hold
                    </Button>
                  </div>
                </>
              )}
              <p className="text-muted-foreground">
                {basedOnLabel(scan.computedAt)}
                {scan.truncatedAt !== null && ` ${truncatedLabel(scan.truncatedAt)}`}
              </p>
            </div>
          )}
        </section>
      )}

      {(issuable || expiredUnits.length > 0) && (
        <section aria-labelledby="issue-heading" className="mt-6 rounded-md border border-border bg-surface p-4">
          <h2 id="issue-heading" className="text-lg font-semibold">
            Issue
          </h2>
          {expiredUnits.length > 0 ? (
            <p className="mt-1 text-sm font-medium wrap-break-word">{expiredUnitsMessage(expiredUnits)}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                When the units leave the bank for {request.hospital.name}, record them as issued. The request is then
                fulfilled.
              </p>
              <div className="mt-4">
                <Button className="min-h-11" disabled={busy} onClick={() => setIssueOpen(true)}>
                  Record as issued
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {reversible && (
        <section aria-labelledby="reverse-heading" className="mt-6 rounded-md border border-border bg-surface p-4">
          <h2 id="reverse-heading" className="text-lg font-semibold">
            Reverse issue
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recorded as issued by mistake? Reverse it. The request goes back to pending, units still in date return to
            stock and any past their expiry date become expired.
          </p>
          <div className="mt-4">
            <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setReverseOpen(true)}>
              Reverse issue
            </Button>
          </div>
        </section>
      )}

      {confirmed && (canCancel(confirmed, viewer) || cancelling) && (
        <section aria-labelledby="cancel-heading" className="mt-6 rounded-md border border-border bg-surface p-4">
          <h2 id="cancel-heading" className="text-lg font-semibold">
            Cancel request
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No longer need this blood? Cancel the request. {request.bank.name} will see your reason, and any units
            held for it go back to stock, or are marked expired if past their expiry date.
          </p>
          <div className="mt-4">
            <Button
              variant="secondary"
              className="min-h-11"
              loading={cancelling}
              disabled={busy && !cancelling}
              onClick={openCancel}
            >
              Cancel request
            </Button>
          </div>
        </section>
      )}

      <section aria-labelledby="details-heading" className="mt-6">
        <h2 id="details-heading" className="text-lg font-semibold">
          Details
        </h2>
        <div className="mt-3">
          <DetailList
            details={[
              { term: "Reference", value: request.reference },
              { term: "State", value: <RequestStateBadge state={request.state} /> },
              { term: "Hospital", value: request.hospital.name },
              { term: "Bank", value: request.bank.name },
              { term: "Blood", value: what },
              { term: "Quantity", value: unitsLabel(request.quantity) },
              { term: "Urgency", value: <UrgencyLabel urgency={request.urgency} /> },
              { term: "Needed by", value: <time dateTime={request.neededBy}>{formatDateTime(request.neededBy)}</time> },
              {
                term: "Created",
                value: (
                  <time dateTime={request.createdAt}>
                    {formatDateTime(request.createdAt)}
                    {timeAgo(request.createdAt) && ` (${timeAgo(request.createdAt)})`}
                  </time>
                ),
              },
            ]}
          />
        </div>

        <OutcomeBanner request={request} />
      </section>

      {request.reservations.length > 0 && (
        <Reservations reservations={request.reservations} now={now} linkUnits={actsForBank(request, viewer)} />
      )}

      <HistoryList history={request.history} order="oldest" />

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Approve this request?"
        description={`Reserve ${unitsLabel(request.quantity)} of ${what}? If fewer are free, nothing is reserved.`}
        confirmLabel="Approve and reserve"
        onConfirm={approve}
      />

      <CancelRequestDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        request={request}
        reopened={cancelRefusedReason}
        onCancel={(reason) => void cancel(reason)}
      />

      <ReverseIssueDialog
        open={reverseOpen}
        onOpenChange={setReverseOpen}
        request={request}
        outcomes={outcomes}
        onReverse={(reason) => reverse(reason, outcomes)}
      />

      <ReleaseHoldDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        emergency={request}
        candidates={candidates}
        onRelease={releaseHold}
      />

      <ConfirmDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        title="Record these units as issued?"
        description={`Only once they have left the bank for ${request.hospital.name}. The request becomes fulfilled.`}
        confirmLabel="Record as issued"
        onConfirm={() => issue(unitReferences)}
      >
        {/* The dialog hides the page's status line from screen readers, so say it here too. */}
        <p role="status" className="mb-2 min-h-5 text-sm text-muted-foreground">
          {inFlight}
        </p>
        <p id="issue-units-heading" className="font-medium">
          {unitReferences.length === 1 ? "Unit being issued" : `${unitReferences.length} units being issued`}
        </p>
        <ul aria-labelledby="issue-units-heading" className="mt-2 list-disc pl-5">
          {unitReferences.map((reference) => (
            <li key={reference} className="wrap-break-word">
              {reference}
            </li>
          ))}
        </ul>
      </ConfirmDialog>

      <Dialog
        open={declineOpen}
        onOpenChange={changeDeclineOpen}
        title="Decline this request?"
        description={`${request.hospital.name} will see your reason. No units are reserved.`}
      >
        <Formik<DeclineValues> initialValues={{ reason: "" }} validationSchema={declineSchema} onSubmit={decline}>
          <Form noValidate className="flex flex-col gap-4">
            {declineIssues && <FormAlert error={declineIssues.error} issues={declineIssues.issues} />}
            <FormikTextarea
              name="reason"
              label="Reason"
              maxLength={DECLINE_REASON_MAX}
              hint="For example: no matching units until Friday."
              required
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" className="min-h-11" disabled={declining} onClick={() => changeDeclineOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" className="min-h-11" loading={declining}>
                Decline request
              </Button>
            </div>
          </Form>
        </Formik>
      </Dialog>
    </>
  );
}

function DetailList({ details }: { details: { term: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {details.map(({ term, value }) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="min-w-0 wrap-break-word font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

type Outcome = { title: string; body: string; border: string };

// What each closed state means, in plain words. DECLINED's body is the bank's reason instead.
const OUTCOMES: Partial<Record<RequestState, Outcome>> = {
  DECLINED: { title: "Reason for declining", body: "The bank did not give a reason.", border: "border-l-(--color-danger)" },
  LAPSED: {
    title: "Hold lapsed",
    body: "The hold ended before the units were issued. They have returned to stock. The hospital can make a new request.",
    border: "border-l-(--color-warning)",
  },
  UNIT_EXPIRED: {
    title: "A reserved unit expired",
    body: "A reserved unit passed its expiry date before it was issued, so this request was closed. Expired blood is never issued. The hospital can make a new request.",
    border: "border-l-(--color-danger)",
  },
  CANCELLED: {
    title: "Request cancelled",
    body: "The hospital cancelled this request. Any units held for it have returned to stock, or are marked expired if past their expiry date.",
    border: "border-l-(--color-border-input)",
  },
  FULFILLED: {
    title: "Request fulfilled",
    body: "Every reserved unit has been issued to the hospital.",
    border: "border-l-(--color-success)",
  },
};

function OutcomeBanner({ request }: { request: BloodRequest }) {
  const outcome = OUTCOMES[request.state];
  if (!outcome) return null;
  const body = (request.state === "DECLINED" && request.declineReason) || outcome.body;
  return (
    <div
      className={cn(
        "mt-4 rounded-md border border-l-4 border-border bg-surface p-4 text-sm",
        outcome.border,
      )}
    >
      <h3 className="font-semibold">{outcome.title}</h3>
      <p className="mt-1 whitespace-pre-line wrap-break-word">{body}</p>
    </div>
  );
}

function HoldCell({ reservation, now }: { reservation: Reservation; now: number }) {
  const left = durationLabel(Date.parse(reservation.holdExpiresAt) - now);
  if (reservation.status === "ACTIVE" && left) {
    return (
      <>
        <span className="font-medium whitespace-nowrap">Hold ends in {left}</span>
        <span className="block text-muted-foreground">
          at <time dateTime={reservation.holdExpiresAt}>{holdTimeLabel(reservation.holdExpiresAt)}</time>
        </span>
      </>
    );
  }
  return (
    <time dateTime={reservation.holdExpiresAt}>
      Held until {holdTimeLabel(reservation.holdExpiresAt)}
    </time>
  );
}

function Reservations({
  reservations,
  now,
  linkUnits,
}: {
  reservations: Reservation[];
  now: number;
  /** Bank staff and the administrator can open a unit; the hospital can't (GET /units/{id} is 403). */
  linkUnits: boolean;
}) {
  return (
    <section aria-labelledby="reservations-heading" className="mt-8">
      <h2 id="reservations-heading" className="text-lg font-semibold">
        Reserved units
      </h2>
      <div className="mt-3 overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Units reserved for this request</caption>
          <thead className="bg-(--color-surface-sunken)">
            <tr>
              {["Unit", "Unit expires", "Status", "Hold"].map((heading) => (
                <th key={heading} scope="col" className="px-4 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reservations.map((reservation) => (
              <tr key={reservation.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium wrap-break-word">
                  {linkUnits ? (
                    <Link to={`/units/${encodeURIComponent(reservation.unit.id)}`} className={backLink}>
                      {reservation.unit.reference}
                    </Link>
                  ) : (
                    reservation.unit.reference
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(reservation.unit.expiryDate)}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={RESERVATION_STATUS_TONES[reservation.status]}>
                    {RESERVATION_STATUS_LABELS[reservation.status]}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <HoldCell reservation={reservation} now={now} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

