// NewRequestPage (/requests/new): hospital staff ask one bank for units.
//
// - Opened from Find blood with ?bankId&bloodGroup&rhesus&component, which prefill the form.
//   No bankId → "Start from Find blood". The bank list (GET /organisations) gives the names.
// - Submit validates (lib/validation.ts), then a ConfirmDialog shows the request to review.
//   Send → POST /requests. The hospital comes from the token; no patient details are sent.
// - POST /requests is idempotent. useIdempotencyKey gives one key per submission:
//     kept     on every retry of the same body (connection lost, timeout, 5xx), so a retry
//              can never create a second request: the service replays the first (200).
//     replaced after a success, when the user changes the form (the body differs), and
//              after 422 IDEMPOTENCY_KEY_REUSED (then the user reviews and sends again).
// - Errors the user can fix by sending again (connection, key reused, 5xx) stay in the dialog.
//   Errors that need the form changed (422 VALIDATION_FAILED, 404 bank) close it and go on the
//   fields, with a FormAlert above the form. Every alert shows the message and "Reference: …".
// - Success replaces the form with "Request sent" (focus moves to its heading). A 200 means
//   the service had this request already, so we say no duplicate was created.

import { Form, Formik, type FormikHelpers } from "formik";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useSearchParams } from "react-router";
import * as Yup from "yup";
import { toApiError, type ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type {
  BloodGroup,
  BloodRequest,
  BloodRequestCreate,
  Component,
  FieldIssue,
  Organisation,
  Rhesus,
  Urgency,
} from "../api/types";
import { applyApiError } from "../components/form/applyApiError";
import { FormAlert } from "../components/form/FormAlert";
import { FormikField } from "../components/form/FormikField";
import { FormikSelect } from "../components/form/FormikSelect";
import { UrgencyLabel } from "../components/UrgencyLabel";
import { useAsync } from "../hooks/useAsync";
import { useIdempotencyKey } from "../hooks/useIdempotencyKey";
import {
  bloodTypeLabel,
  BLOOD_GROUP_LABELS,
  BLOOD_GROUP_OPTIONS,
  COMPONENT_LABELS,
  COMPONENT_OPTIONS,
  formatDateTime,
  isKeyOf,
  REQUEST_STATE_LABELS,
  REQUEST_STATE_TONES,
  RHESUS_LABELS,
  RHESUS_OPTIONS,
  URGENCY_LABELS,
  URGENCY_OPTIONS,
} from "../lib/labels";
import {
  bloodGroup,
  component,
  localDateTimeInput,
  localDateTimeToIso,
  MAX_REQUEST_QUANTITY,
  neededByFuture,
  quantity,
  rhesus,
  urgency,
} from "../lib/validation";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { ConfirmDialog } from "../shared/ui/dialog";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";
import { StatusBadge } from "../shared/ui/status-badge";

// Selects start empty (""), so the form type allows "" until the user picks one.
// quantity is "" while the number input is empty. neededBy is the datetime-local value (local time).
type RequestFormValues = {
  bankId: string;
  bloodGroup: BloodGroup | "";
  rhesus: Rhesus | "";
  component: Component | "";
  quantity: number | "";
  urgency: Urgency | "";
  neededBy: string;
};

// The form uses the contract's field names, so 422 details land on the right field.
const REQUEST_FIELDS = [
  "bankId",
  "bloodGroup",
  "rhesus",
  "component",
  "quantity",
  "urgency",
  "neededBy",
] as const satisfies readonly (keyof RequestFormValues)[];

const requestSchema = Yup.object({
  bankId: Yup.string().required("Choose the blood bank."),
  bloodGroup: bloodGroup(),
  rhesus: rhesus(),
  component: component(),
  quantity: quantity(),
  urgency: urgency(),
  neededBy: neededByFuture(),
});

const NO_RESERVE_NOTE = "Sending a request does not reserve units. The bank reserves them when it approves.";

/** The values from Find blood's link. Anything unknown starts empty. */
function initialValues(params: URLSearchParams, bank: Organisation | undefined): RequestFormValues {
  const group = params.get("bloodGroup");
  const rh = params.get("rhesus");
  const comp = params.get("component");
  return {
    bankId: bank?.id ?? "",
    bloodGroup: isKeyOf(BLOOD_GROUP_LABELS, group) ? group : "",
    rhesus: isKeyOf(RHESUS_LABELS, rh) ? rh : "",
    component: isKeyOf(COMPONENT_LABELS, comp) ? comp : "",
    quantity: 1,
    urgency: "",
    neededBy: "",
  };
}

/** The request body, or null if a value is somehow still missing (Yup stops that first). */
function toRequestCreate(values: RequestFormValues): BloodRequestCreate | null {
  const { bankId, bloodGroup, rhesus, component, quantity, urgency } = values;
  if (!bankId) return null;
  if (!isKeyOf(BLOOD_GROUP_LABELS, bloodGroup)) return null;
  if (!isKeyOf(RHESUS_LABELS, rhesus)) return null;
  if (!isKeyOf(COMPONENT_LABELS, component)) return null;
  if (!isKeyOf(URGENCY_LABELS, urgency)) return null;
  if (typeof quantity !== "number" || !Number.isInteger(quantity)) return null;
  const neededBy = localDateTimeToIso(values.neededBy);
  if (!neededBy) return null;
  // Fixed field order: useIdempotencyKey compares bodies as JSON.
  return { bankId, bloodGroup, rhesus, component, quantity, urgency, neededBy };
}

/** "O− red cells". */
function whatLabel(group: BloodGroup, rh: Rhesus, comp: Component): string {
  return `${bloodTypeLabel(group, rh)} ${COMPONENT_LABELS[comp].toLowerCase()}`;
}

function unitsLabel(count: number): string {
  return `${count} ${count === 1 ? "unit" : "units"}`;
}

/** The last send's error, plus how to explain it. */
type SubmitError = {
  error: ApiError;
  kind: "connection" | "keyReused" | "plain";
  issues: FieldIssue[];
};

type Review = { body: BloodRequestCreate; bankName: string };
type Sent = { request: BloodRequest; replayed: boolean };

/** Thrown from onConfirm so ConfirmDialog stays open; the error itself is already in state. */
class KeepDialogOpen extends Error {}

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

// Links that look like the shared Buttons, at least 44px tall.
const linkBase = cn("inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium", focusRing);
const primaryLink = cn(linkBase, "bg-(--color-primary) text-(--color-on-primary) hover:bg-(--color-primary-hover)");
const secondaryLink = cn(
  linkBase,
  "border border-(--color-border-input) bg-(--color-surface) text-(--color-text) hover:bg-(--color-surface-hover)",
);

export default function NewRequestPage() {
  const [searchParams] = useSearchParams();
  const bankParam = searchParams.get("bankId");

  const banks = useAsync(
    (signal) => api.listOrganisations({ type: "BLOOD_BANK" }, signal).then((res) => res.data.items),
    [],
  );

  let content: ReactNode;
  if (!bankParam) {
    content = <StartFromFindBlood />;
  } else if (banks.loading) {
    content = (
      <div className="mt-6 flex flex-col gap-4">
        <p role="status" className="text-sm font-medium">
          Loading blood banks…
        </p>
        <Skeleton lines={6} />
      </div>
    );
  } else if (banks.error || !banks.data) {
    content = (
      <ErrorState
        className="mt-6 whitespace-pre-line"
        title="We couldn't load the blood banks"
        description={`${banks.error?.message ?? "Please try again."}\nReference: ${banks.error?.requestId ?? "—"}`}
        onRetry={banks.reload}
      />
    );
  } else {
    const bank = banks.data.find((b) => b.id === bankParam);
    content = (
      <RequestForm
        banks={banks.data}
        initial={initialValues(searchParams, bank)}
        bankNotFound={bank === undefined}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Request units</h1>
      {content}
    </div>
  );
}

function StartFromFindBlood() {
  return (
    <section
      aria-labelledby="start-heading"
      className="mt-6 rounded-md border border-border bg-surface p-5"
    >
      <h2 id="start-heading" className="text-lg font-semibold">
        Start from Find blood
      </h2>
      <p className="mt-2 text-muted-foreground">
        Find a bank that has the blood you need, then choose "Request units" next to it.
      </p>
      <Link to="/availability" className={cn(primaryLink, "mt-4")}>
        Find blood
      </Link>
    </section>
  );
}

function RequestForm({
  banks,
  initial,
  bankNotFound,
}: {
  banks: readonly Organisation[];
  initial: RequestFormValues;
  bankNotFound: boolean;
}) {
  const idempotency = useIdempotencyKey();
  const [review, setReview] = useState<Review | null>(null);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);

  const bankOptions = banks.map((b) => ({ value: b.id, label: b.name }));

  useEffect(() => {
    if (sent) sentHeadingRef.current?.focus();
  }, [sent]);

  // Formik's submit (after validation) only opens the review; Send in the dialog sends.
  function openReview(values: RequestFormValues) {
    const body = toRequestCreate(values);
    if (!body) return;
    const bankName = banks.find((b) => b.id === body.bankId)?.name ?? "The chosen bank";
    setSubmitError(null);
    setReview({ body, bankName });
  }

  async function send(body: BloodRequestCreate, helpers: FormikHelpers<RequestFormValues>) {
    // Same body as the last attempt → same key, so this is a safe retry.
    const key = idempotency.keyFor(body);
    setSubmitError(null);

    try {
      const res = await api.createRequest(body, key);
      idempotency.renew();
      const replayed = res.status === 200 || res.headers.get("Idempotent-Replayed") === "true";
      setSent({ request: res.data, replayed });
    } catch (e) {
      if (!handleError(toApiError(e), helpers)) throw new KeepDialogOpen();
    }
  }

  /** Shows the error. Returns true when the dialog should close so the user can edit the form. */
  function handleError(error: ApiError, helpers: FormikHelpers<RequestFormValues>): boolean {
    if (error.isConnectionProblem) {
      // NETWORK_ERROR or TIMEOUT: it may have arrived. Keep the key; sending again is a replay.
      setSubmitError({ error, kind: "connection", issues: [] });
      return false;
    }

    switch (error.code) {
      case "IDEMPOTENCY_KEY_REUSED":
        // The key was already used with another body. Start a new submission and let them re-check.
        idempotency.renew();
        setSubmitError({ error, kind: "keyReused", issues: [] });
        return false;
      case "VALIDATION_FAILED": {
        const issues = applyApiError(error, REQUEST_FIELDS, helpers.setFieldError);
        setSubmitError({ error, kind: "plain", issues });
        return true;
      }
      case "NOT_FOUND":
        helpers.setFieldError("bankId", "We couldn't find this blood bank. Choose another one.");
        setSubmitError({ error, kind: "plain", issues: [] });
        return true;
      default:
        // FORBIDDEN, INTERNAL_ERROR, …: the message is written for users. Sending again is safe.
        setSubmitError({ error, kind: "plain", issues: [] });
        return false;
    }
  }

  if (sent) return <SentPanel sent={sent} headingRef={sentHeadingRef} />;

  return (
    <>
      <p className="mt-2 text-muted-foreground">
        Ask one blood bank for units. Don't include patient details.
      </p>

      {bankNotFound && (
        <p className="mt-4 rounded-md border border-border bg-surface p-4 text-sm">
          We couldn't find the bank from your Find blood link. Choose a bank below.
        </p>
      )}

      {/* While the dialog is open the error shows inside it instead. */}
      {submitError && !review && <SubmitErrorAlert submitError={submitError} className="mt-6" />}

      <Formik<RequestFormValues> initialValues={initial} validationSchema={requestSchema} onSubmit={openReview}>
        {(formik) => (
          <Form noValidate className="mt-6 flex flex-col gap-5">
            <FormikSelect
              name="bankId"
              label="Blood bank"
              options={bankOptions}
              placeholder="Choose a bank"
              required
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormikSelect
                name="bloodGroup"
                label="Blood group"
                options={BLOOD_GROUP_OPTIONS}
                placeholder="Choose a group"
                required
              />
              <FormikSelect
                name="rhesus"
                label="Rhesus type"
                options={RHESUS_OPTIONS}
                placeholder="Choose a type"
                required
              />
            </div>

            <FormikSelect
              name="component"
              label="Component"
              options={COMPONENT_OPTIONS}
              placeholder="Choose a component"
              required
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormikField
                name="quantity"
                label="Number of units"
                hint={`From 1 to ${MAX_REQUEST_QUANTITY}.`}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_REQUEST_QUANTITY}
                step={1}
                required
              />
              <FormikSelect
                name="urgency"
                label="Urgency"
                options={URGENCY_OPTIONS}
                placeholder="Choose urgency"
                required
              />
            </div>

            <FormikField
              name="neededBy"
              label="Needed by"
              hint="Date and time, in your local time."
              type="datetime-local"
              min={localDateTimeInput()}
              required
            />

            <p className="text-sm text-muted-foreground">{NO_RESERVE_NOTE}</p>

            <Button type="submit" size="lg" className="min-h-11 self-start">
              Review request
            </Button>

            <ConfirmDialog
              open={review !== null}
              onOpenChange={(open) => {
                if (!open) setReview(null);
              }}
              title="Send request?"
              description="Check the details, then send it to the bank."
              confirmLabel={submitError?.kind === "connection" ? "Send again" : "Send request"}
              cancelLabel="Back to form"
              onConfirm={() => (review ? send(review.body, formik) : undefined)}
            >
              {review && (
                <>
                  {submitError && <SubmitErrorAlert submitError={submitError} className="mb-4" />}
                  <RequestSummary
                    bankName={review.bankName}
                    what={whatLabel(review.body.bloodGroup, review.body.rhesus, review.body.component)}
                    quantity={review.body.quantity}
                    urgency={review.body.urgency}
                    neededBy={review.body.neededBy}
                  />
                  <p className="mt-4 text-muted-foreground">{NO_RESERVE_NOTE}</p>
                </>
              )}
            </ConfirmDialog>
          </Form>
        )}
      </Formik>
    </>
  );
}

function SubmitErrorAlert({ submitError, className }: { submitError: SubmitError; className?: string }) {
  const { error, kind, issues } = submitError;

  if (kind === "connection") {
    return (
      <FormAlert
        className={className}
        error={error}
        message="We couldn't confirm your request was sent. Send again. It's safe: it won't create a duplicate."
      />
    );
  }

  if (kind === "keyReused") {
    return (
      <FormAlert
        className={className}
        error={error}
        title="Nothing was sent."
        message="This send didn't match the earlier one. Check the details and send the request again."
      />
    );
  }

  return <FormAlert className={className} error={error} issues={issues} />;
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

function RequestSummary({
  bankName,
  what,
  quantity,
  urgency,
  neededBy,
}: {
  bankName: string;
  what: string;
  quantity: number;
  urgency: Urgency;
  neededBy: string;
}) {
  return (
    <DetailList
      details={[
        { term: "Bank", value: bankName },
        { term: "Blood", value: what },
        { term: "Quantity", value: unitsLabel(quantity) },
        { term: "Urgency", value: <UrgencyLabel urgency={urgency} /> },
        { term: "Needed by", value: formatDateTime(neededBy) },
      ]}
    />
  );
}

function SentPanel({ sent, headingRef }: { sent: Sent; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const { request, replayed } = sent;

  return (
    <section
      aria-labelledby="request-sent-heading"
      className="mt-6 rounded-md border border-l-4 border-border border-l-success bg-surface p-5"
    >
      <h2
        id="request-sent-heading"
        ref={headingRef}
        tabIndex={-1}
        className={cn("flex items-start gap-2 rounded-sm text-xl font-semibold", focusRing)}
      >
        <CheckCircle2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-success" />
        <span className="min-w-0">Request sent</span>
      </h2>

      {replayed && (
        <p className="mt-2 text-sm font-medium">This request had already been sent. No duplicate was created.</p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <DetailList
          details={[
            { term: "Reference", value: request.reference },
            {
              term: "State",
              value: (
                <StatusBadge tone={REQUEST_STATE_TONES[request.state]}>{REQUEST_STATE_LABELS[request.state]}</StatusBadge>
              ),
            },
          ]}
        />
        <RequestSummary
          bankName={request.bank.name}
          what={whatLabel(request.bloodGroup, request.rhesus, request.component)}
          quantity={request.quantity}
          urgency={request.urgency}
          neededBy={request.neededBy}
        />
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        No units are reserved yet. The bank reserves them when it approves.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link to={`/requests/${encodeURIComponent(request.id)}`} className={primaryLink}>
          View request
        </Link>
        <Link to="/availability" className={secondaryLink}>
          Find more blood
        </Link>
      </div>
    </section>
  );
}
