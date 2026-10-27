// RecordUnitPage (/units/new): bank staff record one received unit.
//
// - The Yup schema is built from lib/validation.ts, so it matches the contract's UnitCreate.
// - POST /units → success panel with the saved unit. The bank comes from the token.
// - POST /units is NOT idempotent (no Idempotency-Key). A repeated reference is refused
//   with 409 DUPLICATE_UNIT_REFERENCE, which is how we spot a retry after a lost answer:
//   if an attempt lost connection and the next try with the same reference gets a 409,
//   the first attempt most likely saved the unit, so we say so and link to /units.
// - Every error shows in a FormAlert (role="alert", message, "Reference: …").
//   409 also goes on the reference field; 422 details go on their fields via applyApiError.

import { Form, Formik, type FormikHelpers } from "formik";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import * as Yup from "yup";
import { toApiError, type ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { BloodGroup, Component, FieldIssue, Rhesus, Unit, UnitCreate } from "../api/types";
import { applyApiError } from "../components/form/applyApiError";
import { FormAlert } from "../components/form/FormAlert";
import { FormikField } from "../components/form/FormikField";
import { FormikSelect } from "../components/form/FormikSelect";
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
  UNIT_STATE_LABELS,
  UNIT_STATE_TONES,
} from "../lib/labels";
import {
  bloodGroup,
  component,
  dateAfter,
  dateNotInFuture,
  rhesus,
  todayIso,
  unitReference,
} from "../lib/validation";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { StatusBadge } from "../shared/ui/status-badge";

// Selects start empty (""), so the form type allows "" until the user picks one.
type UnitFormValues = {
  reference: string;
  bloodGroup: BloodGroup | "";
  rhesus: Rhesus | "";
  component: Component | "";
  collectionDate: string;
  expiryDate: string;
};

const UNIT_FIELDS = [
  "reference",
  "bloodGroup",
  "rhesus",
  "component",
  "collectionDate",
  "expiryDate",
] as const satisfies readonly (keyof UnitFormValues)[];

const unitSchema = Yup.object({
  reference: unitReference(),
  bloodGroup: bloodGroup(),
  rhesus: rhesus(),
  component: component(),
  collectionDate: dateNotInFuture("collection date"),
  expiryDate: dateAfter("expiry date", "collectionDate", "collection date"),
});

function initialValues(): UnitFormValues {
  return { reference: "", bloodGroup: "", rhesus: "", component: "", collectionDate: todayIso(), expiryDate: "" };
}

/** The request body, or null if a select is somehow still empty (Yup stops that first). */
function toUnitCreate(values: UnitFormValues): UnitCreate | null {
  const { bloodGroup, rhesus, component } = values;
  if (!isKeyOf(BLOOD_GROUP_LABELS, bloodGroup)) return null;
  if (!isKeyOf(RHESUS_LABELS, rhesus)) return null;
  if (!isKeyOf(COMPONENT_LABELS, component)) return null;
  return {
    reference: values.reference.trim(),
    bloodGroup,
    rhesus,
    component,
    collectionDate: values.collectionDate,
    expiryDate: values.expiryDate,
  };
}

/** The last submit's error, plus how to explain it. */
type SubmitError = {
  error: ApiError;
  kind: "plain" | "connection" | "probablySaved";
  issues: FieldIssue[];
};

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

// A Link that looks like the shared secondary Button, at least 44px tall.
const secondaryLink = cn(
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium",
  "border border-(--color-border-input) bg-(--color-surface) text-(--color-text) hover:bg-(--color-surface-hover)",
  focusRing,
);

export default function RecordUnitPage() {
  const [recorded, setRecorded] = useState<Unit | null>(null);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Formik doesn't stop a second submit on its own (e.g. Enter pressed twice quickly).
  const inFlight = useRef(false);
  // The reference of an attempt that lost connection: it may have been saved anyway.
  const lostReference = useRef<string | null>(null);
  // Set by "Record another unit", so focus goes to the first field once the form is back.
  const focusFormNext = useRef(false);

  useEffect(() => {
    if (recorded) {
      successHeadingRef.current?.focus();
    } else if (focusFormNext.current) {
      focusFormNext.current = false;
      const first = formRef.current?.elements.namedItem("reference");
      if (first instanceof HTMLElement) first.focus();
    }
  }, [recorded]);

  async function handleSubmit(values: UnitFormValues, helpers: FormikHelpers<UnitFormValues>) {
    const body = toUnitCreate(values);
    if (!body || inFlight.current) return;
    inFlight.current = true;
    setSubmitError(null);

    try {
      const res = await api.recordUnit(body);
      lostReference.current = null;
      setRecorded(res.data);
    } catch (e) {
      handleError(toApiError(e), body.reference, helpers);
    } finally {
      inFlight.current = false;
    }
  }

  function handleError(error: ApiError, reference: string, helpers: FormikHelpers<UnitFormValues>) {
    if (error.isConnectionProblem) {
      // NETWORK_ERROR or TIMEOUT: the unit may or may not be saved. Remember which one.
      lostReference.current = reference;
      setSubmitError({ error, kind: "connection", issues: [] });
      return;
    }

    switch (error.code) {
      case "DUPLICATE_UNIT_REFERENCE": {
        helpers.setFieldError("reference", error.message);
        const probablySaved = lostReference.current === reference;
        lostReference.current = null;
        setSubmitError({ error, kind: probablySaved ? "probablySaved" : "plain", issues: [] });
        return;
      }
      case "VALIDATION_FAILED": {
        const issues = applyApiError(error, UNIT_FIELDS, helpers.setFieldError);
        setSubmitError({ error, kind: "plain", issues });
        return;
      }
      default:
        // MALFORMED_REQUEST, FORBIDDEN, INTERNAL_ERROR, …: the message is written for users.
        setSubmitError({ error, kind: "plain", issues: [] });
    }
  }

  function recordAnother() {
    focusFormNext.current = true;
    setSubmitError(null);
    setRecorded(null);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Record unit</h1>

      {recorded ? (
        <SuccessPanel unit={recorded} headingRef={successHeadingRef} onRecordAnother={recordAnother} />
      ) : (
        <>
          <p className="mt-2 text-(--color-text-muted)">
            Add one unit your bank has received. It is saved as available stock.
          </p>

          {submitError && <SubmitErrorAlert submitError={submitError} />}

          <Formik<UnitFormValues> initialValues={initialValues()} validationSchema={unitSchema} onSubmit={handleSubmit}>
            {({ isSubmitting, isValidating, values }) => {
              const busy = isSubmitting && !isValidating;
              return (
                <Form ref={formRef} noValidate className="mt-6 flex flex-col gap-5">
                  <FormikField
                    name="reference"
                    label="Unit reference"
                    hint="As printed on the bag label. Letters, numbers and hyphens only."
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={40}
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
                    <FormikField name="collectionDate" label="Collection date" type="date" max={todayIso()} required />
                    <FormikField
                      name="expiryDate"
                      label="Expiry date"
                      hint="The last day the unit can be used."
                      type="date"
                      min={values.collectionDate || undefined}
                      required
                    />
                  </div>

                  {/* loading keeps focus on the button, sets aria-busy and ignores more clicks. */}
                  <Button type="submit" size="lg" loading={busy} className="min-h-11 self-start">
                    {busy ? "Recording unit…" : "Record unit"}
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

function SubmitErrorAlert({ submitError }: { submitError: SubmitError }) {
  const { error, kind, issues } = submitError;

  if (kind === "connection") {
    return (
      <FormAlert
        className="mt-6"
        error={error}
        message="We couldn't reach the service. Your unit may not be recorded. Try again."
      />
    );
  }

  if (kind === "probablySaved") {
    return (
      <FormAlert
        className="mt-6"
        error={error}
        title="Your earlier attempt probably recorded this unit."
        message={`${error.message} Your last try lost connection before the service could answer, so it most likely saved the unit then. Check the units list before recording it again.`}
      >
        <Link to="/units" className={cn(secondaryLink, "mt-3")}>
          Check the units list
        </Link>
      </FormAlert>
    );
  }

  return <FormAlert className="mt-6" error={error} issues={issues} />;
}

function SuccessPanel({
  unit,
  headingRef,
  onRecordAnother,
}: {
  unit: Unit;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onRecordAnother: () => void;
}) {
  const details: { term: string; value: ReactNode }[] = [
    { term: "Blood type", value: bloodTypeLabel(unit.bloodGroup, unit.rhesus) },
    { term: "Component", value: COMPONENT_LABELS[unit.component] },
    { term: "Collected", value: formatDate(unit.collectionDate) },
    { term: "Expires", value: formatDate(unit.expiryDate) },
    { term: "State", value: <StatusBadge tone={UNIT_STATE_TONES[unit.state]}>{UNIT_STATE_LABELS[unit.state]}</StatusBadge> },
    { term: "Bank", value: unit.bank.name },
  ];

  return (
    <section
      aria-labelledby="unit-recorded-heading"
      className="mt-6 rounded-md border border-l-4 border-(--color-border) border-l-(--color-success) bg-(--color-surface) p-5"
    >
      <h2
        id="unit-recorded-heading"
        ref={headingRef}
        tabIndex={-1}
        className={cn("flex items-start gap-2 rounded-sm text-xl font-semibold wrap-break-word", focusRing)}
      >
        <CheckCircle2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-(--color-success)" />
        <span className="min-w-0">Unit {unit.reference} recorded</span>
      </h2>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {details.map(({ term, value }) => (
          <div key={term} className="contents">
            <dt className="text-(--color-text-muted)">{term}</dt>
            <dd className="min-w-0 wrap-break-word font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" className="min-h-11" onClick={onRecordAnother}>
          Record another unit
        </Button>
        <Link to="/units" className={secondaryLink}>
          View all units
        </Link>
      </div>
    </section>
  );
}
