// RequestsPage (/requests): blood requests, newest first. Hospital staff, bank staff, administrator.
//
// - The service decides what each user sees: a hospital its own requests, a bank the ones
//   addressed to it, the administrator all of them.
// - The state filter and the page number live in the URL (?state=PENDING&page=2), like UnitsPage.
//   Values from the URL are checked against the label maps; anything unknown is ignored.
// - Each row names the other party (the bank for hospital staff, the hospital for bank staff,
//   both for the administrator) and links to /requests/:requestId.
// - States: loading, error (+ Retry), empty (per role / no matches), list.
// - Wide screens get a table; phones get stacked cards. Both read from the same data.
// - "Hold ends" counts down to the soonest running hold, and turns to a warning under an hour
//   (lib/holds HOLD_SOON_MS). When a hold passes, the row shows it lapsed straight away and the
//   list reloads once, quietly: the rows stay on screen instead of the loading skeleton.

import { Clock } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../api/endpoints";
import type { BloodRequest, BloodRequestPage, Role } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { RequestStateBadge } from "../components/RequestStateBadge";
import { UrgencyLabel } from "../components/UrgencyLabel";
import { UrlFilterSelect } from "../components/UrlFilterSelect";
import { useAsync, type AsyncResult } from "../hooks/useAsync";
import { useHoldClock } from "../hooks/useHoldClock";
import { HOLD_SOON_MS, nextHoldEnd, withPassedHolds } from "../lib/holds";
import {
  durationLabel,
  formatDateTime,
  isKeyOf,
  REQUEST_STATE_LABELS,
  REQUEST_STATE_OPTIONS,
  requestItemLabel,
  timeAgo,
} from "../lib/labels";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { EmptyState } from "../shared/ui/empty-state";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";

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

export default function RequestsPage() {
  const { role } = useAuth();
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
  const now = useHoldClock(requests.data?.items.flatMap((r) => r.reservations) ?? [], () => {
    setQuietReload({ from: requests.data, state, page });
    requests.reload();
  });

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
          now={now}
          role={role}
          hasFilter={state !== undefined}
          onFindBlood={() => navigate("/availability")}
          onClearFilter={clearFilter}
          onPage={goToPage}
        />
      </section>
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
  now,
  role,
  hasFilter,
  onFindBlood,
  onClearFilter,
  onPage,
}: {
  requests: AsyncResult<BloodRequestPage>;
  refreshing: boolean;
  now: number;
  role: Role | null;
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
  const items = data.items.map((request) => withPassedHolds(request, now));

  return (
    <>
      <RequestTable requests={items} role={role} now={now} />
      <RequestCards requests={items} role={role} now={now} />

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

function CreatedAgo({ createdAt }: { createdAt: string }) {
  return <time dateTime={createdAt}>{timeAgo(createdAt) || formatDateTime(createdAt)}</time>;
}

/** "in 1h 12m" to the soonest running hold; a warning with a clock under an hour; a dash with none. */
function HoldEnds({ request, now }: { request: BloodRequest; now: number }) {
  const end = nextHoldEnd(request.reservations, now);
  if (end === null) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">No hold running</span>
      </span>
    );
  }
  const left = end - now;
  const soon = left < HOLD_SOON_MS;
  return (
    <time
      dateTime={new Date(end).toISOString()}
      className={cn("inline-flex items-center gap-1 tabular-nums", soon && "font-medium text-warning")}
    >
      {soon && <Clock aria-hidden="true" className="size-3.5 shrink-0" />}
      {soon && <span className="sr-only">Ends soon: </span>}
      in {durationLabel(left)}
    </time>
  );
}

/** md and up. Emergency rows get a thin crimson rule on the left edge; the row itself stays white. */
function RequestTable({ requests, role, now }: { requests: BloodRequest[]; role: Role | null; now: number }) {
  const headings = ["Reference", otherPartyHeading(role), "Blood", "Urgency", "Needed by", "State", "Hold ends", "Created"];
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
              <td className="px-4 py-3 whitespace-nowrap">
                <HoldEnds request={request} now={now} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                <CreatedAgo createdAt={request.createdAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Below md: one card per request; the heading is the link. Emergency cards get the same crimson left rule. */
function RequestCards({ requests, role, now }: { requests: BloodRequest[]; role: Role | null; now: number }) {
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
            {nextHoldEnd(request.reservations, now) !== null && (
              <>
                <dt className="text-muted-foreground">Hold ends</dt>
                <dd>
                  <HoldEnds request={request} now={now} />
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Created</dt>
            <dd className="text-muted-foreground tabular-nums">
              <CreatedAgo createdAt={request.createdAt} />
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
