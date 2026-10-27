/**
 * Select — owner: Ehimare J. Okosun (Team 2)
 *
 * Built on Radix Select, which provides the keyboard model: Enter/Space/arrows open it,
 * arrows move, typing a letter jumps to an option, Enter selects, Escape closes, and focus
 * goes back to the trigger.
 *
 * Use it inside FormField: FormField passes `id`, `aria-describedby`, `aria-invalid` and
 * `aria-required`, and Select puts them on the trigger, so the visible label, hint and error
 * are announced the same way as for an Input.
 *
 * "Any" in filters: Radix throws if an item's value is "", so `allowAny` uses an internal
 * sentinel and hands `undefined` back to you. Your code never sees the sentinel.
 */
import * as RadixSelect from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { forwardRef } from "react"
import { cn } from "../cn"

const ANY_VALUE = "__tesa_any__"

export type SelectOption = {
  /** Must be a non-empty string. */
  value: string
  label: string
  disabled?: boolean
}

export type SelectProps = {
  options: SelectOption[]
  /** `undefined` means nothing chosen (or "Any" when `allowAny` is on). */
  value: string | undefined
  onValueChange: (value: string | undefined) => void
  /** Shown when nothing is chosen and `allowAny` is off. Not a label: always use FormField. */
  placeholder?: string
  /** Adds an "Any" option at the top that maps to `undefined`. For filters. */
  allowAny?: boolean
  anyLabel?: string
  disabled?: boolean
  /** Set `name` to include the value in a native form submit. */
  name?: string
  required?: boolean
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
  "aria-required"?: boolean
  /** Only when there is no visible label, which should be rare. */
  "aria-label"?: string
  className?: string
  contentClassName?: string
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    options,
    value,
    onValueChange,
    placeholder = "Select…",
    allowAny = false,
    anyLabel = "Any",
    disabled,
    name,
    required,
    className,
    contentClassName,
    ...triggerAria
  },
  ref,
) {
  // Radix shows the placeholder when the value is "".
  const internalValue = value ?? (allowAny ? ANY_VALUE : "")

  return (
    <RadixSelect.Root
      value={internalValue}
      onValueChange={(next) => onValueChange(next === ANY_VALUE ? undefined : next)}
      disabled={disabled}
      name={name}
      required={required}
    >
      <RadixSelect.Trigger
        ref={ref}
        {...triggerAria}
        className={cn(
          "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-input)]",
          "bg-[var(--color-surface)] px-3 text-left text-[var(--color-text)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]",
          "data-[placeholder]:text-[var(--color-text-muted)]",
          "aria-[invalid=true]:border-2 aria-[invalid=true]:border-[var(--color-danger)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon asChild>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-[var(--color-text-muted)]" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          // "popper" positions it under the trigger and keeps it inside the viewport on phones.
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            "relative z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)]",
            "max-w-[calc(100vw-16px)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-lg",
            contentClassName,
          )}
        >
          <RadixSelect.ScrollUpButton className="flex h-6 items-center justify-center">
            <ChevronUp aria-hidden="true" className="size-4" />
          </RadixSelect.ScrollUpButton>

          <RadixSelect.Viewport className="p-1">
            {allowAny && <SelectItem value={ANY_VALUE} label={anyLabel} />}
            {options.map((option) => (
              <SelectItem key={option.value} {...option} />
            ))}
          </RadixSelect.Viewport>

          <RadixSelect.ScrollDownButton className="flex h-6 items-center justify-center">
            <ChevronDown aria-hidden="true" className="size-4" />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
})

function SelectItem({ value, label, disabled }: SelectOption) {
  return (
    <RadixSelect.Item
      value={value}
      disabled={disabled}
      className={cn(
        // min-h-10 keeps every option above the 24×24 px target size, with room for touch.
        "relative flex min-h-10 cursor-default select-none items-center rounded-[var(--radius-md)] py-2 pl-8 pr-3 outline-none",
        "data-[highlighted]:bg-[var(--color-surface-hover)]",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      )}
    >
      <RadixSelect.ItemIndicator className="absolute left-2 inline-flex items-center">
        <Check aria-hidden="true" className="size-4" />
      </RadixSelect.ItemIndicator>
      {/* break-words: long labels wrap instead of widening the list off-screen. */}
      <RadixSelect.ItemText>
        <span className="break-words">{label}</span>
      </RadixSelect.ItemText>
    </RadixSelect.Item>
  )
}
