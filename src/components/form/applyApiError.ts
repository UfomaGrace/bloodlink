// applyApiError: put a 422's field details onto the matching Formik fields.
//
//   const unmapped = applyApiError(error, UNIT_FIELDS, helpers.setFieldError);
//   // → each { field: "expiryDate", issue: "…" } shows under Expiry date
//   // → details for fields the form doesn't have come back, to show in the FormAlert
//
// Only VALIDATION_FAILED carries details; for any other error this does nothing and returns [].

import type { ApiError } from "../../api/client";
import type { FieldIssue } from "../../api/types";

export function applyApiError<F extends string>(
  error: ApiError,
  fields: readonly F[],
  setFieldError: (field: F, message: string) => void,
): FieldIssue[] {
  const unmapped: FieldIssue[] = [];
  for (const detail of error.details) {
    const field = fields.find((f) => f === detail.field);
    if (field) setFieldError(field, detail.issue);
    else unmapped.push(detail);
  }
  return unmapped;
}
