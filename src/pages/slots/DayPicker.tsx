// DayPicker: seven day buttons, today first (Lagos), in a group labelled by the "Choose a day" heading.
//
// - Each says how many slots can be booked that day. A day with nothing to book, and no booking
//   of the donor's, is disabled and says "No slots".
// - A day with the donor's BOOKED slot says "✓ Booked" (teal) instead, and stays selectable.
// - aria-pressed marks the chosen day. It is the only solid primary element on the screen.
// - The accessible name starts with the visible text ("Sat 31 Oct, 3 slots", "Sat 31 Oct, booked"),
//   for voice control.

import { dayNames, shortDayLabel, slotCountLabel, type WeekDay } from "../../lib/donorWeek";
import { cn } from "../../shared/cn";

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

export function DayPicker({
  week,
  selected,
  labelledBy,
  onSelect,
}: {
  week: readonly WeekDay[];
  selected: string | null;
  /** The id of the heading that names the group. */
  labelledBy: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {week.map((day) => {
        const pressed = day.date === selected;
        const { weekdayShort, day: dayOfMonth } = dayNames(day.date);
        const count = slotCountLabel(day.bookable);
        return (
          <button
            key={day.date}
            type="button"
            aria-pressed={pressed}
            disabled={day.disabled}
            onClick={() => onSelect(day.date)}
            aria-label={`${shortDayLabel(day.date)}, ${day.hasBooking ? "booked" : count}`}
            className={cn(
              "flex min-h-20 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-2 text-center",
              focusRing,
              pressed
                ? "border-primary bg-primary text-(--color-on-primary)"
                : day.disabled
                  ? "cursor-not-allowed border-dashed border-border bg-transparent text-muted-foreground"
                  : "border-border bg-surface text-foreground hover:bg-(--color-surface-hover)",
            )}
          >
            <span className={cn("text-xs font-semibold uppercase", !pressed && "text-muted-foreground")}>{weekdayShort}</span>
            <span className="text-2xl leading-tight font-semibold tabular-nums">{dayOfMonth}</span>
            {day.hasBooking ? (
              <span className={cn("text-xs font-semibold", !pressed && "text-primary")}>
                <span aria-hidden="true">✓ </span>Booked
              </span>
            ) : (
              <span className={cn("text-xs", pressed ? "font-medium" : "text-muted-foreground")}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
