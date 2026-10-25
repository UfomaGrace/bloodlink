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

import { Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../api/endpoints";
import type { BloodRequest, BloodRequestPage, Role } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { RequestStateBadge } from "../components/RequestStateBadge";
import { UrlFilterSelect } from "../components/UrlFilterSelect";
import { useAsync, type AsyncResult } from "../hooks/useAsync";
import {
  formatDateTime,
  isKeyOf,
  REQUEST_STATE_LABELS,
  REQUEST_STATE_OPTIONS,
  requestItemLabel,
  timeAgo,
  URGENCY_LABELS,
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
      <p className="mt-2 text-(--color-text-muted)">Newest first.</p>

      <section aria-labelledby="request-filters-heading" className="mt-6">
        <h2 id="request-filters-heading" className="sr-only">
          Filters
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UrlFilterSelect label="State" param="state" anyLabel="All states" options={REQUEST_STATE_OPTIONS} />
        </div>
        <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* Always rendered: a live region must exist before its text changes to be announced. */}
          <p aria-live="polite" aria-atomic="true" className="text-sm text-(--color-text-muted)">
            {requests.data && !requests.loading ? showingMessage(requests.data) : ""}
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
  role,
  hasFilter,
  onFindBlood,
  onClearFilter,
  onPage,
}: {
  requests: AsyncResult<BloodRequestPage>;
  role: Role | null;
  hasFilter: boolean;
  onFindBlood: () => void;
  onClearFilter: () => void;
  onPage: (page: number) => void;
}) {
  if (requests.loading) {
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
      <RequestTable requests={data.items} role={role} />
      <RequestCards requests={data.items} role={role} />

      <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" className="min-h-11" disabled={data.page <= 0} onClick={() => onPage(data.page - 1)}>
          Previous
        </Button>
        <p className="text-sm text-(--color-text-muted)">
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

/** md and up. */
function RequestTable({ requests, role }: { requests: BloodRequest[]; role: Role | null }) {
  const headings = ["Reference", otherPartyHeading(role), "Blood", "Urgency", "Needed by", "State", "Created"];
  return (
    <div className="hidden overflow-x-auto rounded-md border border-(--color-border) md:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Requests, newest first. Open a reference to see the request.</caption>
        <thead className="bg-(--color-surface)">
          <tr>
            {headings.map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3 font-semibold">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id} className="border-t border-(--color-border)">
              <td className="px-4 py-1">
                <Link to={detailPath(request)} className={rowLink}>
                  {request.reference}
                </Link>
              </td>
              <td className="px-4 py-3 wrap-break-word">{otherParty(role, request)}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {requestItemLabel(request.bloodGroup, request.rhesus, request.component, request.quantity)}
              </td>
              <td className="px-4 py-3">{URGENCY_LABELS[request.urgency]}</td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(request.neededBy)}</td>
              <td className="px-4 py-3">
                <RequestStateBadge state={request.state} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <CreatedAgo createdAt={request.createdAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Below md: one card per request; the heading is the link. */
function RequestCards({ requests, role }: { requests: BloodRequest[]; role: Role | null }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {requests.map((request) => (
        <li key={request.id} className="rounded-md border border-(--color-border) bg-(--color-surface) p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0">
              <Link to={detailPath(request)} className={rowLink}>
                {request.reference}
              </Link>
            </h3>
            <RequestStateBadge state={request.state} className="mt-3" />
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-(--color-text-muted)">{otherPartyHeading(role)}</dt>
            <dd className="min-w-0 wrap-break-word">{otherParty(role, request)}</dd>
            <dt className="text-(--color-text-muted)">Blood</dt>
            <dd>{requestItemLabel(request.bloodGroup, request.rhesus, request.component, request.quantity)}</dd>
            <dt className="text-(--color-text-muted)">Urgency</dt>
            <dd>{URGENCY_LABELS[request.urgency]}</dd>
            <dt className="text-(--color-text-muted)">Needed by</dt>
            <dd>{formatDateTime(request.neededBy)}</dd>
            <dt className="text-(--color-text-muted)">Created</dt>
            <dd>
              <CreatedAgo createdAt={request.createdAt} />
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
