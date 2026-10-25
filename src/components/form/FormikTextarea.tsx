// FormikTextarea: a Formik-connected textarea with a character counter.
//
//   <FormikTextarea name="reason" label="Reason" maxLength={500} hint="Tell the hospital why." required />
//
// - Same wiring as FormikField (label, hint, error, aria-invalid, aria-describedby).
// - The counter ("120 of 500 characters") is linked with aria-describedby too, so a screen
//   reader hears it with the field. It isn't announced on every keystroke; a separate polite
//   live region speaks up only when 20 or fewer characters are left.
// - maxLength is enforced by the browser; Yup should still check it (pasted text, old values).

import { useField } from "formik";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../shared/cn";
import { FormField } from "../../shared/ui/form-field";

// Props this component sets itself.
type ManagedProps =
  | "name"
  | "id"
  | "value"
  | "onChange"
  | "onBlur"
  | "className"
  | "required"
  | "maxLength"
  | "aria-describedby"
  | "aria-invalid"
  | "aria-required";

export type FormikTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, ManagedProps> & {
  name: string;
  label: string;
  maxLength: number;
  hint?: string;
  required?: boolean;
  className?: string;
};

const NEAR_LIMIT = 20;

// shared/ui/textarea.tsx is still an empty stub, so this mirrors the shared Input's styling.
const textareaClasses = cn(
  "min-h-24 w-full rounded-[var(--radius-md)] px-3 py-2.5 text-sm resize-y",
  "bg-[var(--color-bg)] text-[var(--color-text)] font-[family-name:var(--font-sans)]",
  "border border-[var(--color-border-input)]",
  "placeholder:text-[var(--color-text-muted)]",
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)]",
  "focus-visible:[outline-offset:var(--focus-ring-offset)]",
  "aria-[invalid=true]:border-2 aria-[invalid=true]:border-[var(--color-danger)]",
  "disabled:cursor-not-allowed disabled:bg-[var(--color-surface)] disabled:opacity-60",
);

export function FormikTextarea({ name, label, maxLength, hint, required, className, ...rest }: FormikTextareaProps) {
  const [field, meta] = useField<string>(name);
  const error = meta.touched && meta.error ? meta.error : undefined;
  const length = (field.value ?? "").length;
  const remaining = maxLength - length;

  return (
    <FormField label={label} hint={hint} error={error} required={required} className={className}>
      {(control) => {
        const counterId = `${control.id}-counter`;
        const describedBy = [control["aria-describedby"], counterId].filter(Boolean).join(" ");
        return (
          <>
            <textarea
              {...rest}
              {...control}
              {...field}
              aria-describedby={describedBy}
              value={field.value ?? ""}
              maxLength={maxLength}
              required={required}
              className={textareaClasses}
            />
            <p
              id={counterId}
              className={cn(
                "text-right text-sm",
                remaining <= NEAR_LIMIT ? "font-medium text-(--color-text)" : "text-(--color-text-muted)",
              )}
            >
              {length} of {maxLength} characters
            </p>
            <p aria-live="polite" className="sr-only">
              {remaining <= NEAR_LIMIT ? `${remaining} ${remaining === 1 ? "character" : "characters"} left` : ""}
            </p>
          </>
        );
      }}
    </FormField>
  );
}
