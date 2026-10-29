// RequestsPage (/requests): blood requests, newest first. Hospital staff, bank staff, administrator.
//
// Cancel is this app's one optimistic update (lib/optimisticCancel): it is the hospital's own
// request, it is low risk (a refusal changes nothing on the service), and it is easy to undo on
// screen (the row we showed before is still underneath). Every other action waits for the service.
//
// - Hospital staff get a Cancel button on each of their own open requests (canCancel). Same dialog
//   and outcomes as RequestDetailPage: the row reads CANCELLED at once; a refusal puts it back and
//   reports it here and in an error Toast with "Reload" (and reloads the list after 409 / 403 /
//   404); a 422 reopens the dialog with the reason as typed; a lost connection keeps CANCELLED
//   until a reload answers, then says what the request shows. Reloads here are quiet: rows stay up.
// - Mock only: MockControls can show every row in a simulated state, so Cancel can be tried.
// - The service decides what each user sees: a hospital its own requests, a bank the ones
//   addressed to it, the administrator all of them.
// - The state filter and the page number live in the URL (?state=PENDING&page=2), like UnitsPage.
//   Values from the URL are checked against the label maps; anything unknown is ignored.
// - Each row names the other party (the bank for hospital staff, the hospital for bank staff,
//   both for the administrator) and links to /requests/:requestId.
// - States: loading, error (+ Retry), empty (per role / no matches), list.
// - Wide screens get a table; phones get stacked cards. Both read from the same data.
// - When a hold passes, the row shows it lapsed straight away and the list reloads once, quietly:
//   the rows stay on screen instead of the loading skeleton.
// - No "Hold ends" column for now: the backend doesn't send hold end times yet.

import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { IS_MOCK, toApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { BloodRequest, BloodRequestPage, Role } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { CancelRequestDialog, cancelReopened, type CancelReopened } from "../components/CancelRequestDialog";
import { MockControls } from "../components/MockControls";
import { RequestStateBadge } from "../components/RequestStateBadge";
import { ResultAlert, type Notice } from "../components/ResultAlert";
import { UrgencyLabel } from "../components/UrgencyLabel";
import { UrlFilterSelect } from "../components/UrlFilterSelect";
import { useAsync, type AsyncResult } from "../hooks/useAsync";
import { useHoldClock } from "../hooks/useHoldClock";
import { withPassedHolds } from "../lib/holds";
import {
  formatDateTime,
  isKeyOf,
  REQUEST_STATE_LABELS,
  REQUEST_STATE_OPTIONS,
  requestItemLabel,
  timeAgo,
} from "../lib/labels";
import { simulateRequest, type SimulatedState } from "../lib/mockSimulation";
import {
  cancelOutcome,
  endCancel,
  NO_CANCELS,
  reloadsAfterRefusal,
  startCancel,
  withCancels,
  type CancelOverlay,
} from "../lib/optimisticCancel";
import { canCancel, unconfirmedMessage, viewerOf } from "../lib/requestActions";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { EmptyState } from "../shared/ui/empty-state";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";
import { useToast } from "../shared/ui/toast";

const PAGE_SIZE = 20;

/** ?page is 0-based like the API. Missing or invalid → 0. */
function readPage(params: URLSearchParams): number {
  const page = Number(params.get("page"));
  return Number.isInteger(page) && page > 0 ? page : 0;
}

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const primaryLink = cn(
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium",
  "bg-(--color-primary) text-(--color-on-primary) hover:bg-(--color-primary-hover)",
  focusRing,
);

const rowLink = cn(
  "inline-flex min-h-11 items-center rounded-sm font-medium wrap-break-word text-(--color-primary) underline underline-offset-2",
  focusRing,
);

/** Column heading for the other party, by role. */
function otherPartyHeading(role: Role | null): string {
  if (role === "HOSPITAL_STAFF") return "Bank";
  if (role === "BANK_STAFF") return "Hospital";
  return "Hospital → bank";
}

function otherParty(role: Role | null, request: BloodRequest): string {
  if (role === "HOSPITAL_STAFF") return request.bank.name;
  if (role === "BANK_STAFF") return request.hospital.name;
  return `${request.hospital.name} → ${request.bank.name}`;
}

function detailPath(request: BloodRequest): string {
  return `/requests/${encodeURIComponent(request.id)}`;
}

/** The Cancel button's state for each row, worked out once by the page. */
type RowCancel = {
  /** Rows that get the button: the hospital's own open requests, and any being cancelled. */
  offered: (request: BloodRequest) => boolean;
  cancelling: (request: BloodRequest) => boolean;
  disabled: boolean;
  onCancel: (request: BloodRequest) => void;
};

export default function RequestsPage() {
  const { role, session } = useAuth();
  const viewer = viewerOf(session);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isHospital = role === "HOSPITAL_STAFF";

  const stateParam = searchParams.get("state");
  const state = isKeyOf(REQUEST_STATE_LABELS, stateParam) ? stateParam : undefined;
  const page = readPage(searchParams);

  const requests = useAsync(
    (signal) => api.listRequests({ state, page, size: PAGE_SIZE }, signal).then((res) => res.data),
    [state, page],
  );

  // The list a hold-passed reload started from. While that reload runs, the rows stay up.
  const [quietReload, setQuietReload] = useState<{ from: BloodRequestPage | null; state?: string; page: number } | null>(
    null,
  );
  const refreshing =
    requests.loading &&
    quietReload !== null &&
    quietReload.from === requests.data &&
    quietReload.state === state &&
    quietReload.page === page;
  /** Reload with the rows kept on screen. */
  function reloadQuietly() {
    setQuietReload({ from: requests.data, state, page });
    requests.reload();
  }

  const [notice, setNotice] = useState<Notice | null>(null);
  // Mock only: the state to show every row in, and when it was picked (dates count from then).
  const [simulated, setSimulated] = useState<{ state: SimulatedState; at: number } | null>(null);
  // Rows a confirmed cancel sent back, over the list they replaced (dropped once a reload comes in).
  const [sentBack, setSentBack] = useState<{ rows: Record<string, BloodRequest>; over: BloodRequestPage | null }>({
    rows: {},
    over: null,
  });
  // The optimistic cancel: ids of the rows shown CANCELLED while the service hasn't confirmed.
  const [cancels, setCancels] = useState<CancelOverlay>(NO_CANCELS);
  const [cancelTarget, setCancelTarget] = useState<BloodRequest | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelRefusedReason, setCancelRefusedReason] = useState<CancelReopened | null>(null);
  const [inFlight, setInFlight] = useState<string | null>(null);
  // After a lost connection: the list we had when the reload started, and the row being cancelled.
  const [unconfirmed, setUnconfirmed] = useState<{ from: BloodRequestPage | null; request: BloodRequest } | null>(
    null,
  );

  const sentBackRows = sentBack.over === requests.data ? sentBack.rows : {};
  const loadedRows = (requests.data?.items ?? []).map((r) => {
    const row = sentBackRows[r.id] ?? r;
    return IS_MOCK && simulated ? simulateRequest(row, simulated.state, simulated.at) : row;
  });
  const now = useHoldClock(
    loadedRows.flatMap((r) => r.reservations),
    reloadQuietly,
  );
  // As the service last told us, and as the screen shows them (CANCELLED while unconfirmed).
  const confirmedRows = loadedRows.map((r) => withPassedHolds(r, now));
  const rows = confirmedRows.map((r) => withCancels(r, cancels));

  // After a lost connection, once the reload has answered, say what the request shows now.
  if (unconfirmed && !requests.loading && (requests.data !== unconfirmed.from || requests.error)) {
    const { request } = unconfirmed;
    setUnconfirmed(null);
    setCancels((overlay) => endCancel(overlay, request.id));
    const found = requests.error ? undefined : confirmedRows.find((r) => r.id === request.id);
    setNotice({
      tone: "info",
      message: found
        ? unconfirmedMessage(found.state, `Request ${request.reference}`)
        : requests.error
          ? unconfirmedMessage(null)
          : `We couldn't confirm. Request ${request.reference} is no longer in this list; open it to see where it stands.`,
    });
  }

  /** Mock only: a "Simulate state" choice. Its dates count from the moment it is picked. */
  function pickSimulation(next: SimulatedState | null) {
    setSimulated(next && { state: next, at: Date.now() });
  }

  function openCancel(request: BloodRequest) {
    setCancelTarget(request);
    setCancelRefusedReason(null);
    setCancelOpen(true);
  }

  // Optimistic: closes the dialog and shows the row CANCELLED before the service answers.
  async function cancel(request: BloodRequest, reason: string) {
    setCancelOpen(false);
    setNotice(null);
    setCancels((overlay) => startCancel(overlay, request.id));
    setInFlight(`Cancelling request ${request.reference}…`);
    try {
      const res = await api.cancelRequest(request.id, { reason });
      setCancels((overlay) => endCancel(overlay, request.id));
      // Once the write has answered, show what the service (or Prism) sent: the simulation ends.
      setSimulated(null);
      setSentBack((prev) => ({
        rows: { ...(prev.over === requests.data ? prev.rows : {}), [request.id]: res.data },
        over: requests.data,
      }));
      setNotice({ tone: "success", message: `Request ${request.reference} cancelled. Any units held for it are back in stock.` });
    } catch (e) {
      const error = toApiError(e);
      if (cancelOutcome(error) === "await-reload") {
        // We can't tell whether it happened: CANCELLED stays until the reload answers. No retry.
        setSimulated(null);
        setUnconfirmed({ from: requests.data, request });
        reloadQuietly();
        return;
      }
      setCancels((overlay) => endCancel(overlay, request.id)); // rollback
      if (error.code === "VALIDATION_FAILED") {
        setCancelRefusedReason(cancelReopened(reason, error));
        setCancelOpen(true);
        return;
      }
      // The simulated state (mock) stays, so the row is put back exactly as it was shown.
      setNotice({ tone: "error", error });
      toast({
        variant: "error",
        title: `Cancellation of ${request.reference} undone`,
        description: `${error.message} Reference: ${error.requestId}`,
        action: { label: "Reload", onClick: reloadQuietly },
      });
      if (reloadsAfterRefusal(error)) reloadQuietly();
    } finally {
      setInFlight(null);
    }
  }

  const rowCancel: RowCancel = {
    offered: (request) => cancels.has(request.id) || canCancel(request, viewer),
    cancelling: (request) => cancels.has(request.id),
    disabled: requests.loading || inFlight !== null,
    onCancel: openCancel,
  };
  const statusLine =
    inFlight ?? (unconfirmed ? "We couldn't confirm. Checking the latest state…" : refreshing ? "Checking the latest state…" : "");

  function clearFilter() {
    setSearchParams({});
  }

  function goToPage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextPage > 0) next.set("page", String(nextPage));
      else next.delete("page");
      return next;
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
        {isHospital && (
          <Link to="/availability" className={primaryLink}>
            Find blood
          </Link>
        )}
      </div>
      <p className="mt-2 text-muted-foreground">Newest first.</p>
      {/* What is in flight, or that the list is being checked again. Always rendered, so it is announced. */}
      <p role="status" className="mt-1 min-h-5 text-sm text-muted-foreground">
        {statusLine}
      </p>

      {notice && <ResultAlert notice={notice} className="mt-4" />}

      <MockControls className="mt-4" simulation={{ value: simulated?.state ?? null, onChange: pickSimulation }} />

      <section aria-labelledby="request-filters-heading" className="mt-6">
        <h2 id="request-filters-heading" className="sr-only">
          Filters
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UrlFilterSelect label="State" param="state" anyLabel="All states" options={REQUEST_STATE_OPTIONS} />
        </div>
        <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* Always rendered: a live region must exist before its text changes to be announced. */}
          <p aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">
            {requests.data && (!requests.loading || refreshing) ? showingMessage(requests.data) : ""}
          </p>
          {state && (
            <Button variant="ghost" className="min-h-11" onClick={clearFilter}>
              Clear filter
            </Button>
          )}
        </div>
      </section>

      <section aria-labelledby="request-results-heading" aria-busy={requests.loading || undefined} className="mt-4">
        <h2 id="request-results-heading" className="sr-only">
          Results
        </h2>
        <Results
          requests={requests}
          refreshing={refreshing}
          rows={rows}
          role={role}
          rowCancel={isHospital ? rowCancel : null}
          hasFilter={state !== undefined}
          onFindBlood={() => navigate("/availability")}
          onClearFilter={clearFilter}
          onPage={goToPage}
        />
      </section>

      <CancelRequestDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        request={cancelTarget}
        reopened={cancelRefusedReason}
        onCancel={(reason) => {
          if (cancelTarget) void cancel(cancelTarget, reason);
        }}
      />
    </>
  );
}

function showingMessage(data: BloodRequestPage): string {
  if (data.totalItems === 0 || data.items.length === 0) return "No requests to show.";
  const from = data.page * data.size + 1;
  const to = data.page * data.size + data.items.length;
  return `Showing ${from}–${to} of ${data.totalItems}`;
}

function Results({
  requests,
  refreshing,
  rows,
  role,
  rowCancel,
  hasFilter,
  onFindBlood,
  onClearFilter,
  onPage,
}: {
  requests: AsyncResult<BloodRequestPage>;
  refreshing: boolean;
  /** The page's items as the screen shows them (holds passed, cancels in flight). */
  rows: BloodRequest[];
  role: Role | null;
  /** Hospital staff only; null hides the Cancel buttons. */
  rowCancel: RowCancel | null;
  hasFilter: boolean;
  onFindBlood: () => void;
  onClearFilter: () => void;
  onPage: (page: number) => void;
}) {
  if (requests.loading && !refreshing) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm font-medium">
          Loading requests…
        </p>
        <Skeleton lines={6} />
      </div>
    );
  }

  if (requests.error) {
    return (
      <ErrorState
        // ErrorState takes strings only; pre-line puts the Reference on its own line.
        className="whitespace-pre-line"
        title="We couldn't load the requests"
        description={`${requests.error.message}\nReference: ${requests.error.requestId}`}
        onRetry={requests.reload}
      />
    );
  }

  const data = requests.data;
  if (!data) return null;

  if (data.items.length === 0) {
    if (data.totalItems > 0) {
      // ?page points past the end (e.g. an old link).
      return (
        <EmptyState
          title="This page is empty"
          description={`There are ${data.totalItems} requests, but none on this page.`}
          action={{ label: "Go to the first page", onClick: () => onPage(0) }}
        />
      );
    }
    if (hasFilter) {
      return (
        <EmptyState
          title="No requests in this state"
          description="Choose a different state, or clear the filter to see every request."
          action={{ label: "Clear filter", onClick: onClearFilter }}
        />
      );
    }
    if (role === "BANK_STAFF") {
      return (
        <EmptyState
          title="No requests addressed to your bank"
          description="When a hospital asks your bank for blood, the request shows here for you to approve or decline."
        />
      );
    }
    if (role === "HOSPITAL_STAFF") {
      return (
        <EmptyState
          title="No requests yet"
          description="Find a bank that holds the blood you need, then send it a request."
          action={{ label: "Find blood", onClick: onFindBlood }}
        />
      );
    }
    return <EmptyState title="No requests yet" description="No hospital has sent a request yet." />;
  }

  const lastPage = Math.max(0, Math.ceil(data.totalItems / data.size) - 1);
  return (
    <>
      <RequestTable requests={rows} role={role} rowCancel={rowCancel} />
      <RequestCards requests={rows} role={role} rowCancel={rowCancel} />

      <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" className="min-h-11" disabled={data.page <= 0} onClick={() => onPage(data.page - 1)}>
          Previous
        </Button>
        <p className="text-sm text-muted-foreground">
          Page {data.page + 1} of {lastPage + 1}
        </p>
        <Button
          variant="secondary"
          className="min-h-11"
          disabled={data.page >= lastPage}
          onClick={() => onPage(data.page + 1)}
        >
          Next
        </Button>
      </nav>
    </>
  );
}

/**
 * "Cancel" on a row, named for its request ("Cancel request REQ-…") so each button is unique.
 * The name starts with the visible word, so voice control users can say "Cancel".
 */
function RowCancelButton({ request, rowCancel }: { request: BloodRequest; rowCancel: RowCancel }) {
  if (!rowCancel.offered(request)) return null;
  const cancelling = rowCancel.cancelling(request);
  return (
    <Button
      variant="secondary"
      className="min-h-11"
      loading={cancelling}
      disabled={rowCancel.disabled && !cancelling}
      onClick={() => rowCancel.onCancel(request)}
      aria-label={`Cancel request ${request.reference}`}
    >
      Cancel
    </Button>
  );
}

function CreatedAgo({ createdAt }: { createdAt: string }) {
  return <time dateTime={createdAt}>{timeAgo(createdAt) || formatDateTime(createdAt)}</time>;
}

/** md and up. Emergency rows get a thin crimson rule on the left edge; the row itself stays white. */
function RequestTable({
  requests,
  role,
  rowCancel,
}: {
  requests: BloodRequest[];
  role: Role | null;
  rowCancel: RowCancel | null;
}) {
  const headings = ["Reference", otherPartyHeading(role), "Blood", "Urgency", "Needed by", "State", "Created"];
  if (rowCancel) headings.push("Actions");
  return (
    <div className="hidden overflow-x-auto rounded-md border border-border bg-surface md:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Requests, newest first. Open a reference to see the request.</caption>
        <thead className="border-b border-border bg-(--color-surface-sunken)">
          <tr>
            {headings.map((heading) => (
              <th
                key={heading}
                scope="col"
                // The first column carries the same 2px left edge as the rows, so headings line up.
                className="px-4 py-2.5 text-xs font-semibold text-muted-foreground first:border-l-2 first:border-l-transparent"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {requests.map((request) => (
            <tr key={request.id} className="transition-colors hover:bg-(--color-surface-sunken)">
              <td
                className={cn(
                  "border-l-2 px-4 py-1",
                  request.urgency === "EMERGENCY" ? "border-l-brand-accent" : "border-l-transparent",
                )}
              >
                <Link to={detailPath(request)} className={rowLink}>
                  {request.reference}
                </Link>
              </td>
              <td className="px-4 py-3 wrap-break-word">{otherParty(role, request)}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {requestItemLabel(request.bloodGroup, request.rhesus, request.component, request.quantity)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <UrgencyLabel urgency={request.urgency} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatDateTime(request.neededBy)}</td>
              <td className="px-4 py-3">
                <RequestStateBadge state={request.state} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                <CreatedAgo createdAt={request.createdAt} />
              </td>
              {rowCancel && (
                <td className="px-4 py-1">
                  <RowCancelButton request={request} rowCancel={rowCancel} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Below md: one card per request; the heading is the link. Emergency cards get the same crimson left rule. */
function RequestCards({
  requests,
  role,
  rowCancel,
}: {
  requests: BloodRequest[];
  role: Role | null;
  rowCancel: RowCancel | null;
}) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {requests.map((request) => (
        <li
          key={request.id}
          className={cn(
            "rounded-md border border-border bg-surface p-4",
            request.urgency === "EMERGENCY" && "border-l-2 border-l-brand-accent",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0">
              <Link to={detailPath(request)} className={rowLink}>
                {request.reference}
              </Link>
            </h3>
            <RequestStateBadge state={request.state} className="mt-3 text-sm" />
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{otherPartyHeading(role)}</dt>
            <dd className="min-w-0 wrap-break-word">{otherParty(role, request)}</dd>
            <dt className="text-muted-foreground">Blood</dt>
            <dd>{requestItemLabel(request.bloodGroup, request.rhesus, request.component, request.quantity)}</dd>
            <dt className="text-muted-foreground">Urgency</dt>
            <dd><UrgencyLabel urgency={request.urgency} /></dd>
            <dt className="text-muted-foreground">Needed by</dt>
            <dd className="tabular-nums">{formatDateTime(request.neededBy)}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="text-muted-foreground tabular-nums">
              <CreatedAgo createdAt={request.createdAt} />
            </dd>
          </dl>
          {rowCancel && rowCancel.offered(request) && (
            <div className="mt-3">
              <RowCancelButton request={request} rowCancel={rowCancel} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
