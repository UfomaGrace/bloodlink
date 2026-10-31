// DonorHero: the dark band at the top of the donor's slot screen.
//
// - Left: eyebrow, the page's h1, one line, and the donations pill ("3 donations · last on 4 Oct",
//   from GET /bookings?status=ATTENDED). The pill is hidden with no donations, while loading, or
//   when that read failed: it is encouragement, not information the donor needs.
// - Right: "Your next donation", the soonest BOOKED booking that hasn't ended. Date tile, Lagos
//   time, bank and area, "Today" / "Tomorrow" when it applies, Add to calendar (.ics, lib/calendar)
//   and Manage booking (/bookings). With none: "No upcoming donation" and nothing else.
// - Behind it, a faint static network with one red drop, like the sign-in panel. aria-hidden,
//   pointer-events none, no animation.
// - The band sets the focus ring to white; the white card sets it back to primary.

import { Droplet } from "lucide-react";
import { Link } from "react-router";
import type { Booking } from "../../api/types";
import type { AsyncResult } from "../../hooks/useAsync";
import { bookingIcs, bookingIcsFileName, downloadIcs } from "../../lib/calendar";
import {
  dayNames,
  donationsPillLabel,
  donationsSummary,
  longDayLabel,
  relativeDayLabel,
  slotClockRange,
  slotLagosDay,
} from "../../lib/donorWeek";
import { cn } from "../../shared/cn";
import { Button } from "../../shared/ui/button";
import { Skeleton } from "../../shared/ui/skeleton";

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const cardAction = cn(
  "inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4",
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
  const summary = attended ? donationsSummary(attended) : null;

  return (
    <section
      aria-labelledby="donor-hero-heading"
      className="relative isolate overflow-hidden bg-secondary text-on-secondary [--color-focus:var(--color-on-secondary)]"
    >
      <HeroNetwork />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:py-14">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-on-secondary-muted uppercase">Donate in Lagos</p>
          <h1 id="donor-hero-heading" className="mt-3 text-4xl font-semibold tracking-tight lg:text-5xl">
            Give blood this week.
          </h1>
          <p className="mt-3 text-on-secondary-muted">Book a time at a blood bank near you. It takes about an hour.</p>
          {summary && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-(--color-secondary-hover) py-1.5 pr-4 pl-1.5 text-sm">
              <span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-full bg-surface">
                <Droplet className="size-4 fill-brand-accent text-brand-accent" />
              </span>
              <span>{donationsPillLabel(summary)}</span>
            </p>
          )}
        </div>
        <NextDonationCard next={next} now={now} />
      </div>
    </section>
  );
}

function NextDonationCard({ next, now }: { next: AsyncResult<Booking | null>; now: number }) {
  const shell = "min-w-0 rounded-md bg-surface p-5 text-foreground shadow-lg [--color-focus:var(--color-primary)]";

  if (next.loading && next.data === null) {
    return (
      <div className={shell}>
        <p className="sr-only">Loading your next donation…</p>
        <Skeleton lines={3} />
      </div>
    );
  }

  if (next.error && next.data === null) {
    return (
      <div className={shell}>
        <p className="text-sm">We couldn't check your bookings just now.</p>
        <Button variant="ghost" className="mt-2 min-h-11 px-0 text-primary underline" onClick={next.reload}>
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
  const relative = relativeDayLabel(date, now);
  const { label: time, endsNextDay } = slotClockRange(slot);

  return (
    <section aria-labelledby="next-donation-heading" className={shell}>
      <h2 id="next-donation-heading" className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Your next donation
      </h2>
      <div className="mt-4 flex items-start gap-4">
        <div
          aria-hidden="true"
          className="flex w-14 shrink-0 flex-col items-center rounded-md border border-border bg-(--color-surface-sunken) py-1.5"
        >
          <span className="text-xs font-semibold text-muted-foreground uppercase">{weekdayShort}</span>
          <span className="text-2xl leading-tight font-semibold tabular-nums">{day}</span>
        </div>
        <div className="min-w-0">
          {relative && (
            <p className="mb-1 inline-flex rounded-full bg-(--color-info-subtle) px-2 py-0.5 text-xs font-semibold text-info">
              {relative}
            </p>
          )}
          <p className="sr-only">
            <time dateTime={slot.startsAt}>{longDayLabel(date)}</time>
          </p>
          <p className="text-xl font-semibold tabular-nums">
            {time}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              Lagos time{endsNextDay ? ", ends the next day" : ""}
            </span>
          </p>
          <p className="text-sm text-muted-foreground wrap-break-word">
            {slot.bank.name}, {slot.bank.area}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 border-t border-border pt-2">
        <button
          type="button"
          className={cardAction}
          onClick={() => downloadIcs(bookingIcsFileName(booking), bookingIcs(booking, Date.now()))}
        >
          Add to calendar
        </button>
        <Link to="/bookings" className={cardAction}>
          Manage booking
        </Link>
      </div>
    </section>
  );
}

// The sign-in panel's network, trimmed to a band: lines and dots, one red drop on a vertex.
const NETWORK_LINES = [
  "M-20 60 L120 30 L280 90 L440 40 L600 110 L760 60 L900 100",
  "M-20 220 L150 180 L300 240 L470 190 L620 250 L780 200 L900 230",
  "M120 30 L150 180 L110 330",
  "M440 40 L470 190 L430 330",
  "M600 110 L620 250",
  "M760 60 L780 200 L740 330",
];

const NETWORK_NODES: readonly (readonly [x: number, y: number, r: number])[] = [
  [120, 30, 5], [280, 90, 4], [440, 40, 5], [760, 60, 5],
  [150, 180, 5], [300, 240, 4], [470, 190, 5], [620, 250, 4], [780, 200, 5],
];

const NETWORK_DROP: readonly [x: number, y: number] = [600, 110];

// lucide's Droplet (the logo), on its 24×24 grid.
const DROP_PATH =
  "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z";

/** Decorative and static. Anchored to the band's right edge; narrow screens crop it from the left. */
function HeroNetwork() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-full max-w-225 overflow-hidden">
      <svg
        className="h-full w-full"
        viewBox="0 0 900 330"
        preserveAspectRatio="xMaxYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <g fill="none" className="stroke-on-secondary" strokeWidth="1.2" strokeOpacity="0.10">
          {NETWORK_LINES.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g className="fill-on-secondary" fillOpacity="0.18">
          {NETWORK_NODES.map(([x, y, r]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
        <g transform={`translate(${NETWORK_DROP[0]} ${NETWORK_DROP[1]})`}>
          <path
            d={DROP_PATH}
            transform="scale(2.2) translate(-12 -12)"
            fill="none"
            className="stroke-brand-accent"
            strokeWidth="1.5"
            opacity="0.6"
            vectorEffect="non-scaling-stroke"
          />
          <path d={DROP_PATH} transform="translate(-12 -12)" className="fill-brand-accent" />
        </g>
      </svg>
    </div>
  );
}
