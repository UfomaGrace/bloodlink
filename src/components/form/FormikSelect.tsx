// FormikSelect: a Formik-connected select with typed options.
//
//   <FormikSelect name="component" label="Component" options={COMPONENT_OPTIONS} required />
//
// - Same wiring as FormikField: FormField gives the label, hint, error, aria-invalid
//   and aria-describedby; the error only shows once the field is touched.
// - options are typed by their values (e.g. Component), so a typo in a value is a type error.
// - Built on the shared Radix Select. It has no blur event for us, so choosing a value
//   counts as touching the field.
// - 44px tall, with the tokens' visible focus ring.

import { useField } from "formik";
import { cn } from "../../shared/cn";
import { FormField } from "../../shared/ui/form-field";
import { Select } from "../../shared/ui/select";

export type FormikSelectOption<V extends string> = { value: V; label: string; disabled?: boolean };

export type FormikSelectProps<V extends string> = {
  name: string;
  label: string;
  options: readonly FormikSelectOption<V>[];
  hint?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

export function FormikSelect<V extends string>({
  name,
  label,
  options,
  hint,
  placeholder = "Choose…",
  required,
  disabled,
  className,
}: FormikSelectProps<V>) {
  const [field, meta, helpers] = useField<string>(name);
  const error = meta.touched && meta.error ? meta.error : undefined;

  return (
    <FormField label={label} hint={hint} error={error} required={required} className={className}>
      {(control) => (
        <Select
          {...control}
          name={field.name}
          options={[...options]}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          value={field.value || undefined}
          onValueChange={(next) => {
            void helpers.setValue(next ?? "");
            void helpers.setTouched(true, false);
          }}
          className={cn(
            "h-11",
            "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)]",
            "focus-visible:outline-offset-(--focus-ring-offset)",
          )}
        />
      )}
    </FormField>
  );
}
