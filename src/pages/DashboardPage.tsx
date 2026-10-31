// DashboardPage (/dashboard): stock and activity for a bank, as GET /dashboard derives them.
// Bank staff and the administrator; the home page for both (HomeRedirect).
//
// - Every figure comes from the service; nothing is counted or invented here (lib/dashboard only
//   orders and labels). "Updated" shows computedAt (Lagos time, with the day once it isn't today),
//   and Refresh asks again while keeping the current figures on screen, the button busy.
// - The Dashboard has no request list, so the emergency strip and "Waiting for you" read
//   GET /requests?state=PENDING (every page, up to a limit). If that fails the figures still show,
//   and the strip's place says we couldn't check for emergencies, with Check again.
// - Bank staff see their own bank (no bankId is sent). The administrator sees all banks, or one
//   picked in the Bank filter, kept in the URL as ?bankId= and checked against
//   GET /organisations?type=BLOOD_BANK. If that list fails, the filter is hidden and all banks show.
//   The request list has no bank filter, so the picked bank is applied here.
// - The context line ("All banks" or the bank's name) comes from the response's `bank`.
// - Stock by group counts every component together, and says so on screen.
// - "Next hold ends in …" counts down with useHoldClock; when a hold passes, the figures refresh.
// - States: loading (skeletons shaped like each section), error (+ Retry, Reference), first use
//   (nothing recorded), refreshing, and partial (each empty list says so on its own).
// - Numbers are always text. Bars are extra, hidden from screen readers; "low" is written out.
// - Mock only: "Simulate state" swaps in "Sample figures" or "Empty (first use)", with pending
//   requests to match, because Prism has no Dashboard example and makes one up from the schema.

import { Droplet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { IS_MOCK, type ApiError } from "../api/client";
import { api } from "../api/endpoints";
import { type BloodRequest, type Dashboard, type Organisation, type Urgency, userOrganisation } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { MockControls } from "../components/MockControls";
import { UrlFilterSelect } from "../components/UrlFilterSelect";
import { useAsync, type AsyncResult } from "../hooks/useAsync";
import { useHoldClock } from "../hooks/useHoldClock";
import { useNow } from "../hooks/useNow";
import {
  activitySentence,
  availableFor,
  barPercent,
  dashboardScopeLabel,
  groupRows,
  holdClockEntries,
  isFirstUse,
  lagosDayLabel,
  lagosWhen,
  nextHoldLeft,
  readPendingRequests,
  totalAvailable,
  unitsLabel,
  waitingRequests,
} from "../lib/dashboard";
import { bloodTypeLabel, formatTime, type LabelOption, timeAgo, URGENCY_LABELS } from "../lib/labels";
import {
  DASHBOARD_SIMULATION_LABELS,
  DEMO_BANK,
  simulateDashboard,
  simulatePendingRequests,
  type DashboardSimulation,
} from "../lib/mockSimulation";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { EmptyState } from "../shared/ui/empty-state";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";

// Before the bank list arrives we can't check ?bankId against it, so only pass a well-formed id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Updated" and the request ages are worked out again this often.
const CLOCK_TICK_MS = 30_000;

// Rows in "Waiting for you" and "Recent activity".
const LIST_LIMIT = 5;

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

// Inside a surface that clips its corners, the ring is drawn inside the link instead.
const insetFocusRing = "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:-outline-offset-2";

const primaryLink = cn(
  "inline-flex min-h-11 items-center justify-center gap-1 rounded-md px-4 text-sm font-medium",
  "bg-(--color-primary) text-(--color-on-primary) hover:bg-(--color-primary-hover)",
  focusRing,
);

const textLink = cn(
  "inline-flex min-h-11 items-center rounded-sm font-medium wrap-break-word text-(--color-primary) underline underline-offset-2",
  focusRing,
);

// One surface (the Card tokens) for each section.
const surface = "min-w-0 rounded-lg border border-border bg-surface";
// One surface split into columns by hairlines: the 1px gaps let the border colour show between
// the cells, however the columns wrap.
const splitSurface = "grid gap-px overflow-hidden rounded-lg border border-border bg-border";
const cell = "min-w-0 bg-surface";

const URGENCY_TEXT: Record<Urgency, string> = {
  EMERGENCY: "font-medium text-(--color-danger)",
  URGENT: "font-medium text-(--color-warning)",
  ROUTINE: "text-muted-foreground",
};

function bankOptions(banks: readonly Organisation[]): LabelOption<string>[] {
  return banks.map((bank) => ({ value: bank.id, label: bank.name }));
}

/** What the strip and "Waiting for you" need from the pending list. */
type PendingView = {
  /** Waiting at this scope, emergencies first then oldest; null until the first answer. */
  waiting: BloodRequest[] | null;
  /** How many were read, when we stopped before the end; null when we read them all. */
  truncatedAt: number | null;
  error: ApiError | null;
  retry: () => void;
};

export default function DashboardPage() {
  const { role, session } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = role === "ADMIN";
  const isBankStaff = role === "BANK_STAFF";
  const ownBank = isBankStaff && session ? userOrganisation(session.user) : null;

  // Only the administrator gets the bank filter, so only they load the list.
  const banks = useAsync(
    (signal) =>
      isAdmin
        ? api.listOrganisations({ type: "BLOOD_BANK" }, signal).then((res) => res.data.items)
        : Promise.resolve(null),
    [isAdmin],
  );
  const bankFilterFailed = isAdmin && !banks.loading && banks.error !== null && banks.data === null;
  const bankChoices = bankOptions(banks.data ?? []);

  // ?bankId: checked against the list once it's here; passed through while it loads (so a shared
  // link doesn't load twice); ignored for bank staff and when the list failed.
  const bankParam = searchParams.get("bankId");
  let bankId: string | undefined;
  if (isAdmin && banks.data) bankId = bankChoices.find((option) => option.value === bankParam)?.value;
  else if (isAdmin && banks.loading) bankId = bankParam && UUID.test(bankParam) ? bankParam : undefined;

  const dashboard = useAsync(
    (signal) => api.getDashboard({ bankId }, signal).then((res) => res.data),
    [bankId],
  );
  // Not keyed on the bank: the list has no bank filter, so a bank change is applied here.
  const pending = useAsync((signal) => readPendingRequests(api.listRequests, signal), []);

  // Refresh keeps the current figures visible; a bank change shows the skeleton instead.
  const scopeKey = bankId ?? "";
  const [refreshedKey, setRefreshedKey] = useState<string | null>(null);
  const refreshing = dashboard.loading && dashboard.data !== null && refreshedKey === scopeKey;

  function refresh() {
    setRefreshedKey(scopeKey);
    dashboard.reload();
    pending.reload();
  }

  // Mock only: the simulation picked, and when (its dates count from then).
  const [simulated, setSimulated] = useState<{ state: DashboardSimulation; at: number } | null>(null);
  function pickSimulation(next: DashboardSimulation | null) {
    setSimulated(next && { state: next, at: Date.now() });
  }
  const pickedBank = (bankId && banks.data?.find((bank) => bank.id === bankId)) || null;
  const simulatedBank = isBankStaff ? (ownBank ?? DEMO_BANK) : pickedBank;
  const simulation = IS_MOCK ? simulated : null;

  const data =
    dashboard.data && simulation ? simulateDashboard(simulation.state, simulation.at, simulatedBank) : dashboard.data;
  const pendingItems = simulation
    ? simulatePendingRequests(simulation.state, simulation.at, simulatedBank)
    : (pending.data?.items ?? null);
  const pendingView: PendingView = {
    waiting: pendingItems && waitingRequests(pendingItems, bankId),
    truncatedAt: simulation ? null : (pending.data?.truncatedAt ?? null),
    error: simulation ? null : pending.error,
    retry: pending.reload,
  };

  const now = useHoldClock(holdClockEntries(data?.holdsEndingSoon ?? []), refresh);
  const clock = useNow(CLOCK_TICK_MS);
  const settled = data !== null && !dashboard.loading && !dashboard.error;
  // The first load waits for the pending list too, so the strip never pops in above the figures.
  const pendingFirstLoad = !simulation && pending.loading && pending.data === null;
  const loading = (dashboard.loading && !refreshing) || pendingFirstLoad;

  const scope = settled
    ? dashboardScopeLabel(data.bank)
    : isBankStaff
      ? (ownBank?.name ?? null)
      : bankId
        ? (pickedBank?.name ?? null)
        : "All banks";

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground wrap-break-word">
            {scope && (
              <>
                <span>{scope}</span>
                {" · "}
              </>
            )}
            <span>{lagosDayLabel(clock)}</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dashboard</h1>
        </div>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          {isAdmin &&
            (bankFilterFailed ? (
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                <span>The bank filter isn't available right now. Showing all banks.</span>
                <Button variant="ghost" className="min-h-11" onClick={banks.reload}>
                  Load banks again
                </Button>
              </p>
            ) : (
              <UrlFilterSelect
                className="w-full sm:w-64"
                label="Bank"
                param="bankId"
                anyLabel={banks.loading ? "Loading banks…" : "All banks"}
                options={bankChoices}
                disabled={banks.loading}
              />
            ))}
          {data && (
            <p className="flex min-h-11 items-center gap-x-1 text-sm text-muted-foreground">
              <span>
                Updated{" "}
                <time dateTime={data.computedAt} className="tabular-nums">
                  {lagosWhen(data.computedAt, clock)}
                </time>
              </span>
              <span aria-hidden="true">·</span>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 px-2 font-medium text-(--color-primary) underline underline-offset-2"
                loading={refreshing}
                disabled={dashboard.loading && !refreshing}
                onClick={refresh}
              >
                Refresh
              </Button>
            </p>
          )}
        </div>
      </header>
      {/* Always rendered: a live region must exist before its text changes to be announced. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {settled && data
          ? `Dashboard for ${dashboardScopeLabel(data.bank)}, figures computed at ${formatTime(data.computedAt)}.`
          : ""}
      </p>

      <div aria-busy={dashboard.loading || pending.loading || undefined} className="mt-6">
        <DashboardBody
          dashboard={dashboard}
          data={data}
          loading={loading}
          pending={pendingView}
          now={now}
          clock={clock}
          isBankStaff={isBankStaff}
        />
      </div>

      {IS_MOCK && (
        <details className="mt-8 rounded-md border border-dashed border-input px-3">
          <summary className={cn("flex min-h-11 cursor-pointer items-center text-sm font-semibold", focusRing)}>
            Mock server tools
          </summary>
          <MockControls
            // The summary already names it; the panel's own box and heading would repeat it.
            className="mb-3 border-0 p-0 [&>h2]:sr-only"
            simulation={{ value: simulated?.state ?? null, onChange: pickSimulation, labels: DASHBOARD_SIMULATION_LABELS }}
          />
        </details>
      )}
    </>
  );
}

function DashboardBody({
  dashboard,
  data,
  loading,
  pending,
  now,
  clock,
  isBankStaff,
}: {
  dashboard: AsyncResult<Dashboard>;
  /** What to show: the service's answer, or the mock simulation of it. */
  data: Dashboard | null;
  loading: boolean;
  pending: PendingView;
  /** The hold clock: ticks each second while a hold runs. */
  now: number;
  /** For "Updated", ages and activity times: ticks every 30 seconds. */
  clock: number;
  isBankStaff: boolean;
}) {
  if (dashboard.error) {
    return (
      <ErrorState
        // ErrorState takes strings only; pre-line puts the Reference on its own line.
        className="whitespace-pre-line"
        title="We couldn't load the dashboard"
        description={`${dashboard.error.message}\nReference: ${dashboard.error.requestId}`}
        onRetry={dashboard.reload}
      />
    );
  }

  if (loading) return <DashboardSkeleton />;

  if (!data) return null;

  if (isFirstUse(data)) {
    return (
      <div className="flex flex-col items-center">
        <EmptyState
          title="No units recorded yet"
          description={
            isBankStaff
              ? "Record your bank's first unit and the figures will appear here."
              : "When banks record units, the figures will appear here."
          }
        />
        {isBankStaff && (
          <Link to="/units/new" className={primaryLink}>
            Record unit
          </Link>
        )}
      </div>
    );
  }

  const emergencies = pending.waiting?.filter((request) => request.urgency === "EMERGENCY") ?? null;
  return (
    <div className="flex flex-col gap-6">
      <EmergencyStrip data={data} pending={pending} emergencies={emergencies ?? []} clock={clock} isBankStaff={isBankStaff} />
      <Figures data={data} now={now} emergencies={emergencies?.length ?? null} />
      <StockByGroup data={data} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <WaitingForYou pending={pending} clock={clock} allBanks={data.bank === null} />
        <RecentActivity data={data} clock={clock} />
      </div>
    </div>
  );
}

function SurfaceHeader({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 border-b border-border px-4 py-1.5">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </div>
  );
}

function EmergencyStrip({
  data,
  pending,
  emergencies,
  clock,
  isBankStaff,
}: {
  data: Dashboard;
  pending: PendingView;
  /** Oldest first. */
  emergencies: readonly BloodRequest[];
  clock: number;
  isBankStaff: boolean;
}) {
  // Not knowing is not the same as none: say so rather than hide the strip.
  if (pending.error) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-(--color-warning-subtle) px-4 py-3">
        <p className="min-w-0 text-sm wrap-break-word">
          <span className="font-semibold">We couldn't check for emergency requests.</span> {pending.error.message}{" "}
          <span className="text-muted-foreground">Reference: {pending.error.requestId}</span>
        </p>
        <Button variant="secondary" className="min-h-11" onClick={pending.retry}>
          Check again
        </Button>
      </div>
    );
  }

  const [first, ...more] = emergencies;
  if (!first) return null;

  const group = bloodTypeLabel(first.bloodGroup, first.rhesus);
  const available = availableFor(data, first);
  const holder = data.bank === null ? "All banks together have" : isBankStaff ? "You have" : `${data.bank.name} has`;
  return (
    <section
      aria-labelledby="dashboard-emergency-heading"
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-(--color-danger-subtle) p-4 sm:flex-row sm:items-center sm:justify-between",
        "border-[color-mix(in_srgb,var(--color-danger)_25%,var(--color-surface))]",
      )}
    >
      <div className="flex min-w-0 gap-3">
        <Droplet aria-hidden="true" className="mt-1 size-5 shrink-0 fill-current text-(--color-danger)" />
        <div className="min-w-0">
          <h2 id="dashboard-emergency-heading" className="text-lg font-semibold wrap-break-word">
            Emergency: {first.hospital.name} needs {unitsLabel(first.quantity)} of {group}
            {data.bank === null && ` from ${first.bank.name}`}
          </h2>
          <p className="mt-1 text-sm tabular-nums">
            Received <time dateTime={first.createdAt}>{timeAgo(first.createdAt, clock)}</time>.
            {available !== null && ` ${holder} ${available} ${group} available.`}
          </p>
          {more.length > 0 && (
            <Link to="/requests?state=PENDING" className={cn(textLink, "text-sm")}>
              +{more.length} more {more.length === 1 ? "emergency" : "emergencies"}
            </Link>
          )}
        </div>
      </div>
      <Link to={`/requests/${encodeURIComponent(first.id)}`} className={cn(primaryLink, "shrink-0 self-start sm:self-center")}>
        Review request <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

function Figure({
  label,
  value,
  note,
  to,
  warn = false,
}: {
  label: string;
  value: number;
  note: string;
  /** The matching list page; left out, the column is plain text. */
  to?: string;
  /** Warning colour on the note (only "Next hold ends in …"). */
  warn?: boolean;
}) {
  const body = (
    <>
      <span className="block text-sm text-muted-foreground">{label}</span>
      <span className="mt-1 block text-3xl font-semibold tabular-nums wrap-break-word">{value}</span>
      <span className={cn("mt-1 block text-xs tabular-nums", warn ? "text-(--color-warning)" : "text-muted-foreground")}>
        {note}
      </span>
    </>
  );
  return (
    <li className={cell}>
      {to ? (
        <Link to={to} className={cn("block h-full p-4 hover:bg-(--color-surface-hover)", insetFocusRing)}>
          {body}
        </Link>
      ) : (
        <div className="p-4">{body}</div>
      )}
    </li>
  );
}

function Figures({ data, now, emergencies }: { data: Dashboard; now: number; emergencies: number | null }) {
  const holdLeft = nextHoldLeft(data.holdsEndingSoon, now);
  return (
    <section aria-labelledby="dashboard-figures-heading">
      <h2 id="dashboard-figures-heading" className="sr-only">
        At a glance
      </h2>
      <ul className={cn(splitSurface, "grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4")}>
        <Figure
          label="Units available"
          value={totalAvailable(data.availableByGroup)}
          note="All components combined"
          to="/units?state=AVAILABLE"
        />
        <Figure
          label="Pending requests"
          value={data.openRequests.pending}
          note={
            emergencies ? `${emergencies} ${emergencies === 1 ? "emergency" : "emergencies"}` : "Waiting for a decision"
          }
          to="/requests?state=PENDING"
        />
        <Figure
          label="Requests on hold"
          value={data.openRequests.approved}
          note={holdLeft ? `Next hold ends in ${holdLeft}` : `No holds end in the next ${data.holdsEndingWithinMinutes} min`}
          warn={holdLeft !== null}
          to="/requests?state=APPROVED"
        />
        <Figure
          label="Expiring soon"
          value={data.unitsExpiringSoon.length}
          note={`Within ${data.expiringWithinDays} days`}
        />
      </ul>
    </section>
  );
}

function StockByGroup({ data }: { data: Dashboard }) {
  const rows = groupRows(data);
  const max = Math.max(0, ...rows.map((row) => row.availableUnits));
  return (
    <section aria-labelledby="dashboard-stock-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="dashboard-stock-heading" className="text-base font-semibold">
          Stock by group
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          Available units, all components combined. Low is under {data.lowStockThreshold}.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className={cn(surface, "p-4 text-sm text-muted-foreground")}>No stock figures were sent.</p>
      ) : (
        <ul className={cn(splitSurface, "grid-cols-2 min-[480px]:grid-cols-4 lg:grid-cols-8")}>
          {rows.map((row) => (
            <li key={row.key} className={cn(cell, "p-3")}>
              <span className="block text-sm font-medium">{row.label}</span>
              <span className={cn("mt-1 flex items-baseline gap-1.5", row.low && "text-(--color-danger)")}>
                <span className="text-xl font-semibold tabular-nums">{row.availableUnits}</span>
                <span className="sr-only">available</span>
                {row.low && <span className="text-xs font-medium">low</span>}
              </span>
              <span aria-hidden="true" className="mt-2 block h-1 rounded-full bg-(--color-surface-sunken)">
                <span
                  className={cn("block h-full rounded-full", row.low ? "bg-(--color-danger)" : "bg-(--color-primary)")}
                  style={{ width: `${barPercent(row.availableUnits, max)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WaitingForYou({ pending, clock, allBanks }: { pending: PendingView; clock: number; allBanks: boolean }) {
  return (
    <section aria-labelledby="dashboard-waiting-heading" className={surface}>
      <SurfaceHeader id="dashboard-waiting-heading" title="Waiting for you">
        <Link to="/requests?state=PENDING" className={cn(textLink, "text-sm")}>
          View all requests
        </Link>
      </SurfaceHeader>
      {pending.error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="min-w-0 text-sm wrap-break-word">
            We couldn't load the requests waiting for you.{" "}
            <span className="text-muted-foreground">Reference: {pending.error.requestId}</span>
          </p>
          <Button variant="secondary" className="min-h-11" onClick={pending.retry}>
            Try again
          </Button>
        </div>
      ) : !pending.waiting ? (
        <WaitingRowsSkeleton />
      ) : pending.waiting.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Nothing waiting. New requests appear here.</p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {pending.waiting.slice(0, LIST_LIMIT).map((request) => (
              <li key={request.id}>
                <Link
                  to={`/requests/${encodeURIComponent(request.id)}`}
                  className={cn("flex items-center gap-3 px-4 py-3 hover:bg-(--color-surface-hover)", insetFocusRing)}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-(--color-surface-sunken) text-sm font-semibold">
                    {bloodTypeLabel(request.bloodGroup, request.rhesus)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium wrap-break-word">{request.hospital.name}</span>
                    <span className="block text-sm text-muted-foreground tabular-nums wrap-break-word">
                      {unitsLabel(request.quantity)} · {request.reference}
                      {allBanks && ` · ${request.bank.name}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5 text-sm sm:flex-row sm:items-center sm:gap-4">
                    <span className={URGENCY_TEXT[request.urgency]}>{URGENCY_LABELS[request.urgency]}</span>
                    <time dateTime={request.createdAt} className="text-muted-foreground tabular-nums sm:w-24 sm:text-right">
                      {timeAgo(request.createdAt, clock)}
                    </time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {pending.truncatedAt !== null && (
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground tabular-nums">
              Only the first {pending.truncatedAt} pending requests were checked.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function RecentActivity({ data, clock }: { data: Dashboard; clock: number }) {
  const entries = data.recentActivity.slice(0, LIST_LIMIT);
  return (
    <section aria-labelledby="dashboard-activity-heading" className={surface}>
      <SurfaceHeader id="dashboard-activity-heading" title="Recent activity" />
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ol className="divide-y divide-border">
          {entries.map((entry, i) => (
            <li key={`${entry.at}|${entry.reference}|${i}`} className="flex gap-3 px-4 py-3 text-sm">
              <time dateTime={entry.at} className="w-28 shrink-0 text-muted-foreground tabular-nums">
                {lagosWhen(entry.at, clock)}
              </time>
              <span className="min-w-0 wrap-break-word">{activitySentence(entry)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---- Loading: each section's shape, so nothing jumps when the figures arrive. ----

// Skeleton's bar is the inner div of its inner div; these set its height.
const bar = {
  xs: "[&_div_div]:h-1",
  sm: "[&_div_div]:h-4",
  md: "[&_div_div]:h-5",
  lg: "[&_div_div]:h-7",
  xl: "[&_div_div]:h-9",
};

function WaitingRowsSkeleton() {
  return (
    <ul aria-hidden="true" className="divide-y divide-border">
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton shape="image" className="aspect-auto size-10 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className={cn("w-40 max-w-full", bar.md)} />
            <Skeleton className={cn("w-28 max-w-full", bar.md)} />
          </span>
          <Skeleton className={cn("w-16 shrink-0", bar.md)} />
        </li>
      ))}
    </ul>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <p role="status" className="sr-only">
        Loading the dashboard…
      </p>
      <div className={cn(splitSurface, "grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4")}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={cn(cell, "flex flex-col gap-1 p-4")}>
            <Skeleton className={cn("w-24", bar.md)} />
            <Skeleton className={cn("w-16", bar.xl)} />
            <Skeleton className={cn("w-28", bar.sm)} />
          </div>
        ))}
      </div>
      <div>
        <Skeleton className={cn("mb-3 w-32", bar.md)} />
        <div className={cn(splitSurface, "grid-cols-2 min-[480px]:grid-cols-4 lg:grid-cols-8")}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={cn(cell, "flex flex-col gap-1 p-3")}>
              <Skeleton className={cn("w-8", bar.md)} />
              <Skeleton className={cn("w-10", bar.lg)} />
              <Skeleton className={cn("mt-1", bar.xs)} />
            </div>
          ))}
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className={surface}>
          <div className="flex min-h-14 items-center border-b border-border px-4">
            <Skeleton className={cn("w-32", bar.md)} />
          </div>
          <WaitingRowsSkeleton />
        </div>
        <div className={surface}>
          <div className="flex min-h-14 items-center border-b border-border px-4">
            <Skeleton className={cn("w-32", bar.md)} />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex gap-3 px-4 py-3">
                <Skeleton className={cn("w-12 shrink-0", bar.md)} />
                <Skeleton className={cn("w-3/4", bar.md)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
