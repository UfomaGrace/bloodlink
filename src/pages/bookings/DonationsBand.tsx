// DonationsBand: the dark band at the top of /bookings, edge to edge like the slots hero.
//
// - The page's h1. Donations are the donor's ATTENDED bookings (lib/donorWeek donationsBand).
//     n > 0: "3 donations so far", then "Thank you. Each one helps a patient in Lagos. Last on 31 October."
//     n = 0: "Your first donation is waiting."
//     Loading, or the read failed: "My bookings", no count. The page shows the error below it.
//   "My bookings:" leads the h1 for screen readers only, so the page's heading names the page.
// - Right: one drop per donation, up to 5. Decorative (aria-hidden), like the network behind it.
// - The band sets the focus ring to white.

import { Droplet } from "lucide-react";
import type { Booking } from "../../api/types";
import { HeroNetwork } from "../../components/HeroNetwork";
import { donationsBand } from "../../lib/donorWeek";

const MAX_DROPS = 5;

export function DonationsBand({ bookings, now }: { bookings: readonly Booking[] | null; now: number }) {
  const band = bookings && donationsBand(bookings, now);

  return (
    <section
      aria-labelledby="bookings-heading"
      className="relative isolate overflow-hidden bg-secondary text-on-secondary [--color-focus:var(--color-on-secondary)]"
    >
      <HeroNetwork />
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-6 px-4 py-7 sm:px-8">
        <div className="min-w-0">
          <h1 id="bookings-heading" className="text-3xl leading-tight font-semibold tracking-tight">
            {!band ? (
              "My bookings"
            ) : band.count === 0 ? (
              <>
                <span className="sr-only">My bookings:</span> Your first donation is waiting.
              </>
            ) : (
              <>
                <span className="sr-only">My bookings:</span>{" "}
                <span className="mr-1 align-middle text-5xl font-bold tabular-nums">{band.count}</span>{" "}
                <span className="align-middle">{band.count === 1 ? "donation" : "donations"} so far</span>
              </>
            )}
          </h1>
          <p className="mt-2 text-on-secondary-muted">
            {band && band.count > 0
              ? `Thank you. Each one helps a patient in Lagos. Last on ${band.lastLabel}.`
              : "Your donation bookings. Times are Lagos time."}
          </p>
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
