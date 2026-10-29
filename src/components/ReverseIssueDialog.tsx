// ReverseIssueDialog: the bank gives a reason and reverses an issue recorded in error.
//
//   <ReverseIssueDialog open={open} onOpenChange={setOpen} request={request}
//     outcomes={reversalOutcomes(request, now)} onReverse={(reason) => reverse(reason)} />
//
// - Shared Dialog with our own Formik form and footer, like Cancel. Reason: lib/validation
//   reversalReason (the contract's IssueReversal, 3–500 characters). The confirm button uses the
//   danger tone: a reversal corrects a mistake, it is not a normal step.
// - Lists each issued unit and where it goes: back to stock, or EXPIRED if past its expiry date
//   (lib/requestActions reversalOutcomes, labelled "based on expiry date").
// - Not optimistic: the dialog stays open, its button busy, until the service answers. onReverse
//   gets the trimmed reason and resolves with the error when the service refused the reason (422);
//   the dialog then stays open with the reason as typed, its errors under the field and anything
//   else in the alert at the top. For any other outcome the caller closes the dialog and resolves null.
// - It can't be closed while the reversal is in flight.

import { Form, Formik, type FormikHelpers } from "formik";
import { useState } from "react";
import * as Yup from "yup";
import type { ApiError } from "../api/client";
import type { BloodRequest, FieldIssue } from "../api/types";
import { reversalOutcomeLabel, type ReversalOutcome } from "../lib/requestActions";
import { REVERSAL_REASON_MAX, reversalReason } from "../lib/validation";
import { Button } from "../shared/ui/button";
import { Dialog } from "../shared/ui/dialog";
import { applyApiError } from "./form/applyApiError";
import { FormAlert } from "./form/FormAlert";
import { FormikTextarea } from "./form/FormikTextarea";

const REVERSAL_FIELDS = ["reason"] as const;
const reversalSchema = Yup.object({ reason: reversalReason() });
type ReversalValues = { reason: string };

export type ReverseIssueDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The request whose issue is reversed; null when none is chosen. */
  request: Pick<BloodRequest, "reference"> | null;
  outcomes: readonly ReversalOutcome[];
  /** Resolves with the 422 error when the reason was refused (the dialog stays open), else null. */
  onReverse: (reason: string) => Promise<ApiError | null>;
};

export function ReverseIssueDialog({ open, onOpenChange, request, outcomes, onReverse }: ReverseIssueDialogProps) {
  const [reversing, setReversing] = useState(false);

  function changeOpen(next: boolean) {
    if (!next && reversing) return; // don't close while the reversal is in flight
    onOpenChange(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={changeOpen}
      title={request ? `Reverse the issue of ${request.reference}?` : "Reverse this issue?"}
      description="Only if the issue was recorded in error. The request goes back to pending, and both the issue and its reversal stay in the history with your reason."
    >
      {/* Inside the dialog's content, so every opening starts with an empty form. */}
      <ReverseIssueForm
        outcomes={outcomes}
        reversing={reversing}
        setReversing={setReversing}
        onKeep={() => changeOpen(false)}
        onReverse={onReverse}
      />
    </Dialog>
  );
}

function ReverseIssueForm({
  outcomes,
  reversing,
  setReversing,
  onKeep,
  onReverse,
}: Pick<ReverseIssueDialogProps, "outcomes" | "onReverse"> & {
  reversing: boolean;
  setReversing: (reversing: boolean) => void;
  onKeep: () => void;
}) {
  const [refused, setRefused] = useState<{ error: ApiError; issues: FieldIssue[] } | null>(null);

  async function submit(values: ReversalValues, helpers: FormikHelpers<ReversalValues>) {
    setReversing(true);
    setRefused(null);
    try {
      const error = await onReverse(values.reason.trim());
      if (error) setRefused({ error, issues: applyApiError(error, REVERSAL_FIELDS, helpers.setFieldError) });
    } finally {
      setReversing(false);
    }
  }

  return (
    <Formik<ReversalValues> initialValues={{ reason: "" }} validationSchema={reversalSchema} onSubmit={submit}>
      <Form noValidate className="flex flex-col gap-4">
        {refused && <FormAlert error={refused.error} issues={refused.issues} />}
        {outcomes.length > 0 && (
          <div>
            <p id="reversal-units-heading" className="font-medium">
              {outcomes.length === 1 ? "What happens to the unit" : `What happens to the ${outcomes.length} units`}
            </p>
            <ul aria-labelledby="reversal-units-heading" className="mt-2 list-disc pl-5">
              {outcomes.map((outcome) => (
                <li key={outcome.reference} className="wrap-break-word">
                  {reversalOutcomeLabel(outcome)}
                </li>
              ))}
            </ul>
          </div>
        )}
        <FormikTextarea
          name="reason"
          label="Reason"
          maxLength={REVERSAL_REASON_MAX}
          hint="For example: issued to the wrong request; the units never left the bank."
          required
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="min-h-11" disabled={reversing} onClick={onKeep}>
            Keep issue
          </Button>
          <Button type="submit" variant="danger" className="min-h-11" loading={reversing}>
            Reverse issue
          </Button>
        </div>
      </Form>
    </Formik>
  );
}
