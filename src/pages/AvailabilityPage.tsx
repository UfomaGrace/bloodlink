// AvailabilityPage (/availability): which banks hold available units of a group/rhesus/component.
// Hospital staff, bank staff and the administrator.
//
// - Filters (blood group, rhesus, component, bank, area) live in the URL, so a refresh, Back,
//   or a shared link shows the same search. All are optional and combine with AND.
// - Bank and area options come from GET /organisations?type=BLOOD_BANK. If that fails, the page
//   still searches: the two filters are hidden (and ignored) and a short note says why.
// - Values from the URL are checked (label maps, the bank list); anything unknown is ignored.
// - The figures are labelled with computedAt ("computed at 10:02 (2 min ago)"); Refresh re-runs
//   the search and keeps the current results on screen, with the button busy, until it answers.
// - States: loading, error (+ Retry), empty, results. Wide screens get a table; phones get cards.
// - Hospital staff get a "Request units" link per row, prefilled with that bank and blood type.

import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "../api/endpoints";
import type { Availability, AvailabilityRow, Organisation } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ComputedAt } from "../components/ComputedAt";
import { UrlFilterSelect } from "../components/UrlFilterSelect";
import { useAsync, type AsyncResult } from "../hooks/useAsync";
import {
  bloodTypeLabel,
  BLOOD_GROUP_LABELS,
  BLOOD_GROUP_OPTIONS,
  COMPONENT_LABELS,
  COMPONENT_OPTIONS,
  formatDate,
  isKeyOf,
  type LabelOption,
  RHESUS_LABELS,
  RHESUS_OPTIONS,
} from "../lib/labels";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { EmptyState } from "../shared/ui/empty-state";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";

const FILTER_PARAMS = ["bloodGroup", "rhesus", "component", "bankId", "area"] as const;

// Before the bank list arrives we can't check ?bankId against it, so only pass a well-formed id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const requestLink = cn(
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium whitespace-nowrap",
  "border border-(--color-border-input) bg-(--color-surface) text-(--color-text) hover:bg-(--color-surface-hover)",
  focusRing,
);

/** The value if it is one of the options, otherwise undefined. */
function pickOption(value: string | null, options: readonly LabelOption<string>[]): string | undefined {
  return options.find((option) => option.value === value)?.value;
}

function bankOptions(banks: readonly Organisation[]): LabelOption<string>[] {
  return banks.map((bank) => ({ value: bank.id, label: bank.name }));
}

/** Each area once, A–Z. */
function areaOptions(banks: readonly Organisation[]): LabelOption<string>[] {
  return [...new Set(banks.map((bank) => bank.area))]
    .sort((a, b) => a.localeCompare(b))
    .map((area) => ({ value: area, label: area }));
}

export default function AvailabilityPage() {
  const { role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canRequest = role === "HOSPITAL_STAFF";

  const banks = useAsync(
    (signal) => api.listOrganisations({ type: "BLOOD_BANK" }, signal).then((res) => res.data.items),
    [],
  );
  const bankFiltersFailed = !banks.loading && banks.error !== null && banks.data === null;
  const banksForFilters = banks.data ?? [];
  const bankChoices = bankOptions(banksForFilters);
  const areaChoices = areaOptions(banksForFilters);

  const groupParam = searchParams.get("bloodGroup");
  const rhesusParam = searchParams.get("rhesus");
  const componentParam = searchParams.get("component");
  const bankParam = searchParams.get("bankId");
  const areaParam = searchParams.get("area");

  const bloodGroup = isKeyOf(BLOOD_GROUP_LABELS, groupParam) ? groupParam : undefined;
  const rhesus = isKeyOf(RHESUS_LABELS, rhesusParam) ? rhesusParam : undefined;
  const component = isKeyOf(COMPONENT_LABELS, componentParam) ? componentParam : undefined;

  // Bank and area: checked against the bank list once it's here; passed through while it loads
  // (so a shared link doesn't search twice); ignored if it failed, since they're hidden then.
  let bankId: string | undefined;
  let area: string | undefined;
  if (banks.data) {
    bankId = pickOption(bankParam, bankChoices);
    area = pickOption(areaParam, areaChoices);
  } else if (banks.loading) {
    bankId = bankParam && UUID.test(bankParam) ? bankParam : undefined;
    area = areaParam?.trim() || undefined;
  }

  const activeCount = [bloodGroup, rhesus, component, bankId, area].filter(Boolean).length;
  // Clear filters also removes params we ignored (unknown values, or bank/area while hidden).
  const hasAnyParam = FILTER_PARAMS.some((param) => searchParams.has(param));

  const availability = useAsync(
    (signal) =>
      api.searchAvailability({ bloodGroup, rhesus, component, bankId, area }, signal).then((res) => res.data),
    [bloodGroup, rhesus, component, bankId, area],
  );

  // Refresh keeps the current results visible; a filter change shows the skeleton instead.
  const searchKey = [bloodGroup, rhesus, component, bankId, area].join("|");
  const [refreshedKey, setRefreshedKey] = useState<string | null>(null);
  const refreshing = availability.loading && availability.data !== null && refreshedKey === searchKey;

  function refresh() {
    setRefreshedKey(searchKey);
    availability.reload();
  }

  function clearFilters() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const param of FILTER_PARAMS) next.delete(param);
      return next;
    });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Find blood</h1>
      <p className="mt-2 text-muted-foreground">Banks with available units, by blood type and component.</p>

      <section aria-labelledby="availability-filters-heading" className="mt-6">
        <h2 id="availability-filters-heading" className="sr-only">
          Filters
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <UrlFilterSelect label="Blood group" param="bloodGroup" anyLabel="All groups" options={BLOOD_GROUP_OPTIONS} />
          <UrlFilterSelect label="Rhesus type" param="rhesus" anyLabel="Both types" options={RHESUS_OPTIONS} />
          <UrlFilterSelect label="Component" param="component" anyLabel="All components" options={COMPONENT_OPTIONS} />
          {!bankFiltersFailed && (
            <>
              <UrlFilterSelect
                label="Bank"
                param="bankId"
                anyLabel={banks.loading ? "Loading banks…" : "All banks"}
                options={bankChoices}
                disabled={banks.loading}
              />
              <UrlFilterSelect
                label="Area"
                param="area"
                anyLabel={banks.loading ? "Loading areas…" : "All areas"}
                options={areaChoices}
                disabled={banks.loading}
              />
            </>
          )}
        </div>

        {bankFiltersFailed && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>Bank and area filters aren't available right now. You can still search by blood type.</span>
            <Button variant="ghost" className="min-h-11" onClick={banks.reload}>
              Load banks again
            </Button>
          </p>
        )}

        <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-sm text-muted-foreground">{availability.data?.matching ?? ""}</p>
          {hasAnyParam && (
            <Button variant="ghost" className="min-h-11" onClick={clearFilters}>
              Clear filters{activeCount > 0 ? ` (${activeCount})` : ""}
            </Button>
          )}
        </div>
      </section>

      <section
        aria-labelledby="availability-results-heading"
        aria-busy={availability.loading || undefined}
        className="mt-4"
      >
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="availability-results-heading" className="text-lg font-semibold">
            Results
          </h2>
          {availability.data && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <ComputedAt computedAt={availability.data.computedAt} />
              <Button
                variant="secondary"
                className="min-h-11"
                loading={refreshing}
                disabled={availability.loading && !refreshing}
                onClick={refresh}
              >
                Refresh
              </Button>
            </div>
          )}
        </div>
        {/* Always rendered: a live region must exist before its text changes to be announced. */}
        <p aria-live="polite" aria-atomic="true" className="sr-only">
          {availability.data && !availability.loading && !availability.error ? resultsMessage(availability.data) : ""}
        </p>

        <div className="mt-3">
          <Results
            availability={availability}
            refreshing={refreshing}
            canRequest={canRequest}
            hasFilters={hasAnyParam}
            onClearFilters={clearFilters}
          />
        </div>
      </section>
    </>
  );
}

function resultsMessage(data: Availability): string {
  const count = data.items.length;
  if (count === 0) return "No available units match.";
  return count === 1 ? "1 result." : `${count} results.`;
}

function Results({
  availability,
  refreshing,
  canRequest,
  hasFilters,
  onClearFilters,
}: {
  availability: AsyncResult<Availability>;
  refreshing: boolean;
  canRequest: boolean;
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  if (availability.loading && !refreshing) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm font-medium">
          Loading availability…
        </p>
        <Skeleton lines={6} />
      </div>
    );
  }

  if (availability.error) {
    return (
      <ErrorState
        // ErrorState takes strings only; pre-line puts the Reference on its own line.
        className="whitespace-pre-line"
        title="We couldn't load availability"
        description={`${availability.error.message}\nReference: ${availability.error.requestId}`}
        onRetry={availability.reload}
      />
    );
  }

  const data = availability.data;
  if (!data) return null;

  if (data.items.length === 0) {
    return (
      <EmptyState
        title="No available units match."
        description="Try fewer filters."
        action={hasFilters ? { label: "Clear filters", onClick: onClearFilters } : undefined}
      />
    );
  }

  return (
    <>
      <AvailabilityTable rows={data.items} canRequest={canRequest} />
      <AvailabilityCards rows={data.items} canRequest={canRequest} />
    </>
  );
}

function rowKey(row: AvailabilityRow): string {
  return `${row.bank.id}|${row.bloodGroup}|${row.rhesus}|${row.component}`;
}

function RequestLink({ row }: { row: AvailabilityRow }) {
  const query = new URLSearchParams({
    bankId: row.bank.id,
    bloodGroup: row.bloodGroup,
    rhesus: row.rhesus,
    component: row.component,
  });
  const what = `${bloodTypeLabel(row.bloodGroup, row.rhesus)} ${COMPONENT_LABELS[row.component].toLowerCase()}`;
  return (
    <Link to={`/requests/new?${query.toString()}`} className={requestLink} aria-label={`Request ${what} from ${row.bank.name}`}>
      Request units
    </Link>
  );
}

/** md and up. */
function AvailabilityTable({ rows, canRequest }: { rows: AvailabilityRow[]; canRequest: boolean }) {
  const headings = ["Bank", "Group", "Component", "Units available", "Earliest expiry"];
  return (
    <div className="hidden overflow-x-auto rounded-md border border-border md:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Available units by bank, blood type and component</caption>
        <thead className="bg-(--color-surface-sunken)">
          <tr>
            {headings.map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3 font-semibold">
                {heading}
              </th>
            ))}
            {canRequest && (
              <th scope="col" className="px-4 py-3 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-border">
              <td className="px-4 py-3">
                <span className="block font-medium wrap-break-word">{row.bank.name}</span>
                <span className="block text-muted-foreground">{row.bank.area}</span>
              </td>
              <td className="px-4 py-3">{bloodTypeLabel(row.bloodGroup, row.rhesus)}</td>
              <td className="px-4 py-3">{COMPONENT_LABELS[row.component]}</td>
              <td className="px-4 py-3 tabular-nums">{row.availableUnits}</td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.earliestExpiryDate)}</td>
              {canRequest && (
                <td className="px-4 py-3 text-right">
                  <RequestLink row={row} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Below md: one card per row. */
function AvailabilityCards({ rows, canRequest }: { rows: AvailabilityRow[]; canRequest: boolean }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {rows.map((row) => (
        <li key={rowKey(row)} className="rounded-md border border-border bg-surface p-4">
          <h3 className="font-semibold wrap-break-word">{row.bank.name}</h3>
          <p className="text-sm text-muted-foreground)">{row.bank.area}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Group</dt>
            <dd>{bloodTypeLabel(row.bloodGroup, row.rhesus)}</dd>
            <dt className="text-muted-foreground">Component</dt>
            <dd>{COMPONENT_LABELS[row.component]}</dd>
            <dt className="text-muted-foreground">Units available</dt>
            <dd className="tabular-nums">{row.availableUnits}</dd>
            <dt className="text-muted-foreground">Earliest expiry</dt>
            <dd>{formatDate(row.earliestExpiryDate)}</dd>
          </dl>
          {canRequest && (
            <div className="mt-4 [&>a]:w-full">
              <RequestLink row={row} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
