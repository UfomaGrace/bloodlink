// DonationsBand: the dark band at the top of /bookings, edge to edge like the slots hero.
//
// - The page's h1. Donations are the donor's ATTENDED bookings (lib/donorWeek donationsBand).
//     n > 0: "3 donations so far", then "Thank you. Each one helps a patient in Lagos. Last on 31 October."
//     n = 0: "Your first donation is waiting."
//     Loading, or the read failed: "My bookings", no count. The page shows the error below it.
//   "My bookings:" leads the h1 for screen readers only, so the page's heading names the page.
// - Right: one drop per donation, up to 5. Decorative (aria-hidden), like the network behind it.
// - The band sets the focus ring to white.
// - Below sm: 20px padding; with donations, the count stands at 48px to the left of the words
//   (a copy hidden from screen readers; the h1's own count is screen-reader-only there), and the
//   line is shorter: "Thank you. Last on 31 October."

import { Droplet } from "lucide-react";
import type { Booking } from "../../api/types";
import { HeroNetwork } from "../../components/HeroNetwork";
import { donationsBand } from "../../lib/donorWeek";
import { cn } from "../../shared/cn";

const MAX_DROPS = 5;

export function DonationsBand({ bookings, now }: { bookings: readonly Booking[] | null; now: number }) {
  const band = bookings && donationsBand(bookings, now);

  return (
    <section
      aria-labelledby="bookings-heading"
      className="relative isolate overflow-hidden bg-secondary text-on-secondary [--color-focus:var(--color-on-secondary)]"
    >
      <HeroNetwork />
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-6 px-5 py-5 sm:px-8 sm:py-7">
        <div className="flex min-w-0 items-center gap-4">
          {band && band.count > 0 && (
            <span aria-hidden="true" className="shrink-0 text-5xl leading-none font-bold tabular-nums sm:hidden">
              {band.count}
            </span>
          )}
          <div className="min-w-0">
            <h1
              id="bookings-heading"
              className={cn(
                "text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-3xl",
                band && band.count > 0 && "max-sm:text-xl",
              )}
            >
              {!band ? (
                "My bookings"
              ) : band.count === 0 ? (
                <>
                  <span className="sr-only">My bookings:</span> Your first donation is waiting.
                </>
              ) : (
                <>
                  <span className="sr-only">My bookings:</span>{" "}
                  <span className="mr-1 align-middle text-5xl font-bold tabular-nums max-sm:sr-only">{band.count}</span>{" "}
                  <span className="align-middle">{band.count === 1 ? "donation" : "donations"} so far</span>
                </>
              )}
            </h1>
            <p className="mt-2 text-on-secondary-muted max-sm:mt-0.5 max-sm:text-sm">
              {band && band.count > 0 ? (
                <>
                  Thank you.<span className="max-sm:hidden"> Each one helps a patient in Lagos.</span> Last on{" "}
                  {band.lastLabel}.
                </>
              ) : (
                "Your donation bookings. Times are Lagos time."
              )}
            </p>
          </div>
        </div>
        {band && band.count > 0 && (
          <div aria-hidden="true" className="hidden shrink-0 gap-2 sm:flex">
            {Array.from({ length: Math.min(band.count, MAX_DROPS) }, (_, i) => (
              <Droplet key={i} className="size-5 fill-brand-accent text-brand-accent" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
