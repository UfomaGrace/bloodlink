// UrlFilterSelect: a labelled filter <select> whose value lives in one URL search param.
//
//   <UrlFilterSelect label="Blood group" param="bloodGroup" anyLabel="All groups" options={BLOOD_GROUP_OPTIONS} />
//
// - Shows the param's value only if it is one of `options`; anything else shows the "any" option.
//   The page still decides what it sends to the API (it should check the value the same way).
// - Choosing "any" removes the param. Any change also drops ?page, so a list starts again at page one.
// - Native <select>, styled like the shared Input. Error styling isn't needed: a filter can't be invalid.

import { useSearchParams } from "react-router";
import type { LabelOption } from "../lib/labels";
import { cn } from "../shared/cn";
import { FormField } from "../shared/ui/form-field";

export type UrlFilterSelectProps = {
  label: string;
  /** The URL search param this select reads and writes, e.g. "bloodGroup". Also the select's name. */
  param: string;
  options: readonly LabelOption<string>[];
  /** Text of the first option, which clears the filter, e.g. "All groups". */
  anyLabel: string;
  disabled?: boolean;
  className?: string;
};

const selectClasses = cn(
  "h-11 w-full rounded-[var(--radius-md)] border border-(--color-border-input) bg-(--color-bg) px-3 text-sm",
  "text-(--color-text) font-[family-name:var(--font-sans)]",
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export function UrlFilterSelect({ label, param, options, anyLabel, disabled, className }: UrlFilterSelectProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const current = searchParams.get(param);
  const value = options.some((option) => option.value === current) ? (current ?? "") : "";

  function setValue(next: string) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next) params.set(param, next);
      else params.delete(param);
      params.delete("page"); // new filter → back to the first page
      return params;
    });
  }

  return (
    <FormField label={label} className={className}>
      {(control) => (
        <select
          {...control}
          name={param}
          className={selectClasses}
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
        >
          <option value="">{anyLabel}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}
