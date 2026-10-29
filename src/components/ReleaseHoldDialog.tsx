// ReleaseHoldDialog: bank staff release a routine request's hold so an emergency can have its units.
//
//   <ReleaseHoldDialog open={open} onOpenChange={setOpen} emergency={request}
//     candidates={releasableHolds(request, scan.approved, now)} onRelease={(candidate, reason) => release(candidate, reason)} />
//
// - Shared Dialog with our own Formik form and footer, like Reverse issue. Danger tone: it breaks a
//   promise the bank already made (ADR-002). Every sentence that depends on the policy comes from
//   lib/holdRelease.
// - Lists every candidate (latest needed-by first) as a radio: reference, hospital, needed by,
//   urgency, hold end (the service's holdExpiresAt) and held units. Nothing is chosen for the user.
//   Once one is chosen it says plainly what happens to it, and which units leave their hold.
// - Reason: lib/validation holdReleaseReason (the contract's HoldRelease, 3–500 characters).
// - Not optimistic: the dialog stays open, its button busy, until the service answers. onRelease
//   resolves with the error when the service refused the body (422); the dialog then stays open
//   with the choice and reason as typed, field errors under the reason and anything else in the
//   alert at the top. For any other outcome the caller closes the dialog and resolves null.
// - It can't be closed while the release is in flight. A role="status" line inside the dialog says
//   "Releasing hold…" then, because the open dialog hides the page's own status line.

import { Field, Form, Formik, useFormikContext, type FormikHelpers } from "formik";
import { useState } from "react";
import * as Yup from "yup";
import type { ApiError } from "../api/client";
import type { BloodRequest, FieldIssue } from "../api/types";
import {
  candidateHoldEnd,
  heldUnitsHeading,
  LEFTOVER_UNITS_NOTE,
  releaseConsequence,
  type HoldReleaseCandidate,
} from "../lib/holdRelease";
import { formatDateTime, holdTimeLabel, URGENCY_LABELS } from "../lib/labels";
import { HOLD_RELEASE_REASON_MAX, holdReleaseReason } from "../lib/validation";
import { Button } from "../shared/ui/button";
import { Dialog } from "../shared/ui/dialog";
import { applyApiError } from "./form/applyApiError";
import { FormAlert } from "./form/FormAlert";
import { FormikTextarea } from "./form/FormikTextarea";

const RELEASE_FIELDS = ["reason"] as const;
const releaseSchema = Yup.object({
  routineId: Yup.string().required("Choose the routine request whose hold you are releasing."),
  reason: holdReleaseReason(),
});
type ReleaseValues = { routineId: string; reason: string };

export type ReleaseHoldDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The emergency request that receives the units. */
  emergency: Pick<BloodRequest, "reference">;
  candidates: readonly HoldReleaseCandidate[];
  /** Resolves with the 422 error when the body was refused (the dialog stays open), else null. */
  onRelease: (candidate: HoldReleaseCandidate, reason: string) => Promise<ApiError | null>;
};

export function ReleaseHoldDialog({ open, onOpenChange, emergency, candidates, onRelease }: ReleaseHoldDialogProps) {
  const [releasing, setReleasing] = useState(false);

  function changeOpen(next: boolean) {
    if (!next && releasing) return; // don't close while the release is in flight
    onOpenChange(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={changeOpen}
      title={`Release a routine hold for ${emergency.reference}?`}
      description="Only if the emergency can't wait. The routine request you choose loses its hold and goes back to pending; your reason is recorded in its history."
    >
      {/* Inside the dialog's content, so every opening starts with an empty form. */}
      <ReleaseHoldForm
        candidates={candidates}
        releasing={releasing}
        setReleasing={setReleasing}
        onKeep={() => changeOpen(false)}
        onRelease={onRelease}
      />
    </Dialog>
  );
}

function ReleaseHoldForm({
  candidates,
  releasing,
  setReleasing,
  onKeep,
  onRelease,
}: Pick<ReleaseHoldDialogProps, "candidates" | "onRelease"> & {
  releasing: boolean;
  setReleasing: (releasing: boolean) => void;
  onKeep: () => void;
}) {
  const [refused, setRefused] = useState<{ error: ApiError; issues: FieldIssue[] } | null>(null);

  async function submit(values: ReleaseValues, helpers: FormikHelpers<ReleaseValues>) {
    const candidate = candidates.find((c) => c.request.id === values.routineId);
    if (!candidate) return;
    setReleasing(true);
    setRefused(null);
    try {
      const error = await onRelease(candidate, values.reason.trim());
      if (error) setRefused({ error, issues: applyApiError(error, RELEASE_FIELDS, helpers.setFieldError) });
    } finally {
      setReleasing(false);
    }
  }

  return (
    <Formik<ReleaseValues> initialValues={{ routineId: "", reason: "" }} validationSchema={releaseSchema} onSubmit={submit}>
      <Form noValidate className="flex flex-col gap-4">
        {refused && <FormAlert error={refused.error} issues={refused.issues} />}
        <CandidateChoice candidates={candidates} disabled={releasing} />
        <ChosenConsequence candidates={candidates} />
        <FormikTextarea
          name="reason"
          label="Reason"
          maxLength={HOLD_RELEASE_REASON_MAX}
          hint="For example: emergency theatre case; the routine hospital confirmed by phone its courier has not left."
          required
        />
        {/* The dialog hides the page's status line from screen readers, so say it here too. Always
            rendered, so the change of text is announced. */}
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {releasing ? "Releasing hold…" : ""}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="min-h-11" disabled={releasing} onClick={onKeep}>
            Keep the hold
          </Button>
          <Button type="submit" variant="danger" className="min-h-11" loading={releasing}>
            Release hold
          </Button>
        </div>
      </Form>
    </Formik>
  );
}

function CandidateChoice({ candidates, disabled }: { candidates: readonly HoldReleaseCandidate[]; disabled: boolean }) {
  const { errors, touched, submitCount } = useFormikContext<ReleaseValues>();
  const error = (touched.routineId || submitCount > 0) && errors.routineId ? errors.routineId : null;
  return (
    <fieldset aria-describedby={error ? "release-choice-error" : undefined} aria-invalid={error ? true : undefined}>
      <legend className="font-medium">
        Routine request to release <span aria-hidden="true">*</span>
        <span className="sr-only">(required)</span>
      </legend>
      <p className="mt-1 text-sm text-muted-foreground">Latest needed-by first: those can wait longest.</p>
      <div className="mt-2 flex flex-col gap-2">
        {candidates.map((candidate) => {
          const { request, heldUnits } = candidate;
          return (
            <label
              key={request.id}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm has-checked:border-(--color-primary)"
            >
              <Field
                type="radio"
                name="routineId"
                value={request.id}
                disabled={disabled}
                className="mt-0.5 size-5 shrink-0 accent-(--color-primary)"
              />
              <span className="min-w-0">
                <span className="block font-semibold wrap-break-word">{request.reference}</span>
                <span className="block wrap-break-word">{request.hospital.name}</span>
                <span className="block text-muted-foreground">
                  {URGENCY_LABELS[request.urgency]}, needed by{" "}
                  <time dateTime={request.neededBy}>{formatDateTime(request.neededBy)}</time>
                </span>
                <span className="block text-muted-foreground">
                  Hold ends at{" "}
                  <time dateTime={candidateHoldEnd(candidate)}>{holdTimeLabel(candidateHoldEnd(candidate))}</time>
                </span>
                <span className="block wrap-break-word">
                  Held: {heldUnits.map((r) => r.unit.reference).join(", ")}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id="release-choice-error" className="mt-2 text-sm font-medium text-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function ChosenConsequence({ candidates }: { candidates: readonly HoldReleaseCandidate[] }) {
  const { values } = useFormikContext<ReleaseValues>();
  const chosen = candidates.find((c) => c.request.id === values.routineId);
  if (!chosen) return null;
  return (
    <div className="rounded-md border border-l-4 border-border border-l-(--color-danger) p-3 text-sm">
      <p className="font-medium wrap-break-word">{releaseConsequence(chosen)}</p>
      <p id="release-units-heading" className="mt-2 font-medium">
        {heldUnitsHeading(chosen.heldUnits.length)}
      </p>
      <ul aria-labelledby="release-units-heading" className="mt-1 list-disc pl-5">
        {chosen.heldUnits.map((r) => (
          <li key={r.id} className="wrap-break-word">
            {r.unit.reference}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-muted-foreground">{LEFTOVER_UNITS_NOTE}</p>
    </div>
  );
}
