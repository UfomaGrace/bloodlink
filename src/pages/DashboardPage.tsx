// DashboardPage (/dashboard): stock and activity for a bank, as GET /dashboard derives them.
// Bank staff and the administrator; the home page for both (HomeRedirect).
//
// - Every figure comes from the service; nothing is counted or invented here (lib/dashboard only
//   orders and labels). They are labelled with computedAt, and Refresh asks again while keeping
//   the current figures on screen, with the button busy, until it answers.
// - Bank staff see their own bank (no bankId is sent). The administrator sees all banks, or one
//   picked in the Bank filter, kept in the URL as ?bankId= and checked against
//   GET /organisations?type=BLOOD_BANK. If that list fails, the filter is hidden and all banks show.
// - The scope line ("All banks" or the bank's name) comes from the response's `bank`.
// - Stock by group counts every component together, and says so on screen.
// - "Holds about to lapse" counts down with useHoldClock: a hold that passes reads "Lapsed" at
//   once, and the figures refresh quietly.
// - States: loading, error (+ Retry, Reference), first use (nothing recorded), refreshing,
//   and partial (each empty list says so on its own).
// - Numbers are always text. Bars are extra, hidden from screen readers; "Low" is written out.
// - Mock only: "Simulate state" swaps in "Sample figures" or "Empty (first use)", because Prism
//   has no Dashboard example and makes one up from the schema.

import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { IS_MOCK } from "../api/client";
import { api } from "../api/endpoints";
import { type Dashboard, type Organisation, userOrganisation } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ComputedAt } from "../components/ComputedAt";
import { MockControls } from "../components/MockControls";
import { UrlFilterSelect } from "../components/UrlFilterSelect";
import { useAsync, type AsyncResult } from "../hooks/useAsync";
import { useHoldClock } from "../hooks/useHoldClock";
import {
  ACTIVITY_SUBJECT_LABELS,
  barPercent,
  dashboardScopeLabel,
  expiryLabel,
  groupRows,
  holdClockEntries,
  holdTimeLeft,
  isFirstUse,
  lowGroupsFewestFirst,
  totalAvailable,
} from "../lib/dashboard";
import {
  bloodTypeLabel,
  COMPONENT_LABELS,
  formatDate,
  formatDateTime,
  formatTime,
  historyEventLabel,
  type LabelOption,
  UNIT_STATE_LABELS,
  UNIT_STATE_TONES,
} from "../lib/labels";
import { DASHBOARD_SIMULATION_LABELS, DEMO_BANK, simulateDashboard, type DashboardSimulation } from "../lib/mockSimulation";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { EmptyState } from "../shared/ui/empty-state";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";
import { StatusBadge } from "../shared/ui/status-badge";

// Before the bank list arrives we can't check ?bankId against it, so only pass a well-formed id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const primaryLink = cn(
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium",
  "bg-(--color-primary) text-(--color-on-primary) hover:bg-(--color-primary-hover)",
  focusRing,
);

const textLink = cn(
  "inline-flex min-h-11 items-center rounded-sm font-medium wrap-break-word text-(--color-primary) underline underline-offset-2",
  focusRing,
);

// Summary tiles and list items: plain bordered boxes in the Card tokens (Card itself always draws an image area).
const tile = "min-w-0 rounded-lg border border-border bg-surface p-4";

function bankOptions(banks: readonly Organisation[]): LabelOption<string>[] {
  return banks.map((bank) => ({ value: bank.id, label: bank.name }));
}

export default function DashboardPage() {
  const { role, session } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = role === "ADMIN";
  const isBankStaff = role === "BANK_STAFF";

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

  // Refresh keeps the current figures visible; a bank change shows the skeleton instead.
  const scopeKey = bankId ?? "";
  const [refreshedKey, setRefreshedKey] = useState<string | null>(null);
  const refreshing = dashboard.loading && dashboard.data !== null && refreshedKey === scopeKey;

  function refresh() {
    setRefreshedKey(scopeKey);
    dashboard.reload();
  }

  // Mock only: the simulation picked, and when (its dates count from then).
  const [simulated, setSimulated] = useState<{ state: DashboardSimulation; at: number } | null>(null);
  function pickSimulation(next: DashboardSimulation | null) {
    setSimulated(next && { state: next, at: Date.now() });
  }
  const simulatedBank = isBankStaff
    ? ((session ? userOrganisation(session.user) : null) ?? DEMO_BANK)
    : ((bankId && banks.data?.find((bank) => bank.id === bankId)) || null);

  const data =
    dashboard.data && IS_MOCK && simulated
      ? simulateDashboard(simulated.state, simulated.at, simulatedBank)
      : dashboard.data;

  const now = useHoldClock(holdClockEntries(data?.holdsEndingSoon ?? []), refresh);
  const settled = data !== null && !dashboard.loading && !dashboard.error;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Stock and activity, worked out by the service from its records.</p>

      <MockControls
        className="mt-4"
        simulation={{ value: simulated?.state ?? null, onChange: pickSimulation, labels: DASHBOARD_SIMULATION_LABELS }}
      />

      {isAdmin && (
        <section aria-labelledby="dashboard-filters-heading" className="mt-6">
          <h2 id="dashboard-filters-heading" className="sr-only">
            Filters
          </h2>
          {bankFilterFailed ? (
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span>The bank filter isn't available right now. Showing all banks.</span>
              <Button variant="ghost" className="min-h-11" onClick={banks.reload}>
                Load banks again
              </Button>
            </p>
          ) : (
            <UrlFilterSelect
              className="sm:max-w-sm"
              label="Bank"
              param="bankId"
              anyLabel={banks.loading ? "Loading banks…" : "All banks"}
              options={bankChoices}
              disabled={banks.loading}
            />
          )}
        </section>
      )}

      <div className="mt-6 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-lg">
          {data && (
            <>
              <span className="text-muted-foreground">Showing: </span>
              <strong className="font-semibold wrap-break-word">{dashboardScopeLabel(data.bank)}</strong>
            </>
          )}
        </p>
        {data && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <ComputedAt computedAt={data.computedAt} />
            <Button
              variant="secondary"
              className="min-h-11"
              loading={refreshing}
              disabled={dashboard.loading && !refreshing}
              onClick={refresh}
            >
              Refresh
            </Button>
          </div>
        )}
      </div>
      {/* Always rendered: a live region must exist before its text changes to be announced. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {settled && data
          ? `Dashboard for ${dashboardScopeLabel(data.bank)}, figures computed at ${formatTime(data.computedAt)}.`
          : ""}
      </p>

      <div aria-busy={dashboard.loading || undefined} className="mt-4">
        <DashboardBody
          dashboard={dashboard}
          data={data}
          refreshing={refreshing}
          now={now}
          canRecordUnits={isBankStaff}
          adminBankFilter={isAdmin && bankId !== undefined}
        />
      </div>
    </>
  );
}

function DashboardBody({
  dashboard,
  data,
  refreshing,
  now,
  canRecordUnits,
  adminBankFilter,
}: {
  dashboard: AsyncResult<Dashboard>;
  /** What to show: the service's answer, or the mock simulation of it. */
  data: Dashboard | null;
  refreshing: boolean;
  now: number;
  canRecordUnits: boolean;
  adminBankFilter: boolean;
}) {
  if (dashboard.loading && !refreshing) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm font-medium">
          Loading the dashboard…
        </p>
        <Skeleton lines={8} />
      </div>
    );
  }

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

  if (!data) return null;

  if (isFirstUse(data)) {
    return (
      <div className="flex flex-col items-center">
        <EmptyState
          title="No units recorded yet"
          description={
            canRecordUnits
              ? "Record your bank's first unit and the figures will appear here."
              : "When banks record units, the figures will appear here."
          }
        />
        {canRecordUnits && (
          <Link to="/units/new" className={primaryLink}>
            Record unit
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Summary data={data} adminBankFilter={adminBankFilter} />
      <StockByGroup data={data} />
      <div className="grid gap-8 lg:grid-cols-2">
        <LowGroups data={data} />
        <HoldsEndingSoon data={data} now={now} />
        <UnitsExpiringSoon data={data} now={now} />
        <RecentActivity data={data} />
      </div>
    </div>
  );
}

function SectionHeading({ id, title, note }: { id: string; title: string; note: string }) {
  return (
    <div className="mb-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{note}</p>
    </div>
  );
}

function None({ children }: { children: string }) {
  return <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{children}</p>;
}

function Tile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className={tile}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums wrap-break-word">{value}</dd>
      {note && <dd className="mt-1 text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

function Summary({ data, adminBankFilter }: { data: Dashboard; adminBankFilter: boolean }) {
  const { pending, approved } = data.openRequests;
  // The requests list has no bank filter, so with one bank picked it can show more than these counts.
  const listNote = adminBankFilter ? "The requests list shows every bank." : undefined;
  return (
    <section aria-labelledby="dashboard-summary-heading">
      <h2 id="dashboard-summary-heading" className="sr-only">
        At a glance
      </h2>
      <dl className="grid gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
        <Tile label="Units available" value={totalAvailable(data.availableByGroup)} note="All components combined" />
        <Tile
          label="Groups running low"
          value={data.lowGroups.length}
          note={`Fewer than ${data.lowStockThreshold} units available`}
        />
        <Tile
          label="Pending requests"
          value={
            <Link to="/requests?state=PENDING" className={textLink} aria-label={`${pending} pending requests: view them`}>
              {pending}
            </Link>
          }
          note={listNote}
        />
        <Tile
          label="Approved, holding units"
          value={
            <Link to="/requests?state=APPROVED" className={textLink} aria-label={`${approved} approved requests: view them`}>
              {approved}
            </Link>
          }
          note={listNote}
        />
        <Tile
          label="Holds about to lapse"
          value={data.holdsEndingSoon.length}
          note={`Ending within ${data.holdsEndingWithinMinutes} minutes`}
        />
        <Tile
          label="Units expiring soon"
          value={data.unitsExpiringSoon.length}
          note={`Within ${data.expiringWithinDays} days`}
        />
      </dl>
    </section>
  );
}

function StockByGroup({ data }: { data: Dashboard }) {
  const rows = groupRows(data);
  const max = Math.max(0, ...rows.map((row) => row.availableUnits));
  return (
    <section aria-labelledby="dashboard-stock-heading">
      <SectionHeading
        id="dashboard-stock-heading"
        title="Available by blood group"
        note="All components combined: red cells, platelets, plasma and the rest are counted together."
      />
      {rows.length === 0 ? (
        <None>No stock figures were sent.</None>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Available units by blood group, all components combined</caption>
            <thead className="bg-(--color-surface-sunken)">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Group
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Units available
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  <span className="sr-only">Status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <th scope="row" className="px-4 py-3 font-medium whitespace-nowrap">
                    {row.label}
                  </th>
                  <td className="w-full px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-12 shrink-0 tabular-nums">{row.availableUnits}</span>
                      <span aria-hidden="true" className="h-2 min-w-0 flex-1 rounded-sm bg-(--color-surface-sunken)">
                        <span
                          className={cn(
                            "block h-full rounded-sm",
                            row.low ? "bg-(--color-warning)" : "bg-(--color-primary)",
                          )}
                          style={{ width: `${barPercent(row.availableUnits, max)}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{row.low && <StatusBadge tone="warning">Low</StatusBadge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LowGroups({ data }: { data: Dashboard }) {
  const groups = lowGroupsFewestFirst(data.lowGroups);
  return (
    <section aria-labelledby="dashboard-low-heading">
      <SectionHeading
        id="dashboard-low-heading"
        title="Groups running low"
        note={`Fewer than ${data.lowStockThreshold} units available, all components combined. Fewest first.`}
      />
      {groups.length === 0 ? (
        <None>No groups are running low.</None>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((group) => (
            <li key={`${group.bloodGroup}|${group.rhesus}`} className={cn(tile, "flex items-center justify-between gap-3")}>
              <span className="font-semibold">{bloodTypeLabel(group.bloodGroup, group.rhesus)}</span>
              <span className="tabular-nums">
                {group.availableUnits} {group.availableUnits === 1 ? "unit" : "units"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HoldsEndingSoon({ data, now }: { data: Dashboard; now: number }) {
  return (
    <section aria-labelledby="dashboard-holds-heading">
      <SectionHeading
        id="dashboard-holds-heading"
        title="Holds about to lapse"
        note={`Holds ending within ${data.holdsEndingWithinMinutes} minutes, soonest first.`}
      />
      {data.holdsEndingSoon.length === 0 ? (
        <None>{`No holds end in the next ${data.holdsEndingWithinMinutes} minutes.`}</None>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.holdsEndingSoon.map((hold) => {
            const left = holdTimeLeft(hold.holdExpiresAt, now);
            return (
              <li key={`${hold.requestId}|${hold.unit.id}`} className={tile}>
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <Link to={`/requests/${encodeURIComponent(hold.requestId)}`} className={textLink}>
                    {hold.requestReference}
                  </Link>
                  <StatusBadge tone={left.lapsed ? "neutral" : "warning"}>{left.label}</StatusBadge>
                </div>
                <p className="text-sm wrap-break-word">{hold.hospital.name}</p>
                <p className="text-sm text-muted-foreground">
                  Unit {hold.unit.reference} · hold ends{" "}
                  <time dateTime={hold.holdExpiresAt}>{formatDateTime(hold.holdExpiresAt)}</time>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function UnitsExpiringSoon({ data, now }: { data: Dashboard; now: number }) {
  return (
    <section aria-labelledby="dashboard-expiring-heading">
      <SectionHeading
        id="dashboard-expiring-heading"
        title="Units expiring soon"
        note={`Available or reserved units expiring within ${data.expiringWithinDays} days, soonest first.`}
      />
      {data.unitsExpiringSoon.length === 0 ? (
        <None>{`No units expire in the next ${data.expiringWithinDays} days.`}</None>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.unitsExpiringSoon.map((unit) => (
            <li key={unit.id} className={tile}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Link to={`/units/${encodeURIComponent(unit.id)}`} className={cn(textLink, "font-semibold")}>
                  {unit.reference}
                </Link>
                <StatusBadge tone={UNIT_STATE_TONES[unit.state]}>{UNIT_STATE_LABELS[unit.state]}</StatusBadge>
              </div>
              <p className="text-sm">
                {bloodTypeLabel(unit.bloodGroup, unit.rhesus)} {COMPONENT_LABELS[unit.component].toLowerCase()}
                {data.bank === null && <span className="text-muted-foreground"> · {unit.bank.name}</span>}
              </p>
              <p className="text-sm text-muted-foreground">
                {expiryLabel(unit.expiryDate, now)} ({formatDate(unit.expiryDate)})
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentActivity({ data }: { data: Dashboard }) {
  return (
    <section aria-labelledby="dashboard-activity-heading">
      <SectionHeading id="dashboard-activity-heading" title="Recent activity" note="The latest entries, newest first." />
      {data.recentActivity.length === 0 ? (
        <None>No activity yet.</None>
      ) : (
        <ol className="flex flex-col gap-2">
          {data.recentActivity.map((entry, i) => (
            <li key={`${entry.at}|${entry.reference}|${i}`} className={tile}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold">{historyEventLabel(entry.event)}</span>
                <time dateTime={entry.at} className="text-sm text-muted-foreground">
                  {formatDateTime(entry.at)}
                </time>
              </div>
              <p className="text-sm wrap-break-word">
                {ACTIVITY_SUBJECT_LABELS[entry.subject]} {entry.reference} · {entry.actor}
              </p>
              {entry.note && <p className="mt-1 text-sm text-muted-foreground wrap-break-word">{entry.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
