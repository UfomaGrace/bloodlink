// CancelRequestDialog: the hospital gives a reason and cancels its own request.
//
//   <CancelRequestDialog open={open} onOpenChange={setOpen} request={request}
//     reopened={reopened} onCancel={(reason) => cancel(reason)} />
//
// - Shared Dialog with our own Formik form and footer, like Decline. Reason: lib/validation
//   cancelReason (the contract's Cancellation, 3–500 characters).
// - onCancel gets the trimmed reason. Cancel is optimistic, so the caller closes the dialog
//   straight away and shows the request as CANCELLED.
// - If the service then refuses the reason (422), the caller rolls back and reopens the dialog
//   with `reopened` (from cancelReopened): the reason as typed, its errors under the field and
//   anything else in the alert at the top.
// - A role="status" line inside the dialog says "Cancelling request…" while the form submits, since
//   the open dialog hides the page's status line. Cancel closes the dialog at once, so it is brief.

import { Form, Formik } from "formik";
import * as Yup from "yup";
import type { ApiError } from "../api/client";
import type { BloodRequest, FieldIssue } from "../api/types";
import { CANCEL_REASON_MAX, cancelReason } from "../lib/validation";
import { Button } from "../shared/ui/button";
import { Dialog } from "../shared/ui/dialog";
import { applyApiError } from "./form/applyApiError";
import { FormAlert } from "./form/FormAlert";
import { FormikTextarea } from "./form/FormikTextarea";

const CANCEL_FIELDS = ["reason"] as const;
const cancelSchema = Yup.object({ reason: cancelReason() });
type CancelValues = { reason: string };

/** The dialog's state after the service refused the reason. */
export type CancelReopened = {
  reason: string;
  error: ApiError;
  fieldErrors: Partial<Record<(typeof CANCEL_FIELDS)[number], string>>;
  issues: FieldIssue[];
};

export function cancelReopened(reason: string, error: ApiError): CancelReopened {
  const fieldErrors: CancelReopened["fieldErrors"] = {};
  const issues = applyApiError(error, CANCEL_FIELDS, (field, message) => {
    fieldErrors[field] = message;
  });
  return { reason, error, fieldErrors, issues };
}

export type CancelRequestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The request being cancelled; null when none is chosen. */
  request: Pick<BloodRequest, "reference" | "bank"> | null;
  reopened?: CancelReopened | null;
  onCancel: (reason: string) => void;
};

export function CancelRequestDialog({ open, onOpenChange, request, reopened, onCancel }: CancelRequestDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={request ? `Cancel request ${request.reference}?` : "Cancel this request?"}
      description={`${request?.bank.name ?? "The bank"} will see your reason. Any units held for it go back to stock, or are marked expired if past their expiry date.`}
    >
      <Formik<CancelValues>
        // A reopened dialog starts again from what was typed, with the service's errors showing.
        key={reopened ? `reopened-${reopened.error.requestId}` : "new"}
        initialValues={{ reason: reopened?.reason ?? "" }}
        initialErrors={reopened?.fieldErrors}
        initialTouched={reopened?.fieldErrors.reason ? { reason: true } : undefined}
        validationSchema={cancelSchema}
        onSubmit={(values) => onCancel(values.reason.trim())}
      >
        {({ isSubmitting }) => (
          <Form noValidate className="flex flex-col gap-4">
            {reopened && <FormAlert error={reopened.error} issues={reopened.issues} />}
            <FormikTextarea
              name="reason"
              label="Reason"
              maxLength={CANCEL_REASON_MAX}
              hint="For example: patient transferred to another hospital. Never a patient's name."
              required
            />
            {/* The dialog hides the page's status line from screen readers, so say it here too. */}
            <p role="status" className="min-h-5 text-sm text-muted-foreground">
              {isSubmitting ? "Cancelling request…" : ""}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" className="min-h-11" onClick={() => onOpenChange(false)}>
                Keep request
              </Button>
              <Button type="submit" variant="danger" className="min-h-11" loading={isSubmitting}>
                Cancel request
              </Button>
            </div>
          </Form>
        )}
      </Formik>
    </Dialog>
  );
}
