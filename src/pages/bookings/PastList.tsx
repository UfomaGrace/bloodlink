// PastList: the donor's past bookings on /bookings, most recent first, one row each.
// DateTile: the small Lagos date tile (weekday, day, month) used by these rows and the upcoming cards.
//
// - Row: date tile, bank and area, Lagos time, status. The status is always words; colour is extra:
//   ATTENDED "✓ Donated" (success), CANCELLED "Cancelled" (muted), NO_SHOW "Missed" (warning),
//   and BOOKED in a slot that has ended "Not recorded yet" (muted: the bank hasn't recorded it).
//   The ✓ is hidden from screen readers. Statuses never wrap.
// - The tile is aria-hidden; the full Lagos date is in a <time> for screen readers.
// - Below sm: the bank name truncates, the time joins the area line ("Ikeja · 09:00–11:00") instead
//   of its own column (CSS shows one of the two), and the status sits on the right of the first row.

import type { Booking, BookingStatus } from "../../api/types";
import { dayNames, longDayLabel, slotClockRange, slotLagosDay } from "../../lib/donorWeek";
import { cn } from "../../shared/cn";

export function DateTile({ date, tone }: { date: string; tone: "upcoming" | "past" }) {
  const { weekdayShort, day, monthShort } = dayNames(date);
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex w-12 shrink-0 flex-col items-center rounded-md py-1 leading-tight",
        tone === "upcoming" ? "bg-primary/10 text-primary" : "border border-border bg-(--color-surface-sunken)",
      )}
    >
      <span className={cn("text-[0.6875rem] font-semibold uppercase", tone === "past" && "text-muted-foreground")}>
        {weekdayShort}
      </span>
      <span className="text-xl font-semibold tabular-nums">{day}</span>
      <span className={cn("text-[0.6875rem] font-medium", tone === "past" && "text-muted-foreground")}>{monthShort}</span>
    </div>
  );
}

const PAST_STATUS: Record<BookingStatus, { label: string; mark?: string; className: string }> = {
  ATTENDED: { label: "Donated", mark: "✓", className: "font-medium text-success" },
  CANCELLED: { label: "Cancelled", className: "text-muted-foreground" },
  NO_SHOW: { label: "Missed", className: "font-medium text-warning" },
  BOOKED: { label: "Not recorded yet", className: "text-muted-foreground" },
};

export function PastStatus({ status }: { status: BookingStatus }) {
  const { label, mark, className } = PAST_STATUS[status];
  return (
    <span className={cn("text-sm whitespace-nowrap", className)}>
      {mark && <span aria-hidden="true">{mark} </span>}
      {label}
    </span>
  );
}

export function PastList({ bookings }: { bookings: readonly Booking[] }) {
  return (
    <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-surface">
      {bookings.map((booking) => {
        const { slot } = booking;
        const date = slotLagosDay(slot);
        const time = slotClockRange(slot).label;
        return (
          <li
            key={booking.id}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_7.5rem]"
          >
            <DateTile date={date} tone="past" />
            <div className="min-w-0">
              <p className="font-medium wrap-break-word max-sm:truncate">{slot.bank.name}</p>
              <p className="text-sm text-muted-foreground wrap-break-word">
                <span className="sr-only">
                  <time dateTime={slot.startsAt}>{longDayLabel(date)}</time>,{" "}
                </span>
                {slot.bank.area}
                <span className="tabular-nums sm:hidden"> · {time}</span>
              </p>
            </div>
            <p className="text-sm whitespace-nowrap text-muted-foreground tabular-nums max-sm:hidden">{time}</p>
            <p className="col-start-3 text-right sm:col-start-auto">
              <PastStatus status={booking.status} />
            </p>
          </li>
        );
      })}
    </ul>
  );
}
