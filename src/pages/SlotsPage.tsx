// SlotsPage (/slots): donation slots at blood banks, with places left. Donors, bank staff, administrator.
// The donor's home page (HomeRedirect).
//
// Donors get their own view (slots/DonorSlotsView): a hero with their next donation, a week of
// days to choose from, and booking. Everything below is the staff list (bank staff, administrator).
//
// - GET /donation-slots, ordered by start time. Filters live in the URL (?bankId&area&from&to):
//     bank   checked against GET /organisations?type=BLOOD_BANK once that list is here.
//     area   chosen from the banks' areas. The contract has no `area` on listDonationSlots yet,
//            so lib/donationQueries listSlotsInArea filters the loaded slots by their bank's
//            area, and the page says so.
//     dates  Lagos dates. `to` is at most 31 days after `from` (contract); lib/donations
//            checkSlotRange says so in the form before anything is sent. A link with a longer
//            range shows the same message and loads nothing.
//   If the bank list fails, the bank and area filters are hidden and ignored, like DashboardPage.
// - Each slot shows its bank, day and time in Lagos time (labelled), and places left as text
//   ("3 of 10 places left"), with computedAt beside the figures.
// - On their own bank's slots (any slot, for the administrator) "View bookings" opens
//   /slots/:slotId with the slot in router state.
// - States: loading, error (+ Try again, Reference), first use, no matches, list.
// - Mock only: "Simulate state" swaps in slots with places left, a full one, a started one, or
//   none, with dates counted from the moment it is picked.

import { Form, Formik, useFormikContext } from "formik";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import * as Yup from "yup";
import { IS_MOCK } from "../api/client";
import { api } from "../api/endpoints";
import type { DonationSlot, DonationSlotList, Organisation } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ComputedAt } from "../components/ComputedAt";
import { FormikField } from "../components/form/FormikField";
import { MockControls } from "../components/MockControls";
import { UrlFilterSelect } from "../components/UrlFilterSelect";
import { useAsync, type AsyncResult } from "../hooks/useAsync";
import { useNow } from "../hooks/useNow";
import { EARLIEST_DATE, LATEST_DATE } from "../lib/dateBounds";
import { areaOptions, listSlotsInArea } from "../lib/donationQueries";
import {
  canCreateSlot,
  canManageSlot,
  checkSlotRange,
  formatLagosDay,
  isIsoDate,
  placesLeftLabel,
  slotTimeRangeLabel,
  slotWhenLabel,
} from "../lib/donations";
import type { LabelOption } from "../lib/labels";
import { SLOT_LIST_SIMULATION_LABELS, simulateSlots, type SlotListSimulation } from "../lib/mockSimulation";
import { viewerOf } from "../lib/requestActions";
import { DonorSlotsView } from "./slots/DonorSlotsView";
import type { SlotDetailState } from "./SlotDetailPage";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { EmptyState } from "../shared/ui/empty-state";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";

// Before the bank list arrives we can't check ?bankId against it, so only pass a well-formed id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const secondaryLink = cn(
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium",
  "border border-(--color-border-input) bg-(--color-surface) text-(--color-text) hover:bg-(--color-surface-hover)",
  focusRing,
);

const primaryLink = cn(
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium",
  "bg-(--color-primary) text-(--color-on-primary) hover:bg-(--color-primary-hover)",
  focusRing,
);

// "This slot has started" must not wait long to become true while the page is open.
const CLOCK_TICK_MS = 30_000;

type RangeValues = { from: string; to: string };
const RANGE_FIELDS = ["from", "to"] as const satisfies readonly (keyof RangeValues)[];

function rangeSchema(now: () => number) {
  return Yup.object({
    from: Yup.string().test("date", "Enter the first day as a full date.", (value) => !value || isIsoDate(value)),
    to: Yup.string()
      .test("date", "Enter the last day as a full date.", (value) => !value || isIsoDate(value))
      .test("range", "Choose a shorter date range.", function (value) {
        const from: unknown = this.parent?.from;
        const problem = checkSlotRange(typeof from === "string" && isIsoDate(from) ? from : "", value ?? "", now());
        return problem ? this.createError({ message: problem }) : true;
      }),
  });
}

// Reads the clock on each check, so "today" is never stale while the page stays open.
const RANGE_SCHEMA = rangeSchema(Date.now);

function bankOptions(banks: readonly Organisation[]): LabelOption<string>[] {
  return banks.map((bank) => ({ value: bank.id, label: bank.name }));
}

export default function SlotsPage() {
  const { session } = useAuth();
  return viewerOf(session).role === "DONOR" ? <DonorSlotsView /> : <StaffSlotsView />;
}

function StaffSlotsView() {
  const { session } = useAuth();
  const viewer = viewerOf(session);
  const now = useNow(CLOCK_TICK_MS);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const banks = useAsync(
    (signal) => api.listOrganisations({ type: "BLOOD_BANK" }, signal).then((res) => res.data.items),
    [],
  );
  const filtersFailed = !banks.loading && banks.error !== null && banks.data === null;
  const bankChoices = bankOptions(banks.data ?? []);
  const areaChoices = areaOptions(banks.data ?? []);

  // ?bankId and ?area: checked against the bank list once it's here; passed through while it
  // loads (so a shared link doesn't load twice); ignored when the list failed.
  const bankParam = searchParams.get("bankId");
  const areaParam = searchParams.get("area");
  let bankId: string | undefined;
  let area: string | undefined;
  if (banks.data) {
    bankId = bankChoices.find((option) => option.value === bankParam)?.value;
    area = areaChoices.find((option) => option.value.toLowerCase() === areaParam?.trim().toLowerCase())?.value;
  } else if (banks.loading) {
    bankId = bankParam && UUID.test(bankParam) ? bankParam : undefined;
    area = areaParam?.trim() || undefined;
  }

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = isIsoDate(fromParam) ? fromParam : undefined;
  const to = isIsoDate(toParam) ? toParam : undefined;
  const rangeProblem = checkSlotRange(from ?? "", to ?? "", now);
  const hasFilter = Boolean(bankId || area || from || to);

  const slots = useAsync(
    (signal) => (rangeProblem ? Promise.resolve(null) : listSlotsInArea({ bankId, from, to }, area, signal)),
    [bankId, area, from, to, rangeProblem],
  );

  // Mock only: the simulation picked, and when (its dates count from then).
  const [simulated, setSimulated] = useState<{ state: SlotListSimulation; at: number } | null>(null);
  function pickSimulation(next: SlotListSimulation | null) {
    setSimulated(next && { state: next, at: Date.now() });
  }
  const data = slots.data && IS_MOCK && simulated ? simulateSlots(simulated.state, simulated.at) : slots.data;

  function clearFilters() {
    setSearchParams({});
  }

  function setRange(values: RangeValues) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const field of RANGE_FIELDS) {
        if (values[field]) next.set(field, values[field]);
        else next.delete(field);
      }
      return next;
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Donation slots</h1>
        {canCreateSlot(viewer) && (
          <Link to="/slots/new" className={primaryLink}>
            New slot
          </Link>
        )}
      </div>
      <p className="mt-2 text-muted-foreground">
        Times are Lagos time. Without dates, the next 14 days show.
      </p>
      <MockControls
        className="mt-4"
        simulation={{ value: simulated?.state ?? null, onChange: pickSimulation, labels: SLOT_LIST_SIMULATION_LABELS }}
      />

      <section aria-labelledby="slot-filters-heading" className="mt-6">
        <h2 id="slot-filters-heading" className="sr-only">
          Filters
        </h2>
        {filtersFailed ? (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>The bank and area filters aren't available right now. Showing every bank.</span>
            <Button variant="ghost" className="min-h-11" onClick={banks.reload}>
              Load banks again
            </Button>
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <UrlFilterSelect
              label="Bank"
              param="bankId"
              anyLabel={banks.loading ? "Loading banks…" : "All banks"}
              options={bankChoices}
              disabled={banks.loading}
            />
            <div className="flex flex-col gap-1.5">
              <UrlFilterSelect
                label="Area"
                param="area"
                anyLabel={banks.loading ? "Loading areas…" : "All areas"}
                options={areaChoices}
                disabled={banks.loading}
              />
              <p className="text-sm text-muted-foreground">Matched here against each slot's bank.</p>
            </div>
          </div>
        )}

        <SlotDateRange from={from ?? ""} to={to ?? ""} problem={rangeProblem} onSubmit={setRange} />

        <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* Always rendered: a live region must exist before its text changes to be announced. */}
          <p aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">
            {data && !slots.loading ? showingMessage(data) : ""}
          </p>
          {hasFilter && (
            <Button variant="ghost" className="min-h-11" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </section>

      <section aria-labelledby="slot-results-heading" aria-busy={slots.loading || undefined} className="mt-4">
        <h2 id="slot-results-heading" className="sr-only">
          Slots
        </h2>
        <Results
          slots={slots}
          data={data}
          rangeProblem={rangeProblem}
          hasFilter={hasFilter}
          onNewSlot={canCreateSlot(viewer) ? () => navigate("/slots/new") : undefined}
          canManage={(slot) => canManageSlot(slot, viewer)}
          onClearFilters={clearFilters}
        />
      </section>

    </>
  );
}

function showingMessage(data: DonationSlotList): string {
  if (data.items.length === 0) return "No slots to show.";
  return data.items.length === 1 ? "Showing 1 slot" : `Showing ${data.items.length} slots`;
}

/** First and last day, as Lagos dates. Sent to the URL only once the 31-day rule holds. */
function SlotDateRange({
  from,
  to,
  problem,
  onSubmit,
}: {
  from: string;
  to: string;
  /** Why the range in the URL can't be sent; shown on the last day field. */
  problem: string | null;
  onSubmit: (values: RangeValues) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Formik<RangeValues>
      initialValues={{ from, to }}
      initialErrors={problem ? { to: problem } : {}}
      initialTouched={problem ? { to: true } : {}}
      enableReinitialize
      validationSchema={RANGE_SCHEMA}
      onSubmit={(values) => onSubmit(values)}
    >
      {() => (
        <Form ref={formRef} noValidate aria-label="Dates" className="mt-4 grid gap-4 sm:grid-cols-2 sm:items-start">
          <FocusFirstError formRef={formRef} />
          <FormikField
            name="from"
            label="First day"
            type="date"
            min={EARLIEST_DATE}
            max={LATEST_DATE}
            hint="Lagos date. Empty means today."
          />
          <FormikField
            name="to"
            label="Last day"
            type="date"
            min={EARLIEST_DATE}
            max={LATEST_DATE}
            hint="Lagos date, up to 31 days after the first."
          />
          {/* Its own row, so hints and errors of any length never push it out of line. */}
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" className="min-h-11">
              Show slots
            </Button>
          </div>
        </Form>
      )}
    </Formik>
  );
}

/** After each submit attempt, move focus to the first invalid field. */
function FocusFirstError({ formRef }: { formRef: RefObject<HTMLFormElement | null> }) {
  const { submitCount, isSubmitting, errors } = useFormikContext<RangeValues>();
  const handledCount = useRef(0);

  useEffect(() => {
    if (isSubmitting || submitCount === handledCount.current) return;
    handledCount.current = submitCount;
    const first = RANGE_FIELDS.find((f) => errors[f]);
    const el = first ? formRef.current?.elements.namedItem(first) : null;
    if (el instanceof HTMLElement) el.focus();
  }, [submitCount, isSubmitting, errors, formRef]);

  return null;
}

function Results({
  slots,
  data,
  rangeProblem,
  hasFilter,
  onNewSlot,
  canManage,
  onClearFilters,
}: {
  slots: AsyncResult<DonationSlotList | null>;
  /** The list as the screen shows it (simulated in the mock). */
  data: DonationSlotList | null;
  rangeProblem: string | null;
  hasFilter: boolean;
  /** Bank staff only: the first-use action. */
  onNewSlot?: () => void;
  /** The slot's bank or the administrator: they get "View bookings". */
  canManage: (slot: DonationSlot) => boolean;
  onClearFilters: () => void;
}) {
  if (rangeProblem) {
    return (
      <EmptyState
        title="Choose other dates"
        description={rangeProblem}
        action={{ label: "Clear filters", onClick: onClearFilters }}
      />
    );
  }

  if (slots.loading) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm font-medium">
          Loading slots…
        </p>
        <Skeleton lines={6} />
      </div>
    );
  }

  if (slots.error) {
    return (
      <ErrorState
        // ErrorState takes strings only; pre-line puts the Reference on its own line.
        className="whitespace-pre-line"
        title="We couldn't load the donation slots"
        description={`${slots.error.message}\nReference: ${slots.error.requestId}`}
        onRetry={slots.reload}
      />
    );
  }

  if (!data) return null;

  if (data.items.length === 0) {
    if (hasFilter) {
      return (
        <EmptyState
          title="No slots match these filters"
          description="Try another bank, area or dates, or clear the filters to see every slot."
          action={{ label: "Clear filters", onClick: onClearFilters }}
        />
      );
    }
    return (
      <EmptyState
        title="No donation slots yet"
        description="No bank has opened a slot in the next 14 days."
        action={onNewSlot ? { label: "Open a slot", onClick: onNewSlot } : undefined}
      />
    );
  }

  return (
    <>
      <ComputedAt computedAt={data.computedAt} />
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((slot) => (
          <SlotCard key={slot.id} slot={slot} manageable={canManage(slot)} />
        ))}
      </ul>
    </>
  );
}

function SlotCard({ slot, manageable }: { slot: DonationSlot; manageable: boolean }) {
  return (
    <li className="flex min-w-0 flex-col rounded-md border border-border bg-surface p-4">
      <h3 className="font-semibold wrap-break-word">{slot.bank.name}</h3>
      <p className="text-sm text-muted-foreground wrap-break-word">{slot.bank.area}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Day</dt>
        <dd className="min-w-0">
          <time dateTime={slot.startsAt}>{formatLagosDay(slot.startsAt)}</time>
        </dd>
        <dt className="text-muted-foreground">Time</dt>
        <dd className="min-w-0 tabular-nums">{slotTimeRangeLabel(slot)}</dd>
        <dt className="text-muted-foreground">Places</dt>
        <dd className="min-w-0 font-medium">{placesLeftLabel(slot)}</dd>
      </dl>
      {manageable && (
        <div className="mt-auto pt-4">
          {/* The slot travels in router state: the contract has no GET /donation-slots/{id} yet. */}
          <Link
            to={`/slots/${encodeURIComponent(slot.id)}`}
            state={{ slot } satisfies SlotDetailState}
            className={secondaryLink}
            aria-label={`View bookings: ${slot.bank.name}, ${slotWhenLabel(slot)}`}
          >
            View bookings
          </Link>
        </div>
      )}
    </li>
  );
}
