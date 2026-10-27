// FormikField: one Formik-connected form field (label + control + hint + error).
//
//   <FormikField name="email" label="Email" type="email" required />
//   <FormikField name="notes" label="Notes" as="textarea" hint="Optional" />
//   <FormikField name="group" label="Blood group" as="select" options={groups} />
//
// - Reads value/touched/error from Formik with useField, so the form only needs a name.
// - FormField does the a11y wiring: label htmlFor, aria-invalid, aria-describedby (hint + error).
// - The error only shows once the field is touched (blurred, changed, or the form was submitted).
// - Every control is at least 44px tall and keeps the tokens' visible focus ring.

import { useField } from "formik";
import type { ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "../../shared/cn";
import { FormField, type FieldControlProps } from "../../shared/ui/form-field";
import { Input, type InputProps } from "../../shared/ui/input";
import { Select, type SelectOption } from "../../shared/ui/select";

// Props FormikField sets itself, so callers can't pass them.
type ManagedProps =
  | "name"
  | "id"
  | "value"
  | "onChange"
  | "onBlur"
  | "className"
  | "required"
  | "aria-describedby"
  | "aria-invalid"
  | "aria-required";

type CommonProps = {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
};

type InputFieldProps = CommonProps &
  Omit<InputProps, ManagedProps> & {
    as?: "input";
    /** Rendered inside the right edge of the input, e.g. a show-password button. */
    endAdornment?: ReactNode;
  };

type TextareaFieldProps = CommonProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, ManagedProps> & {
    as: "textarea";
  };

type SelectFieldProps = CommonProps & {
  as: "select";
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
};

export type FormikFieldProps = InputFieldProps | TextareaFieldProps | SelectFieldProps;

// 44px minimum touch height for every control.
const controlHeight = "h-11";

// shared/ui/textarea.tsx is still an empty stub, so this mirrors the shared Input's styling.
const textareaClasses = cn(
  "min-h-24 w-full rounded-[var(--radius-md)] px-3 py-2.5 text-sm resize-y",
  "bg-[var(--color-surface)] text-[var(--color-text)] font-[family-name:var(--font-sans)]",
  "border border-[var(--color-border-input)]",
  "placeholder:text-[var(--color-text-muted)]",
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)]",
  "focus-visible:[outline-offset:var(--focus-ring-offset)]",
  "aria-[invalid=true]:border-2 aria-[invalid=true]:border-[var(--color-danger)]",
  "disabled:cursor-not-allowed disabled:bg-[var(--color-surface-sunken)] disabled:opacity-60",
);

export function FormikField(props: FormikFieldProps) {
  const { name, label, hint, required, className, ...variant } = props;
  const [field, meta, helpers] = useField<string>(name);
  const error = meta.touched && meta.error ? meta.error : undefined;

  function renderControl(control: FieldControlProps) {
    if (variant.as === "select") {
      return (
        <Select
          {...control}
          name={field.name}
          options={variant.options}
          placeholder={variant.placeholder}
          disabled={variant.disabled}
          required={required}
          value={field.value || undefined}
          onValueChange={(next) => {
            // Radix Select has no blur event for us, so choosing a value counts as touching it.
            void helpers.setValue(next ?? "");
            void helpers.setTouched(true, false);
          }}
          className={cn(
            controlHeight,
            "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)]",
            "focus-visible:outline-offset-(--focus-ring-offset)",
          )}
        />
      );
    }

    if (variant.as === "textarea") {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop "as" so it never reaches the DOM
      const { as: _as, ...rest } = variant;
      return <textarea {...rest} {...control} {...field} value={field.value ?? ""} required={required} className={textareaClasses} />;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- same as above
    const { as: _as, endAdornment, ...rest } = variant;
    const input = (
      <Input
        {...rest}
        {...control}
        {...field}
        value={field.value ?? ""}
        required={required}
        className={cn(controlHeight, endAdornment ? "pr-12" : undefined)}
      />
    );

    if (!endAdornment) return input;
    return (
      <div className="relative">
        {input}
        <div className="absolute inset-y-0 right-0.5 flex items-center">{endAdornment}</div>
      </div>
    );
  }

  return (
    <FormField
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {renderControl}
    </FormField>
  );
}
