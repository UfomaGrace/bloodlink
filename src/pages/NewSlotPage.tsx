// NewSlotPage (/slots/new): bank staff open a donation slot at their own bank.
//
// - Date, start time, end time (Lagos time) and capacity. The Yup schema is built from
//   lib/validation.ts so it matches the contract's DonationSlotCreate: the start is in the future,
//   the end is after the start and at most 8 hours later, capacity is a whole number 1–50.
//   The end is on the same date as the start: a slot past midnight can't be entered here.
// - The times are turned into instants with Lagos's fixed +01:00 offset (lib/donations
//   lagosDateTimeToIso; Lagos has no daylight saving). The bank comes from the token.
// - POST /donation-slots → success panel with the slot the service sent back.
// - 422 VALIDATION_FAILED: details for startsAt / endsAt / capacity go on the start time, end time
//   and capacity fields; anything else is listed in the FormAlert.
// - Every other error shows in a FormAlert (role="alert", message, "Reference: …").
//
// Why a lost connection is handled the way it is: createDonationSlot takes no Idempotency-Key
// and the contract says each call opens a new slot. If the first request reached the service and
// only its answer was lost, sending it again would open a second, duplicate slot. So we never
// resubmit by ourselves (and submit is disabled while a request is in flight). Instead we read
// this bank's slots for that date and look for one with the same start and end:
//   found     → "It was created", with the slot.
//   not found → "It wasn't created", and the form stays filled in so they can try again.
//   the read fails too → we say we can't tell, and point to the slot list.
// A slot with the same times that existed before this attempt would also count as found; that is
// the same slot as far as donors are concerned, so saying "it exists" is still true.

import { Form, Formik, useFormikContext, type FormikHelpers } from "formik";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import * as Yup from "yup";
import { ApiError, toApiError } from "../api/client";
import { api } from "../api/endpoints";
import { userOrganisation, type DonationSlot, type DonationSlotCreate, type FieldIssue } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { applyApiError } from "../components/form/applyApiError";
import { FormAlert } from "../components/form/FormAlert";
import { FormikField } from "../components/form/FormikField";
import { useNow } from "../hooks/useNow";
import { lagosToday } from "../lib/expiry";
import {
  findSlotWithTimes,
  formatLagosDay,
  lagosDateTimeToIso,
  MAX_SLOT_CAPACITY,
  placesLeftLabel,
  slotTimeRangeLabel,
  slotWhenLabel,
} from "../lib/donations";
import { slotCapacity, slotDate, slotEndTime, slotStartTime } from "../lib/validation";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";

type SlotFormValues = { date: string; startTime: string; endTime: string; capacity: string };

const SLOT_FIELDS = ["date", "startTime", "endTime", "capacity"] as const satisfies readonly (keyof SlotFormValues)[];

// The contract's field names (in 422 details) → the form field that shows the problem.
const FIELD_FOR_DETAIL: Readonly<Record<string, keyof SlotFormValues>> = {
  startsAt: "startTime",
  endsAt: "endTime",
  capacity: "capacity",
};

const slotSchema = Yup.object({
  date: slotDate(),
  startTime: slotStartTime(),
  endTime: slotEndTime(),
  capacity: slotCapacity(),
});

const initialValues: SlotFormValues = { date: "", startTime: "", endTime: "", capacity: "" };

function toSlotCreate(values: SlotFormValues): DonationSlotCreate | null {
  const startsAt = lagosDateTimeToIso(values.date, values.startTime);
  const endsAt = lagosDateTimeToIso(values.date, values.endTime);
  const capacity = Number(values.capacity);
  if (!startsAt || !endsAt || !Number.isInteger(capacity)) return null;
  return { startsAt, endsAt, capacity };
}

/** The outcome shown above the form when it isn't a plain success. */
type SubmitProblem =
  | { kind: "plain"; error: ApiError; issues: FieldIssue[] }
  | { kind: "notCreated"; error: ApiError; when: string }
  | { kind: "unknown"; error: ApiError; listPath: string };

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

// A Link that looks like the shared secondary Button, at least 44px tall.
const secondaryLink = cn(
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium",
  "border border-(--color-border-input) bg-(--color-surface) text-(--color-text) hover:bg-(--color-surface-hover)",
  focusRing,
);

/** /slots narrowed to one bank and one Lagos date. */
function slotListPath(bankId: string | undefined, date: string): string {
  const params = new URLSearchParams({ from: date, to: date });
  if (bankId) params.set("bankId", bankId);
  return `/slots?${params.toString()}`;
}

export default function NewSlotPage() {
  const { session } = useAuth();
  const bankId = session ? userOrganisation(session.user)?.id : undefined;
  // For the date picker's earliest day; the schema reads the clock itself on each check.
  const now = useNow(60_000);
  const [created, setCreated] = useState<{ slot: DonationSlot; afterLostConnection: boolean } | null>(null);
  const [problem, setProblem] = useState<SubmitProblem | null>(null);
  const [checking, setChecking] = useState(false);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Formik doesn't stop a second submit on its own (e.g. Enter pressed twice quickly).
  const inFlight = useRef(false);
  // Set by "Open another slot", so focus goes to the first field once the form is back.
  const focusFormNext = useRef(false);

  useEffect(() => {
    if (created) {
      successHeadingRef.current?.focus();
    } else if (focusFormNext.current) {
      focusFormNext.current = false;
      const first = formRef.current?.elements.namedItem("date");
      if (first instanceof HTMLElement) first.focus();
    }
  }, [created]);

  async function handleSubmit(values: SlotFormValues, helpers: FormikHelpers<SlotFormValues>) {
    const body = toSlotCreate(values);
    if (!body || inFlight.current) return;
    inFlight.current = true;
    setProblem(null);

    try {
      const res = await api.createDonationSlot(body);
      setCreated({ slot: res.data, afterLostConnection: false });
    } catch (e) {
      const error = toApiError(e);
      if (error.isConnectionProblem) await checkAfterLostConnection(error, body, values.date);
      else handleRefusal(error, helpers);
    } finally {
      inFlight.current = false;
    }
  }

  // Never resubmit (see the top of this file): read this bank's slots for the date and look.
  async function checkAfterLostConnection(error: ApiError, body: DonationSlotCreate, date: string) {
    setChecking(true);
    try {
      if (!bankId) throw new Error("No bank on the session to check against.");
      const day = lagosToday(Date.parse(body.startsAt));
      const { data } = await api.listDonationSlots({ bankId, from: day, to: day });
      const found = findSlotWithTimes(data.items, body.startsAt, body.endsAt);
      if (found) setCreated({ slot: found, afterLostConnection: true });
      else setProblem({ kind: "notCreated", error, when: slotWhenLabel(body) });
    } catch {
      setProblem({ kind: "unknown", error, listPath: slotListPath(bankId, date) });
    } finally {
      setChecking(false);
    }
  }

  function handleRefusal(error: ApiError, helpers: FormikHelpers<SlotFormValues>) {
    if (error.code === "VALIDATION_FAILED") {
      const onForm = new ApiError({
        ...error,
        details: error.details.map((d) => ({ ...d, field: FIELD_FOR_DETAIL[d.field] ?? d.field })),
      });
      const issues = applyApiError(onForm, SLOT_FIELDS, helpers.setFieldError);
      setProblem({ kind: "plain", error, issues });
      return;
    }
    // FORBIDDEN, MALFORMED_REQUEST, INTERNAL_ERROR, …: the message is written for users.
    setProblem({ kind: "plain", error, issues: [] });
  }

  function openAnother() {
    focusFormNext.current = true;
    setProblem(null);
    setCreated(null);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">New donation slot</h1>

      {created ? (
        <SuccessPanel
          slot={created.slot}
          afterLostConnection={created.afterLostConnection}
          headingRef={successHeadingRef}
          onOpenAnother={openAnother}
        />
      ) : (
        <>
          <p className="mt-2 text-muted-foreground">
            Open a time at your bank that donors can book. Times are Lagos time.
          </p>
          {/* Always rendered, so the check after a lost connection is announced. */}
          <p role="status" className="mt-1 min-h-5 text-sm text-muted-foreground">
            {checking ? "We lost the connection. Checking whether the slot was created…" : ""}
          </p>

          {problem && <ProblemAlert problem={problem} />}

          <Formik<SlotFormValues> initialValues={initialValues} validationSchema={slotSchema} onSubmit={handleSubmit}>
            {({ isSubmitting, isValidating }) => {
              const busy = (isSubmitting && !isValidating) || checking;
              return (
                <Form ref={formRef} noValidate className="mt-6 flex flex-col gap-5">
                  <FocusFirstError formRef={formRef} />
                  <FormikField name="date" label="Date" type="date" min={lagosToday(now)} hint="Lagos date." required />

                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormikField
                      name="startTime"
                      label="Start time"
                      type="time"
                      hint="Lagos time, 24-hour."
                      hintPlacement="below"
                      required
                    />
                    <FormikField
                      name="endTime"
                      label="End time"
                      type="time"
                      hint="Same day, at most 8 hours after the start."
                      hintPlacement="below"
                      required
                    />
                  </div>

                  <FormikField
                    name="capacity"
                    label="Places"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_SLOT_CAPACITY}
                    step={1}
                    hint={`How many donors can book, 1 to ${MAX_SLOT_CAPACITY}.`}
                    className="sm:max-w-xs"
                    required
                  />

                  {/* Disabled while in flight (a second request could open a second slot). loading sets
                      aria-disabled and ignores clicks but keeps focus on the button; inFlight also stops Enter. */}
                  <Button type="submit" size="lg" loading={busy} className="min-h-11 self-start">
                    {busy ? "Opening slot…" : "Open slot"}
                  </Button>
                </Form>
              );
            }}
          </Formik>
        </>
      )}
    </div>
  );
}

function ProblemAlert({ problem }: { problem: SubmitProblem }) {
  if (problem.kind === "notCreated") {
    return (
      <FormAlert
        className="mt-6"
        error={problem.error}
        title="It wasn't created."
        message={`We lost the connection before the service answered. Your bank's slots don't show one on ${problem.when}, so it wasn't created. You can try again.`}
      />
    );
  }

  if (problem.kind === "unknown") {
    return (
      <FormAlert
        className="mt-6"
        error={problem.error}
        title="We can't tell whether it was created."
        message="We lost the connection, and couldn't check your bank's slots either. Check the slot list before trying again, so you don't open it twice."
      >
        <Link to={problem.listPath} className={cn(secondaryLink, "mt-3")}>
          Check your bank's slots
        </Link>
      </FormAlert>
    );
  }

  return <FormAlert className="mt-6" error={problem.error} issues={problem.issues} />;
}

/** After each submit attempt (client or server errors), move focus to the first invalid field. */
function FocusFirstError({ formRef }: { formRef: RefObject<HTMLFormElement | null> }) {
  const { submitCount, isSubmitting, errors } = useFormikContext<SlotFormValues>();
  const handledCount = useRef(0);

  useEffect(() => {
    if (isSubmitting || submitCount === handledCount.current) return;
    handledCount.current = submitCount;
    const first = SLOT_FIELDS.find((f) => errors[f]);
    const el = first ? formRef.current?.elements.namedItem(first) : null;
    if (el instanceof HTMLElement) el.focus();
  }, [submitCount, isSubmitting, errors, formRef]);

  return null;
}

function SuccessPanel({
  slot,
  afterLostConnection,
  headingRef,
  onOpenAnother,
}: {
  slot: DonationSlot;
  afterLostConnection: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onOpenAnother: () => void;
}) {
  const details: { term: string; value: ReactNode }[] = [
    { term: "Bank", value: slot.bank.name },
    { term: "Day", value: <time dateTime={slot.startsAt}>{formatLagosDay(slot.startsAt)}</time> },
    { term: "Time", value: slotTimeRangeLabel(slot) },
    { term: "Places", value: placesLeftLabel(slot) },
  ];

  return (
    <section
      aria-labelledby="slot-created-heading"
      className="mt-6 rounded-md border border-l-4 border-border border-l-success bg-surface p-5"
    >
      <h2
        id="slot-created-heading"
        ref={headingRef}
        tabIndex={-1}
        className={cn("flex items-start gap-2 rounded-sm text-xl font-semibold wrap-break-word", focusRing)}
      >
        <CheckCircle2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-success" />
        <span className="min-w-0">{afterLostConnection ? "It was created" : "Slot opened"}</span>
      </h2>
      {/* The heading takes focus; this says what it means without needing the heading read twice. */}
      <p role="status" className="mt-2 text-sm">
        {afterLostConnection
          ? "We lost the connection, but your bank's slots now show this one, so it was created. We didn't send it again."
          : "Donors can now book it."}
      </p>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {details.map(({ term, value }) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="min-w-0 wrap-break-word font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" className="min-h-11" onClick={onOpenAnother}>
          Open another slot
        </Button>
        <Link to={slotListPath(slot.bank.id, lagosToday(Date.parse(slot.startsAt)))} className={secondaryLink}>
          View your bank's slots that day
        </Link>
      </div>
    </section>
  );
}
