// UnitsPage (/units): the bank's units, soonest expiry first. Bank staff and the administrator.
//
// - Filters (state, blood group, rhesus, component) and the page number live in the URL
//   (?state=AVAILABLE&page=2), so a refresh, Back, or a shared link shows the same list.
//   Changing a filter drops ?page, so you start again at the first page of the new results.
// - Values from the URL are checked against the label maps; anything unknown is ignored.
// - useAsync re-runs GET /units when a filter or the page changes and aborts the old request.
// - States: loading, error (+ Retry), empty (no units yet / no matches), list.
// - Wide screens get a table; phones get stacked cards. Both read from the same data.

import { Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../api/endpoints";
import type { Unit, UnitPage } from "../api/types";
import { useAuth } from "../auth/AuthContext";
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
  RHESUS_LABELS,
  RHESUS_OPTIONS,
  type LabelOption,
  UNIT_STATE_LABELS,
  UNIT_STATE_OPTIONS,
  UNIT_STATE_TONES,
} from "../lib/labels";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { EmptyState } from "../shared/ui/empty-state";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";
import { StatusBadge } from "../shared/ui/status-badge";

const PAGE_SIZE = 20;

type FilterKey = "state" | "bloodGroup" | "rhesus" | "component";

type FilterConfig = {
  key: FilterKey;
  label: string;
  anyLabel: string;
  options: readonly LabelOption<string>[];
};

// One entry per filter: its URL key, visible label, the "any" wording and its options.
const FILTERS: readonly FilterConfig[] = [
  { key: "state", label: "State", anyLabel: "All states", options: UNIT_STATE_OPTIONS },
  { key: "bloodGroup", label: "Blood group", anyLabel: "All groups", options: BLOOD_GROUP_OPTIONS },
  { key: "rhesus", label: "Rhesus type", anyLabel: "Both types", options: RHESUS_OPTIONS },
  { key: "component", label: "Component", anyLabel: "All components", options: COMPONENT_OPTIONS },
];

/** Read the filters from the URL, keeping only values the contract knows. */
function readFilters(params: URLSearchParams) {
  const state = params.get("state");
  const bloodGroup = params.get("bloodGroup");
  const rhesus = params.get("rhesus");
  const component = params.get("component");
  return {
    state: isKeyOf(UNIT_STATE_LABELS, state) ? state : undefined,
    bloodGroup: isKeyOf(BLOOD_GROUP_LABELS, bloodGroup) ? bloodGroup : undefined,
    rhesus: isKeyOf(RHESUS_LABELS, rhesus) ? rhesus : undefined,
    component: isKeyOf(COMPONENT_LABELS, component) ? component : undefined,
  };
}

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

export default function UnitsPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canRecord = role === "BANK_STAFF";

  const filters = readFilters(searchParams);
  const page = readPage(searchParams);
  const activeCount = Object.values(filters).filter(Boolean).length;

  const { state, bloodGroup, rhesus, component } = filters;
  const units = useAsync(
    (signal) =>
      api.listUnits({ state, bloodGroup, rhesus, component, page, size: PAGE_SIZE }, signal).then((res) => res.data),
    [state, bloodGroup, rhesus, component, page],
  );

  function clearFilters() {
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
        <h1 className="text-2xl font-semibold tracking-tight">Units</h1>
        {canRecord && (
          <Link to="/units/new" className={primaryLink}>
            Record unit
          </Link>
        )}
      </div>
      <p className="mt-2 text-muted-foreground">Soonest expiry first.</p>

      <section aria-labelledby="unit-filters-heading" className="mt-6">
        <h2 id="unit-filters-heading" className="sr-only">
          Filters
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FILTERS.map((filter) => (
            <UrlFilterSelect
              key={filter.key}
              label={filter.label}
              param={filter.key}
              anyLabel={filter.anyLabel}
              options={filter.options}
            />
          ))}
        </div>
        <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* Always rendered: a live region must exist before its text changes to be announced. */}
          <p aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">
            {units.data && !units.loading ? showingMessage(units.data) : ""}
          </p>
          {activeCount > 0 && (
            <Button variant="ghost" className="min-h-11" onClick={clearFilters}>
              Clear filters ({activeCount})
            </Button>
          )}
        </div>
      </section>

      <section aria-labelledby="unit-results-heading" aria-busy={units.loading || undefined} className="mt-4">
        <h2 id="unit-results-heading" className="sr-only">
          Results
        </h2>
        <Results
          units={units}
          hasFilters={activeCount > 0}
          canRecord={canRecord}
          onRecord={() => navigate("/units/new")}
          onClearFilters={clearFilters}
          onPage={goToPage}
        />
      </section>
    </>
  );
}

function showingMessage(data: UnitPage): string {
  if (data.totalItems === 0 || data.items.length === 0) return "No units to show.";
  const from = data.page * data.size + 1;
  const to = data.page * data.size + data.items.length;
  return `Showing ${from}–${to} of ${data.totalItems}`;
}

function Results({
  units,
  hasFilters,
  canRecord,
  onRecord,
  onClearFilters,
  onPage,
}: {
  units: AsyncResult<UnitPage>;
  hasFilters: boolean;
  canRecord: boolean;
  onRecord: () => void;
  onClearFilters: () => void;
  onPage: (page: number) => void;
}) {
  if (units.loading) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm font-medium">
          Loading units…
        </p>
        <Skeleton lines={6} />
      </div>
    );
  }

  if (units.error) {
    return (
      <ErrorState
        // ErrorState takes strings only; pre-line puts the Reference on its own line.
        className="whitespace-pre-line"
        title="We couldn't load the units"
        description={`${units.error.message}\nReference: ${units.error.requestId}`}
        onRetry={units.reload}
      />
    );
  }

  const data = units.data;
  if (!data) return null;

  if (data.items.length === 0) {
    if (data.totalItems > 0) {
      // ?page points past the end (e.g. an old link after units were issued).
      return (
        <EmptyState
          title="This page is empty"
          description={`There are ${data.totalItems} units, but none on this page.`}
          action={{ label: "Go to the first page", onClick: () => onPage(0) }}
        />
      );
    }
    if (hasFilters) {
      return (
        <EmptyState
          title="No units match these filters"
          description="Try a different state, group or component, or clear the filters to see every unit."
          action={{ label: "Clear filters", onClick: onClearFilters }}
        />
      );
    }
    return (
      <EmptyState
        title="No units recorded yet"
        description={
          canRecord ? "Record the first unit your bank receives and it will show here." : "No bank has recorded any units yet."
        }
        action={canRecord ? { label: "Record unit", onClick: onRecord } : undefined}
      />
    );
  }

  const lastPage = Math.max(0, Math.ceil(data.totalItems / data.size) - 1);

  return (
    <>
      <UnitTable units={data.items} />
      <UnitCards units={data.items} />

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

function StateBadge({ unit }: { unit: Unit }) {
  return <StatusBadge tone={UNIT_STATE_TONES[unit.state]}>{UNIT_STATE_LABELS[unit.state]}</StatusBadge>;
}

/** md and up. */
function UnitTable({ units }: { units: Unit[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-md border border-border md:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Units, soonest expiry first</caption>
        <thead className="bg-(--color-surface-sunken)">
          <tr>
            {["Reference", "Blood type", "Component", "Collected", "Expires", "State"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3 font-semibold">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <tr key={unit.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium wrap-break-word">{unit.reference}</td>
              <td className="px-4 py-3">{bloodTypeLabel(unit.bloodGroup, unit.rhesus)}</td>
              <td className="px-4 py-3">{COMPONENT_LABELS[unit.component]}</td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDate(unit.collectionDate)}</td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDate(unit.expiryDate)}</td>
              <td className="px-4 py-3">
                <StateBadge unit={unit} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Below md: one card per unit. */
function UnitCards({ units }: { units: Unit[] }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {units.map((unit) => (
        <li key={unit.id} className="rounded-md border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 font-semibold wrap-break-word">{unit.reference}</h3>
            <StateBadge unit={unit} />
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Blood type</dt>
            <dd>{bloodTypeLabel(unit.bloodGroup, unit.rhesus)}</dd>
            <dt className="text-muted-foreground">Component</dt>
            <dd>{COMPONENT_LABELS[unit.component]}</dd>
            <dt className="text-muted-foreground">Collected</dt>
            <dd>{formatDate(unit.collectionDate)}</dd>
            <dt className="text-muted-foreground">Expires</dt>
            <dd>{formatDate(unit.expiryDate)}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
