// RequestDetailPage (/requests/:requestId): one request, its reserved units and its history.
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
// - While an action is in flight, the status line under the heading says so ("Recording issue…"),
//   because the busy button only shows a spinner.
// - Issue is not idempotent and takes no Idempotency-Key yet. On TIMEOUT or NETWORK_ERROR we
//   neither say "failed" nor retry: we reload, then say what the request shows now
//   ("We couldn't confirm. The request now shows as Fulfilled.").
// - 409 (UNITS_NO_LONGER_AVAILABLE, REQUEST_NOT_PENDING), 404 or a lost connection: the alert
//   shows the service's message, the dialog closes and the request is loaded again. After a 409
//   our copy is out of date (someone else decided it, or the units went), and after a lost
//   connection we can't tell whether the action happened, so only a fresh GET shows the truth.
// - The result shows in ResultAlert (components/ResultAlert): role="status" for success,
//   role="alert" for an error. Focus moves to it after each action.
// - Mock only: Prism always answers APPROVED, so a checkbox can treat the request as PENDING
//   to try the buttons. It never renders on the live API (IS_MOCK is false there).
// - Active holds count down ("Hold ends in 1h 12m"). The moment a hold passes we show it as
//   lapsed ourselves (the service does the same at read time), and if no unit is left on hold
//   or issued the request shows as LAPSED too. Then we reload once, quietly, to pick up what the
//   service recorded. A hold that is already past on arrival is shown lapsed but not reloaded
//   for, so a clock that runs ahead of the service's can't cause a reload loop.
// - Closed states (DECLINED, LAPSED, UNIT_EXPIRED, CANCELLED, FULFILLED) each get a banner
//   saying in plain words what happened.

import { Form, Formik, type FormikHelpers } from "formik";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import * as Yup from "yup";
import { IS_MOCK, toApiError, type ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { BloodRequest, FieldIssue, HistoryEntry, RequestState, Reservation } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { applyApiError } from "../components/form/applyApiError";
import { FormAlert } from "../components/form/FormAlert";
import { FormikTextarea } from "../components/form/FormikTextarea";
import { RequestStateBadge } from "../components/RequestStateBadge";
import { ResultAlert, type Notice } from "../components/ResultAlert";
import { UrgencyLabel } from "../components/UrgencyLabel";
import { useAsync } from "../hooks/useAsync";
import { useHoldClock } from "../hooks/useHoldClock";
import { withPassedHolds } from "../lib/holds";
import {
  bloodTypeLabel,
  COMPONENT_LABELS,
  durationLabel,
  formatDate,
  formatDateTime,
  formatTime,
  historyEventLabel,
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_TONES,
  timeAgo,
} from "../lib/labels";
import {
  actsForBank,
  canDecide,
  canIssue,
  expiredHeldUnits,
  expiredUnitsMessage,
  issuedUnitReferences,
  unconfirmedMessage,
  viewerOf,
} from "../lib/requestActions";
import { DECLINE_REASON_MAX, declineReason } from "../lib/validation";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { Checkbox } from "../shared/ui/checkbox";
import { ConfirmDialog, Dialog } from "../shared/ui/dialog";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";
import { StatusBadge } from "../shared/ui/status-badge";

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

/** "14:00" today, "27 Oct 2026, 14:00" on any other day. */
function holdTimeLabel(isoDateTime: string, now: Date = new Date()): string {
  const time = new Date(isoDateTime);
  if (Number.isNaN(time.getTime())) return isoDateTime;
  return time.toDateString() === now.toDateString() ? formatTime(isoDateTime) : formatDateTime(isoDateTime);
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

export default function RequestDetailPage() {
  const { requestId = "" } = useParams();
  // A new id starts with fresh state: no leftover alert, override or open dialog.
  return <RequestDetail key={requestId} requestId={requestId} />;
}

function RequestDetail({ requestId }: { requestId: string }) {
  const { session } = useAuth();
  const viewer = viewerOf(session);

  const loaded = useAsync((signal) => api.getRequest(requestId, signal).then((res) => res.data), [requestId]);
  // The request an action sent back, and the loaded copy it replaced. It wins until a reload
  // brings a newer copy, so a quiet reload never flashes back to the state before the action.
  const [updated, setUpdatedState] = useState<{ request: BloodRequest; over: BloodRequest | null } | null>(null);
  const setUpdated = (next: BloodRequest | null) =>
    setUpdatedState(next && { request: next, over: loaded.data });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [simulatePending, setSimulatePending] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineIssues, setDeclineIssues] = useState<{ error: ApiError; issues: FieldIssue[] } | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  // What is in flight, for the status line ("Recording issue…"). Null when nothing is.
  const [inFlight, setInFlight] = useState<string | null>(null);
  // Set after a lost connection: the copy we had when the reload started.
  const [unconfirmed, setUnconfirmed] = useState<{ from: BloodRequest | null } | null>(null);

  const fetched = updated && updated.over === loaded.data ? updated.request : loaded.data;
  const now = useHoldClock(fetched?.reservations ?? [], loaded.reload);
  const current = fetched && withPassedHolds(fetched, now);
  const request: BloodRequest | null =
    current && IS_MOCK && simulatePending ? { ...current, state: "PENDING" } : current;

  // After a lost connection, once the reload has answered, say what the request shows now.
  if (unconfirmed && !loaded.loading && (loaded.data !== unconfirmed.from || loaded.error)) {
    setUnconfirmed(null);
    setNotice({ tone: "info", message: unconfirmedMessage(loaded.error ? null : (current?.state ?? null)) });
  }

  function succeeded(next: BloodRequest, message: string) {
    setUpdated(next);
    setSimulatePending(false);
    setNotice({ tone: "success", message });
  }

  /** Show the error; reload when our copy may no longer be true. */
  function failed(error: ApiError) {
    setSimulatePending(false);
    setNotice({ tone: "error", error });
    if (error.status === 409 || error.status === 404 || error.isConnectionProblem) {
      setUpdated(null);
      loaded.reload();
    }
  }

  /** A lost connection: we can't tell whether it happened. No "failed", no retry: reload and report. */
  function checkAfterLostConnection() {
    setSimulatePending(false);
    setNotice(null);
    setUpdated(null);
    setUnconfirmed({ from: loaded.data });
    loaded.reload();
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
  const expiredUnits =
    request.state === "APPROVED" && actsForBank(request, viewer) ? expiredHeldUnits(request, now) : [];
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

      {IS_MOCK && actsForBank(request, viewer) && (
        <div className="mt-4 rounded-md border border-dashed border-input p-3">
          <Checkbox
            label="Simulate pending state (mock only)"
            description="The mock always answers APPROVED. Tick this to try Approve and Decline."
            checked={simulatePending}
            onCheckedChange={setSimulatePending}
            className="min-h-11 items-center"
          />
        </div>
      )}

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
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button className="min-h-11" disabled={busy} onClick={() => setApproveOpen(true)}>
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

      {request.reservations.length > 0 && <Reservations reservations={request.reservations} now={now} />}

      <History history={request.history} />

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Approve this request?"
        description={`Reserve ${unitsLabel(request.quantity)} of ${what}? If fewer are free, nothing is reserved.`}
        confirmLabel="Approve and reserve"
        onConfirm={approve}
      />

      <ConfirmDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        title="Record these units as issued?"
        description={`Only once they have left the bank for ${request.hospital.name}. The request becomes fulfilled.`}
        confirmLabel="Record as issued"
        onConfirm={() => issue(unitReferences)}
      >
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
    body: "The hold ended before the units were issued. They have returned to stock.",
    border: "border-l-(--color-warning)",
  },
  UNIT_EXPIRED: {
    title: "A reserved unit expired",
    body: "A reserved unit passed its expiry date before it was issued, so this request was closed. Expired blood is never issued. Send a new request if blood is still needed.",
    border: "border-l-(--color-danger)",
  },
  CANCELLED: {
    title: "Request cancelled",
    body: "The hospital cancelled this request. Any units held for it have returned to stock.",
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

function Reservations({ reservations, now }: { reservations: Reservation[]; now: number }) {
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
                <td className="px-4 py-3 font-medium wrap-break-word">{reservation.unit.reference}</td>
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

function History({ history }: { history: HistoryEntry[] }) {
  // The contract says oldest first; sort anyway so the timeline never reads backwards.
  const entries = [...history].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <section aria-labelledby="history-heading" className="mt-8">
      <h2 id="history-heading" className="text-lg font-semibold">
        History
      </h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing has happened yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-4 border-l-2 border-border pl-4">
          {entries.map((entry, i) => (
            <li key={`${entry.at}-${entry.event}-${i}`} className="relative text-sm">
              <span
                aria-hidden="true"
                className="absolute top-1.5 -left-5.25 size-2 rounded-full bg-muted-foreground"
              />
              <p className="font-medium">{historyEventLabel(entry.event)}</p>
              <p className="text-muted-foreground">
                <time dateTime={entry.at}>{formatDateTime(entry.at)}</time> · {entry.actor}
              </p>
              {entry.note && <p className="mt-1 whitespace-pre-line wrap-break-word">{entry.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
