// DayPicker: seven day buttons, today first (Lagos), in a group labelled by the "Choose a day" heading.
//
// - Each says how many slots can be booked that day. A day with nothing to book, and no booking
//   of the donor's, is disabled and says "No slots".
// - A day with the donor's BOOKED slot says "✓ Booked" (teal) instead, and stays selectable.
// - aria-pressed marks the chosen day. It is the only solid primary element on the screen.
// - The accessible name starts with the visible text ("Sat 31 Oct, 3 slots", "Sat 31 Oct, booked"),
//   for voice control.
// - Below sm: one row of 66px buttons that scrolls sideways (scroll-snap), edge to edge, so the
//   page itself never scrolls sideways. When the chosen day changes and the row overflows, it is
//   scrolled into view. From sm: the seven-column grid, which never scrolls.

import { useEffect, useRef } from "react";
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
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Only the phone row overflows; the grid never does, so wider screens never scroll for this.
  useEffect(() => {
    const group = groupRef.current;
    if (!group || group.scrollWidth <= group.clientWidth) return;
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);

  return (
    <div
      ref={groupRef}
      role="group"
      aria-labelledby={labelledBy}
      className={cn(
        // py-1 keeps the focus ring clear of the scroller's edges.
        "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 py-1",
        "sm:mx-0 sm:grid sm:snap-none sm:grid-cols-7 sm:overflow-visible sm:p-0",
      )}
    >
      {week.map((day) => {
        const pressed = day.date === selected;
        const { weekdayShort, day: dayOfMonth } = dayNames(day.date);
        const count = slotCountLabel(day.bookable);
        return (
          <button
            key={day.date}
            ref={pressed ? selectedRef : undefined}
            type="button"
            aria-pressed={pressed}
            disabled={day.disabled}
            onClick={() => onSelect(day.date)}
            aria-label={`${shortDayLabel(day.date)}, ${day.hasBooking ? "booked" : count}`}
            className={cn(
              "flex min-h-20 w-[66px] min-w-0 shrink-0 snap-start flex-col sm:w-auto items-center justify-center gap-0.5 rounded-md border px-1 py-2 text-center",
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
