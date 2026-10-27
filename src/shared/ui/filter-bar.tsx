/**
 * Filter bar — owner: Ehimare J. Okosun (Team 2)
 *
 * A layout component with no state of its own. Each product keeps its own filter state
 * (often in the URL), passes it in, and puts its Select and Checkbox filters in the slot
 * (children).
 *
 *  - The keyword search has a visible label.
 *  - It shows how many filters are active. "Clear all" appears only when something is set,
 *    so it is never a dead control, and after clearing, focus moves to the search box
 *    (the button you pressed has just disappeared).
 *  - `resultMessage` (e.g. "12 appointments found") is read out by screen readers through a
 *    polite live region. Update it when results arrive, not on every keystroke.
 *  - On a phone it stacks vertically. From the `sm` breakpoint up, the controls sit in a row.
 *
 * Requires: FormField, Input and Button from Muizz's set.
 */
import { forwardRef, useRef, type ReactNode } from "react"
import { cn } from "../cn"
import { Button } from "./button"
import { FormField } from "./form-field"
import { Input } from "./input"

export type FilterBarProps = {
  query: string
  onQueryChange: (query: string) => void
  /** Visible label for the search box, e.g. "Search by patient name or reference". */
  searchLabel: string
  searchHint?: string
  searchPlaceholder?: string
  /** Select, Checkbox or FilterGroup filters. */
  children?: ReactNode
  /** How many filters in the slot are set. The search box is counted for you when non-empty. */
  activeCount: number
  /** Reset every filter, the search query included. */
  onClearAll: () => void
  /** Announced politely, e.g. "12 appointments found". Leave undefined while loading. */
  resultMessage?: string
  /** Names the search landmark. Default "Filters". */
  label?: string
  className?: string
}

export const FilterBar = forwardRef<HTMLDivElement, FilterBarProps>(function FilterBar(
  {
    query,
    onQueryChange,
    searchLabel,
    searchHint,
    searchPlaceholder,
    children,
    activeCount,
    onClearAll,
    resultMessage,
    label = "Filters",
    className,
  },
  ref,
) {
  const searchRef = useRef<HTMLInputElement>(null)
  const totalActive = activeCount + (query.trim() ? 1 : 0)

  function clearAll() {
    onClearAll()
    searchRef.current?.focus()
  }

  return (
    <div ref={ref} role="search" aria-label={label} className={cn("w-full", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <FormField label={searchLabel} hint={searchHint} className="sm:min-w-64 sm:flex-[2]">
          {(control) => (
            <Input
              ref={searchRef}
              {...control}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          )}
        </FormField>
        {children}
      </div>

      <div className="mt-3 flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {/* Always rendered: a live region must exist before its text changes to be announced. */}
        <p aria-live="polite" aria-atomic="true" className="text-sm text-[var(--color-text-muted)]">
          {resultMessage}
        </p>

        {totalActive > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--color-text-muted)]">
              {totalActive} {totalActive === 1 ? "filter" : "filters"} active
            </span>
            <Button variant="ghost" onClick={clearAll}>
              Clear all
            </Button>
          </div>
        )}
      </div>
    </div>
  )
})

export type FilterGroupProps = {
  /** Visible group name, e.g. "Status". Screen readers announce it on each option. */
  legend: string
  children: ReactNode
  className?: string
}

/** Groups related checkboxes (e.g. several statuses) under one visible legend. */
export function FilterGroup({ legend, children, className }: FilterGroupProps) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-1 text-sm font-medium text-[var(--color-text)]">{legend}</legend>
      <div className="flex flex-col gap-2 sm:min-h-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        {children}
      </div>
    </fieldset>
  )
}
