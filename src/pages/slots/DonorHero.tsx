// DonorHero: the dark band at the top of the donor's slot screen.
//
// - Left: eyebrow, the page's h1 and one line under it. The h1 says when the donor's next
//   donation is ("You're donating tomorrow.", by Lagos day), or "Give blood this week." with
//   none, while loading, or when the BOOKED read failed. The line is "3 donations so far · thank
//   you" (GET /bookings?status=ATTENDED); with no donations, while loading, or when that read
//   failed, it is the usual "Book a time…" line instead.
// - Right: "Your next donation", compact: date tile, Lagos time, "bank · area", and Add to calendar
//   (.ics, lib/calendar) and Manage (/bookings) on the right. With none: "No upcoming donation".
//   When the read failed we don't claim there is none: we say so, with Try again.
// - Behind it, a faint static network with one red drop, like the sign-in panel. aria-hidden,
//   pointer-events none, no animation.
// - The band sets the focus ring to white; the white card sets it back to primary.

import { Link } from "react-router";
import type { Booking } from "../../api/types";
import { HeroNetwork } from "../../components/HeroNetwork";
import type { AsyncResult } from "../../hooks/useAsync";
import { bookingIcs, bookingIcsFileName, downloadIcs } from "../../lib/calendar";
import { dayNames, donationsLine, heroHeading, longDayLabel, slotClockRange, slotLagosDay } from "../../lib/donorWeek";
import { cn } from "../../shared/cn";
import { Button } from "../../shared/ui/button";
import { Skeleton } from "../../shared/ui/skeleton";

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const cardAction = cn(
  "inline-flex min-h-8 items-center text-sm font-medium whitespace-nowrap text-primary underline underline-offset-4",
  "hover:text-(--color-primary-hover)",
  focusRing,
);

export function DonorHero({
  next,
  attended,
  now,
}: {
  /** The donor's next booking, once the BOOKED list is here (null: none). */
  next: AsyncResult<Booking | null>;
  attended: Booking[] | null;
  now: number;
}) {
  const thanks = donationsLine(attended);

  return (
    <section
      aria-labelledby="donor-hero-heading"
      className="relative isolate overflow-hidden bg-secondary text-on-secondary [--color-focus:var(--color-on-secondary)]"
    >
      <HeroNetwork />
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-on-secondary-muted uppercase">Donate in Lagos</p>
          <h1 id="donor-hero-heading" className="mt-2 text-3xl leading-tight font-semibold tracking-tight lg:text-[2.375rem]">
            {heroHeading(next.data, now)}
          </h1>
          <p className="mt-2 text-on-secondary-muted">
            {thanks ?? "Book a time at a blood bank near you. It takes about an hour."}
          </p>
        </div>
        <NextDonationCard next={next} />
      </div>
    </section>
  );
}

function NextDonationCard({ next }: { next: AsyncResult<Booking | null> }) {
  const shell = "min-w-0 rounded-md bg-surface p-4 text-foreground shadow-lg [--color-focus:var(--color-primary)]";

  if (next.loading && next.data === null) {
    return (
      <div className={shell}>
        <p className="sr-only">Loading your next donation…</p>
        <Skeleton lines={2} />
      </div>
    );
  }

  if (next.error && next.data === null) {
    return (
      <div className={shell}>
        <p className="text-sm">We couldn't check your bookings just now.</p>
        <Button variant="ghost" className="mt-1 min-h-11 px-0 text-primary underline" onClick={next.reload}>
          Try again
        </Button>
      </div>
    );
  }

  const booking = next.data;
  if (!booking) {
    return (
      <div className={shell}>
        <p className="font-medium">No upcoming donation</p>
      </div>
    );
  }

  const { slot } = booking;
  const date = slotLagosDay(slot);
  const { weekdayShort, day } = dayNames(date);
  const { label: time, endsNextDay } = slotClockRange(slot);

  return (
    <section aria-labelledby="next-donation-heading" className={shell}>
      <h2 id="next-donation-heading" className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Your next donation
      </h2>
      <div className="mt-3 flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex w-12 shrink-0 flex-col items-center rounded-md border border-border bg-(--color-surface-sunken) py-1"
        >
          <span className="text-xs font-semibold text-muted-foreground uppercase">{weekdayShort}</span>
          <span className="text-xl leading-tight font-semibold tabular-nums">{day}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="sr-only">
            <time dateTime={slot.startsAt}>{longDayLabel(date)}</time>
          </p>
          <p className="text-lg leading-tight font-semibold tabular-nums">{time}</p>
          {endsNextDay && <p className="text-xs text-muted-foreground">Ends the next day</p>}
          <p className="text-sm text-muted-foreground wrap-break-word">
            {slot.bank.name} · {slot.bank.area}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <button
            type="button"
            className={cardAction}
            onClick={() => downloadIcs(bookingIcsFileName(booking), bookingIcs(booking, Date.now()))}
          >
            Add to calendar
          </button>
          <Link to="/bookings" className={cardAction}>
            Manage
          </Link>
        </div>
      </div>
    </section>
  );
}
