// NewSlotPage (/slots/new): bank staff open a donation slot at their own bank.
//
// - Date, start time, end time (Lagos time) and capacity. The Yup schema is built from
//   lib/validation.ts so it matches the contract's DonationSlotCreate: the start is in the future,
//   the end is after the start and at most 8 hours later, capacity is a whole number 1–50.
//   The end is on the same date as the start: a slot past midnight can't be entered here.
// - The times are turned into instants with Lagos's fixed +01:00 offset (lib/donations
//   lagosDateTimeToIso; Lagos has no daylight saving). The bank comes from the token.
// - POST /donation-slots → success panel with the slot the service sent back. 201 opened it; 200
//   (Idempotent-Replayed: true) means the service had this submission already, so we say no
//   second slot was opened. Both are a success.
// - POST /donation-slots is idempotent. useIdempotencyKey gives one key per submission:
//     kept     on every retry of the same body, so a retry can never open a second slot.
//     replaced after a success, when the user changes the form (the body differs), and
//              after 422 IDEMPOTENCY_KEY_REUSED.
// - Timeout or lost connection: we send it again once, with the same key (a safe replay), instead
//   of guessing. If that is lost too, the alert says trying again is safe, and the key is kept.
// - 422 VALIDATION_FAILED: details for startsAt / endsAt / capacity go on the start time, end time
//   and capacity fields; anything else is listed in the FormAlert.
// - Every other error (422 IDEMPOTENCY_KEY_REUSED included) shows in a FormAlert (role="alert",
//   the service's message, "Reference: …").

import { Form, Formik, useFormikContext, type FormikHelpers } from "formik";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import * as Yup from "yup";
import { ApiError, toApiError, type ApiResponse } from "../api/client";
import { api } from "../api/endpoints";
import type { DonationSlot, DonationSlotCreate, FieldIssue } from "../api/types";
import { applyApiError } from "../components/form/applyApiError";
import { FormAlert } from "../components/form/FormAlert";
import { FormikField } from "../components/form/FormikField";
import { useIdempotencyKey } from "../hooks/useIdempotencyKey";
import { useNow } from "../hooks/useNow";
import { lagosToday } from "../lib/expiry";
import {
  formatLagosDay,
  lagosDateTimeToIso,
  MAX_SLOT_CAPACITY,
  placesLeftLabel,
  slotTimeRangeLabel,
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
  // Fixed field order: useIdempotencyKey compares bodies as JSON.
  return { startsAt, endsAt, capacity };
}

/** 200, or the header, means the service had this submission already: nothing new was opened. */
function isReplay(res: ApiResponse<DonationSlot>): boolean {
  return res.status === 200 || res.headers.get("Idempotent-Replayed") === "true";
}

/** The outcome shown above the form when it isn't a success. */
type SubmitProblem =
  | { kind: "plain"; error: ApiError; issues: FieldIssue[] }
  | { kind: "connection"; error: ApiError };

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

// A Link that looks like the shared secondary Button, at least 44px tall.
const secondaryLink = cn(
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium",
  "border border-(--color-border-input) bg-(--color-surface) text-(--color-text) hover:bg-(--color-surface-hover)",
  focusRing,
);

/** /slots narrowed to one bank and one Lagos date. */
function slotListPath(bankId: string, date: string): string {
  const params = new URLSearchParams({ from: date, to: date, bankId });
  return `/slots?${params.toString()}`;
}

export default function NewSlotPage() {
  // For the date picker's earliest day; the schema reads the clock itself on each check.
  const now = useNow(60_000);
  const idempotency = useIdempotencyKey();
  const [created, setCreated] = useState<{ slot: DonationSlot; replayed: boolean } | null>(null);
  const [problem, setProblem] = useState<SubmitProblem | null>(null);
  const [resending, setResending] = useState(false);
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
    // Same body as the last attempt → same key, so this is a safe retry.
    const key = idempotency.keyFor(body);

    try {
      const res = await sendWithOneRetry(body, key);
      idempotency.renew();
      setCreated({ slot: res.data, replayed: isReplay(res) });
    } catch (e) {
      const error = toApiError(e);
      // Lost twice: it may have arrived. Keep the key; trying again is a replay.
      if (error.isConnectionProblem) setProblem({ kind: "connection", error });
      else handleRefusal(error, helpers);
    } finally {
      setResending(false);
      inFlight.current = false;
    }
  }

  /** A timeout or lost connection is sent again once with the same key: the service replays, never doubles. */
  async function sendWithOneRetry(body: DonationSlotCreate, key: string): Promise<ApiResponse<DonationSlot>> {
    try {
      return await api.createDonationSlot(body, key);
    } catch (e) {
      if (!toApiError(e).isConnectionProblem) throw e;
      setResending(true);
      return await api.createDonationSlot(body, key);
    }
  }

  function handleRefusal(error: ApiError, helpers: FormikHelpers<SlotFormValues>) {
    if (error.code === "IDEMPOTENCY_KEY_REUSED") {
      // The key was already used with another body. The next submit starts a new one.
      idempotency.renew();
      setProblem({ kind: "plain", error, issues: [] });
      return;
    }
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
    idempotency.renew();
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
          replayed={created.replayed}
          headingRef={successHeadingRef}
          onOpenAnother={openAnother}
        />
      ) : (
        <>
          <p className="mt-2 text-muted-foreground">
            Open a time at your bank that donors can book. Times are Lagos time.
          </p>
          {/* Always rendered, so the resend after a lost connection is announced. */}
          <p role="status" className="mt-1 min-h-5 text-sm text-muted-foreground">
            {resending ? "We lost the connection. Sending it again with the same details…" : ""}
          </p>

          {problem && <ProblemAlert problem={problem} />}

          <Formik<SlotFormValues> initialValues={initialValues} validationSchema={slotSchema} onSubmit={handleSubmit}>
            {({ isSubmitting, isValidating }) => {
              const busy = (isSubmitting && !isValidating) || resending;
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

                  {/* Disabled while in flight, so one click is one submission. loading sets aria-disabled
                      and ignores clicks but keeps focus on the button; inFlight also stops Enter. */}
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
  if (problem.kind === "connection") {
    return (
      <FormAlert
        className="mt-6"
        error={problem.error}
        title="We couldn't confirm the slot was opened."
        message="We lost the connection twice. Open slot again. It's safe: it won't open a second slot."
      />
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
  replayed,
  headingRef,
  onOpenAnother,
}: {
  slot: DonationSlot;
  replayed: boolean;
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
        <span className="min-w-0">Slot opened</span>
      </h2>
      {/* The heading takes focus; this says what it means without needing the heading read twice. */}
      <p role="status" className="mt-2 text-sm">
        {replayed
          ? "This slot had already been opened. No second slot was opened. Donors can book it."
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
