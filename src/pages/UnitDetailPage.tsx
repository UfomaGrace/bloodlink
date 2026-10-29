// UnitDetailPage (/units/:unitId): one unit, its details and its history. Bank staff and the administrator.
//
// - GET /units/{id}. Staff of another bank get 404 (the service hides other banks' units) and
//   hospitals 403, so both show "Unit not found" with a link back to Units.
// - Expiry is counted in Lagos calendar days (lib/expiry): "in 3 days", "today" (still usable),
//   "expired" from the day after.
// - History is newest first, so the latest change is at the top.
// - The contract doesn't say which request a unit is reserved or issued for, so there is no link to one.
// - States: loading, error (+ Try again, Reference), not found, details.

import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api/endpoints";
import { HistoryList } from "../components/HistoryList";
import { useAsync } from "../hooks/useAsync";
import { daysUntilExpiry, isUnitExpired } from "../lib/expiry";
import {
  bloodTypeLabel,
  COMPONENT_LABELS,
  formatDate,
  formatDateTime,
  UNIT_STATE_LABELS,
  UNIT_STATE_TONES,
} from "../lib/labels";
import { cn } from "../shared/cn";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";
import { StatusBadge } from "../shared/ui/status-badge";

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const backLink = cn(
  "inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-(--color-primary) underline underline-offset-2",
  focusRing,
);

/** "expired", "today", "in 1 day", "in 12 days". Not a date → "". */
function expiryNote(expiryDate: string, now: number): string {
  if (isUnitExpired(expiryDate, now)) return "expired";
  const days = daysUntilExpiry(expiryDate, now);
  if (Number.isNaN(days)) return "";
  if (days === 0) return "today";
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

export default function UnitDetailPage() {
  const { unitId = "" } = useParams();
  return <UnitDetail key={unitId} unitId={unitId} />;
}

function UnitDetail({ unitId }: { unitId: string }) {
  const loaded = useAsync((signal) => api.getUnit(unitId, signal).then((res) => res.data), [unitId]);
  // Expiry wording is worked out once, when the page opens.
  const [now] = useState(() => Date.now());
  const unit = loaded.data;

  if (!unit) {
    if (loaded.error?.status === 404 || loaded.error?.status === 403) {
      return (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Unit not found</h1>
          <p className="mt-2 text-muted-foreground">It may have been removed, or it belongs to another bank.</p>
          <Link to="/units" className={cn(backLink, "mt-4")}>
            Back to units
          </Link>
        </>
      );
    }

    return (
      <>
        <Link to="/units" className={backLink}>
          <span aria-hidden="true">←&nbsp;</span>All units
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Unit details</h1>
        <div className="mt-6" aria-busy={loaded.loading || undefined}>
          {loaded.error ? (
            <ErrorState
              // ErrorState takes strings only; pre-line puts the Reference on its own line.
              className="whitespace-pre-line"
              title="We couldn't load this unit"
              description={`${loaded.error.message}\nReference: ${loaded.error.requestId}`}
              onRetry={loaded.reload}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <p role="status" className="text-sm font-medium">
                Loading unit…
              </p>
              <Skeleton lines={8} />
            </div>
          )}
        </div>
      </>
    );
  }

  const badge = <StatusBadge tone={UNIT_STATE_TONES[unit.state]}>{UNIT_STATE_LABELS[unit.state]}</StatusBadge>;
  const note = expiryNote(unit.expiryDate, now);

  return (
    <>
      <Link to="/units" className={backLink}>
        <span aria-hidden="true">←&nbsp;</span>All units
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight wrap-break-word">Unit {unit.reference}</h1>
        {badge}
      </div>

      <section aria-labelledby="details-heading" className="mt-6">
        <h2 id="details-heading" className="text-lg font-semibold">
          Details
        </h2>
        <div className="mt-3">
          <DetailList
            details={[
              { term: "Reference", value: unit.reference },
              { term: "State", value: badge },
              { term: "Blood type", value: bloodTypeLabel(unit.bloodGroup, unit.rhesus) },
              { term: "Component", value: COMPONENT_LABELS[unit.component] },
              { term: "Collected", value: <time dateTime={unit.collectionDate}>{formatDate(unit.collectionDate)}</time> },
              {
                term: "Expires",
                value: (
                  <>
                    <time dateTime={unit.expiryDate}>{formatDate(unit.expiryDate)}</time>
                    {note && ` (${note})`}
                  </>
                ),
              },
              { term: "Bank", value: unit.bank.name },
              { term: "Recorded", value: <time dateTime={unit.recordedAt}>{formatDateTime(unit.recordedAt)}</time> },
            ]}
          />
        </div>
      </section>

      <HistoryList history={unit.history} order="newest" />
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
