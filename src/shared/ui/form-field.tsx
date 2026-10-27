// FormField: label + hint + error wrapper for any form control.
// Owner: Muizz
//
// Usage: children is a function that receives the props to spread onto the control.
//
//   <FormField label="Food name" hint="As donors would say it" error={errors.title?.message} required>
//     {(field) => <Input {...field} {...register("title")} />}
//   </FormField>
//
// It wires up, once, for every form in all eight products:
// - label tied to the control by id
// - hint and error linked with aria-describedby, so screen readers read them with the field
// - aria-invalid when there is an error
// - aria-required, with a visual * hidden from screen readers (they hear "required" instead)
//
// Works with Input, Textarea and Select (pass the props to Radix Select's Trigger).

import { useId, type ReactNode } from "react";
import { cn } from "../cn";

export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};

export type FormFieldProps = {
  label: string;
  hint?: string;
  /** "below" puts the hint under the control, e.g. to keep side-by-side inputs aligned. */
  hintPlacement?: "above" | "below";
  error?: string;
  required?: boolean;
  /** Pass your own id if the control needs a stable one; otherwise one is generated. */
  id?: string;
  className?: string;
  children: (field: FieldControlProps) => ReactNode;
};

export function FormField({
  label,
  hint,
  hintPlacement = "above",
  error,
  required = false,
  id,
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  const field: FieldControlProps = {
    id: controlId,
    ...(describedBy && { "aria-describedby": describedBy }),
    ...(error && { "aria-invalid": true as const }),
    ...(required && { "aria-required": true as const }),
  };

  const hintText = (
    <p id={hintId} className="text-sm text-muted-foreground">
      {hint}
    </p>
  );

  return (
    <div className={cn("flex flex-col gap-1.5 font-sans", className)}>
      <label htmlFor={controlId} className="text-sm font-medium text-muted-foreground">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-error">
            *
          </span>
        )}
      </label>

      {hint && hintPlacement === "above" && hintText}

      {children(field)}

      {hint && hintPlacement === "below" && hintText}

      {/* Error is text with an icon-like prefix, never colour alone. */}
      {error && (
        <p id={errorId} className="text-sm font-medium text-error">
          <span aria-hidden="true">! </span>
          {error}
        </p>
      )}
    </div>
  );
}
