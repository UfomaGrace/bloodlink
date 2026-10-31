// BookedDialog: "You're booked. Thank you." after POST /donation-slots/{id}/bookings succeeds, or
// after a lost connection when the donor's bookings show the place after all.
//
// - One markup, two shapes by CSS alone: below sm a sheet pinned to the bottom (rounded top, a
//   handle, full-width buttons, "Done"); from sm a centred dialog with a dark teal header band,
//   labelled When / Where / Bring rows, "See my bookings" and a close button.
// - Radix Dialog (as shared/ui/dialog), composed here because the band and the sheet need their
//   own layout: role="dialog", aria-labelledby the heading, focus trapped, Escape closes, and the
//   rest of the page is aria-hidden with outside pointer events blocked. We add aria-modal.
// - Focus: the heading on open; on close, `returnFocusTo` (the opener's confirm dialog is gone).
// - Add to calendar is the only filled button (.ics, lib/calendar). Times are Lagos time.
// - Footnote: POST /bookings/{id}/cancellation is allowed until the slot starts. The contract
//   has no way to change a booking, so the line says cancel only.

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CalendarPlus, Check, Droplet, X } from "lucide-react";
import { useRef, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import type { Booking } from "../../api/types";
import { bookingIcs, bookingIcsFileName, downloadIcs } from "../../lib/calendar";
import { dayNames, longDayLabel, slotClockRange, slotLagosDay } from "../../lib/donorWeek";
import { cn } from "../../shared/cn";
import { Button } from "../../shared/ui/button";

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

// Button's secondary look, for the link (Button renders a <button> only).
const secondaryLink = cn(
  "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium",
  "border border-input bg-surface text-foreground hover:bg-(--color-surface-hover)",
  focusRing,
);

export function BookedDialog({
  booking,
  onClose,
  returnFocusTo,
}: {
  /** The booking to show; null keeps the dialog closed. */
  booking: Booking | null;
  onClose: () => void;
  /** Where focus goes once it closes. */
  returnFocusTo: RefObject<HTMLElement | null>;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  return (
    <DialogPrimitive.Root open={booking !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-(--color-text)/50" />
        <DialogPrimitive.Content
          aria-modal="true"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            headingRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusTo.current?.focus();
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col overflow-y-auto rounded-t-2xl bg-surface text-foreground shadow-lg",
            "sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-md",
            "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-lg",
          )}
        >
          {booking && <BookedContent booking={booking} headingRef={headingRef} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function BookedContent({ booking, headingRef }: { booking: Booking; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const { slot } = booking;
  const date = slotLagosDay(slot);
  const { weekdayShort, day } = dayNames(date);
  const { label: time, endsNextDay } = slotClockRange(slot);

  return (
    <>
      <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-border sm:hidden" />

      {/* Below sm: plain white. From sm: the dark teal band, with white focus rings on it. */}
      <div className="relative px-5 pt-4 pb-3 sm:bg-secondary sm:px-6 sm:pt-5 sm:pb-5 sm:text-on-secondary sm:[--color-focus:var(--color-on-secondary)]">
        <span
          aria-hidden="true"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-accent/10 sm:h-9 sm:w-9 sm:bg-surface"
        >
          <Droplet className="h-5 w-5 fill-brand-accent text-brand-accent" />
          <Check className="absolute h-2.5 w-2.5 translate-y-0.5 stroke-[4] text-surface" />
        </span>
        <DialogPrimitive.Title
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 text-xl leading-tight font-semibold tracking-tight outline-none sm:text-2xl"
        >
          You're booked. Thank you.
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-1 text-sm text-primary sm:text-on-secondary-muted">
          One donation can help more than one patient.
        </DialogPrimitive.Description>
        <DialogPrimitive.Close
          aria-label="Close"
          className={cn(
            "absolute top-4 right-4 hidden h-8 w-8 items-center justify-center rounded-full sm:inline-flex",
            "bg-on-secondary/15 text-on-secondary hover:bg-on-secondary/25",
            focusRing,
          )}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </DialogPrimitive.Close>
      </div>

      <div className="flex flex-col gap-4 px-5 pt-2 pb-5 sm:px-6 sm:pt-5">
        <div className="flex items-center gap-4 rounded-md border border-border p-3 sm:block sm:border-0 sm:p-0">
          <div
            aria-hidden="true"
            className="flex w-12 shrink-0 flex-col items-center rounded-md bg-(--color-surface-sunken) py-1 sm:hidden"
          >
            <span className="text-xs font-semibold text-primary uppercase">{weekdayShort}</span>
            <span className="text-xl leading-tight font-semibold tabular-nums">{day}</span>
          </div>
          <dl className="grid min-w-0 gap-1 text-sm sm:gap-2">
            <Row label="When" hideLabelOnPhone>
              <span className="sr-only sm:not-sr-only">
                <time dateTime={slot.startsAt}>{longDayLabel(date)}</time> ·{" "}
              </span>
              <span className="text-base font-semibold tabular-nums sm:text-sm">{time}</span>
              {endsNextDay && <span className="text-muted-foreground"> (ends the next day)</span>}
            </Row>
            <Row label="Where" hideLabelOnPhone>
              <span className="text-primary sm:text-foreground">
                {slot.bank.name} · {slot.bank.area}
              </span>
            </Row>
          </dl>
        </div>

        <dl className="text-sm">
          <Row label="Bring">A photo ID. Eat and drink water first.</Row>
        </dl>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="w-full sm:flex-1"
            onClick={() => downloadIcs(bookingIcsFileName(booking), bookingIcs(booking, Date.now()))}
          >
            <CalendarPlus aria-hidden="true" className="h-4 w-4" />
            Add to calendar
          </Button>
          <Link to="/bookings" className={cn(secondaryLink, "hidden sm:inline-flex sm:flex-1")}>
            See my bookings
          </Link>
          <DialogPrimitive.Close asChild>
            <Button variant="secondary" className="w-full sm:hidden">
              Done
            </Button>
          </DialogPrimitive.Close>
        </div>

        <p className="hidden text-xs text-muted-foreground sm:block">You can cancel until the slot starts.</p>
      </div>
    </>
  );
}

/** A label and its value: side by side from sm; below sm the label can be left to screen readers. */
function Row({ label, hideLabelOnPhone = false, children }: { label: string; hideLabelOnPhone?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-1 sm:grid sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-3">
      <dt className={cn("text-muted-foreground", hideLabelOnPhone && "sr-only sm:not-sr-only")}>
        {label}
        <span className="sm:hidden">:</span>
      </dt>
      <dd className="min-w-0 wrap-break-word">{children}</dd>
    </div>
  );
}
