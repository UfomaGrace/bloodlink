/**
 * Checkbox — owner: Ehimare J. Okosun (Team 2)
 *
 * Built on Radix Checkbox (a button with role="checkbox"). Space toggles it. The visible
 * label is a real <label htmlFor>, so clicking the text toggles it too and gives it its
 * accessible name. When checked it shows a check mark, so the state never depends on
 * colour alone.
 *
 * For a group of checkboxes (for example several statuses), wrap them in a <fieldset> with
 * a <legend>. FilterGroup in filter-bar.tsx does this.
 */
import * as RadixCheckbox from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"
import { forwardRef, useId, type ReactNode } from "react"
import { cn } from "../cn"

export type CheckboxProps = {
  label: ReactNode
  /** Extra help text, linked with aria-describedby. */
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  /** Set `name` (and `value`) to include it in a native form submit. */
  name?: string
  value?: string
  required?: boolean
  id?: string
  className?: string
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { label, description, checked, onCheckedChange, disabled, name, value, required, id, className },
  ref,
) {
  const autoId = useId()
  const checkboxId = id ?? autoId
  const descriptionId = description ? `${checkboxId}-description` : undefined

  return (
    <div className={cn("flex items-start gap-2", className)}>
      <RadixCheckbox.Root
        ref={ref}
        id={checkboxId}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
        name={name}
        value={value}
        required={required}
        aria-describedby={descriptionId}
        className={cn(
          // A 20 px box, and the ::after extends the hit area to 24×24 px (WCAG 2.5.8).
          // -inset-1 (4 px), not 2 px: the ::after is measured from inside the 2 px border.
          "relative mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-[4px]",
          "border-2 border-[var(--color-border-input)] bg-[var(--color-surface)]",
          "after:absolute after:-inset-1 after:content-['']",
          "data-[state=checked]:border-[var(--color-primary)] data-[state=checked]:bg-[var(--color-primary)] data-[state=checked]:text-[var(--color-on-primary)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <RadixCheckbox.Indicator>
          <Check aria-hidden="true" strokeWidth={3} className="size-3.5" />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>

      <div className="min-w-0">
        <label
          htmlFor={checkboxId}
          className={cn("block break-words text-sm text-[var(--color-text)]", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}
        >
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-sm text-[var(--color-text-muted)]">
            {description}
          </p>
        )}
      </div>
    </div>
  )
})
