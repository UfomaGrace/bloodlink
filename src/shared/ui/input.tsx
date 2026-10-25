// Input
// Owner: Muizz
//
// Use inside FormField so it gets its label, hint and error wiring:
//   <FormField label="Quantity" required>
//     {(field) => <Input type="number" {...field} {...register("quantity")} />}
//   </FormField>
//
// forwardRef makes it work with React Hook Form's register().
// Error styling switches on automatically from aria-invalid, which FormField sets.

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-10 w-full rounded-[var(--radius-md)] px-3 text-sm",
        "bg-[var(--color-bg)] text-[var(--color-text)] font-[family-name:var(--font-sans)]",
        "border border-[var(--color-border-input)]",
        "placeholder:text-[var(--color-text-muted)]",
        "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)]",
        "focus-visible:[outline-offset:var(--focus-ring-offset)]",
        "aria-[invalid=true]:border-2 aria-[invalid=true]:border-[var(--color-danger)]",
        "disabled:cursor-not-allowed disabled:bg-[var(--color-surface)] disabled:opacity-60",
        className,
      )}
      {...rest}
    />
  );
});
