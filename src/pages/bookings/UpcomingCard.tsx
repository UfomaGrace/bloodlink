// UpcomingCard: one of the donor's upcoming bookings on /bookings, with the Change time note under it.
//
// - Light teal date tile, the Lagos time large, a "Today" / "Tomorrow" chip, "bank · area", and
//   Add to calendar (.ics, lib/calendar): filled when `calendarFilled` (the page decides, so only
//   one filled action shows at a time), otherwise outlined.
// - Footer, while it can be cancelled: "You can cancel until 09:00 tomorrow.", Change time and
//   Cancel booking. A booking whose slot has started: "Started · too late to cancel", no actions.
// - Change time opens a note under the card (not a modal): Keep booking closes it, Cancel and
//   choose cancels the booking and, once cancelled, the page goes to /slots. Focus moves to the
//   note when it opens, and back to Change time when Keep booking or Escape closes it.

import { CalendarPlus } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import type { Booking } from "../../api/types";
import { bookingIcs, bookingIcsFileName, downloadIcs } from "../../lib/calendar";
import { hasSlotStarted } from "../../lib/donations";
import { cancelUntilLabel, longDayLabel, relativeDayLabel, slotClockRange, slotLagosDay } from "../../lib/donorWeek";
import { cn } from "../../shared/cn";
import { Button } from "../../shared/ui/button";
import { DateTile } from "./PastList";

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const footerAction = cn(
  "inline-flex min-h-8 items-center rounded-sm text-sm font-medium whitespace-nowrap underline underline-offset-4",
  "disabled:cursor-not-allowed disabled:opacity-50",
  focusRing,
);

// The shared Button has no dark variant; the page's one dark action passes its colours.
const darkButton = "bg-secondary text-on-secondary hover:bg-(--color-secondary-hover)";

export function UpcomingCard({
  booking,
  where,
  now,
  calendarFilled,
  canCancel,
  disabled,
  noteOpen,
  choosing,
  onOpenNote,
  onCloseNote,
  onCancel,
  onCancelAndChoose,
}: {
  booking: Booking;
  /** "Bank, day, time": names the card's actions for screen readers and voice control. */
  where: string;
  now: number;
  calendarFilled: boolean;
  canCancel: boolean;
  /** Another cancellation is in flight. */
  disabled: boolean;
  noteOpen: boolean;
  /** Cancel and choose is in flight for this booking. */
  choosing: boolean;
  onOpenNote: () => void;
  onCloseNote: () => void;
  onCancel: () => void;
  onCancelAndChoose: () => void;
}) {
  const { slot } = booking;
  const date = slotLagosDay(slot);
  const chip = relativeDayLabel(date, now);
  const { label: time, endsNextDay } = slotClockRange(slot);
  const started = hasSlotStarted(slot, now);

  const noteId = useId();
  const changeRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (noteOpen) noteRef.current?.focus();
  }, [noteOpen]);

  function closeNote() {
    onCloseNote();
    changeRef.current?.focus();
  }

  function onNoteKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !choosing) {
      event.stopPropagation();
      closeNote();
    }
  }

  return (
    <li className="flex flex-col gap-2">
      <div className="rounded-md border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-4 p-4">
          <DateTile date={date} tone="upcoming" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-2xl leading-tight font-semibold tabular-nums">
                <span className="sr-only">
                  <time dateTime={slot.startsAt}>{longDayLabel(date)}</time>,{" "}
                </span>
                {time}
              </h3>
              {chip && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-primary">
                  {chip}
                </span>
              )}
            </div>
            {endsNextDay && <p className="text-xs text-muted-foreground">Ends the next day</p>}
            <p className="mt-0.5 text-sm text-muted-foreground wrap-break-word">
              {slot.bank.name} · {slot.bank.area}
            </p>
          </div>
          <Button
            variant={calendarFilled ? "primary" : "secondary"}
            size="sm"
            className="h-9 shrink-0"
            onClick={() => downloadIcs(bookingIcsFileName(booking), bookingIcs(booking, Date.now()))}
            aria-label={`Add to calendar ${where}`}
          >
            <CalendarPlus aria-hidden="true" className="size-4" />
            Add to calendar
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border bg-(--color-surface-sunken) px-4 py-2">
          {canCancel ? (
            <>
              <p className="mr-auto text-sm text-muted-foreground">{cancelUntilLabel(slot, now)}</p>
              <button
                ref={changeRef}
                type="button"
                className={cn(footerAction, "text-primary hover:text-(--color-primary-hover)")}
                disabled={disabled}
                aria-expanded={noteOpen}
                aria-controls={noteOpen ? noteId : undefined}
                aria-label={`Change time ${where}`}
                onClick={noteOpen ? closeNote : onOpenNote}
              >
                Change time
              </button>
              <button
                type="button"
                className={cn(footerAction, "text-error")}
                disabled={disabled}
                // Starts with the visible words, so voice control users can say "Cancel booking".
                aria-label={`Cancel booking ${where}`}
                onClick={onCancel}
              >
                Cancel booking
              </button>
            </>
          ) : (
            started && <p className="text-sm font-medium text-muted-foreground">Started · too late to cancel</p>
          )}
        </div>
      </div>

      {noteOpen && (
        <div
          ref={noteRef}
          id={noteId}
          role="group"
          aria-labelledby={`${noteId}-title`}
          aria-describedby={`${noteId}-text`}
          tabIndex={-1}
          onKeyDown={onNoteKeyDown}
          className={cn(
            "flex flex-wrap items-center gap-4 rounded-md border border-border border-l-4 border-l-primary bg-surface p-4",
            focusRing,
          )}
        >
          <p className="min-w-0 flex-1 basis-80 text-sm">
            <strong id={`${noteId}-title`} className="font-semibold">
              Change time?
            </strong>{" "}
            <span id={`${noteId}-text`}>
              This cancels your current booking first, then you pick a new time. If the new time is full, you'll need to
              book again.
            </span>
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" size="sm" className="h-9" disabled={choosing} onClick={closeNote}>
              Keep booking
            </Button>
            <Button size="sm" className={cn("h-9", darkButton)} loading={choosing} onClick={onCancelAndChoose}>
              Cancel and choose
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
