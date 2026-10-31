// BookingsPage (/bookings): the signed-in donor's own bookings, upcoming and past, with status.
//
// - GET /bookings holds only the donor's own. Every page is read (lib/donationQueries
//   listAllBookings), so the groups (lib/donorWeek donorBookingGroups) are never cut off by paging.
//   Upcoming: BOOKED and the slot hasn't ended, soonest first. Past: everything else, most recent first.
// - Layout drops its column for this page (FullBleed in App.tsx): the donations band (the h1) runs
//   edge to edge, and the page sets its own max-w-4xl container below it. The band shows no count
//   while loading or when the read failed; the error is shown below it, with Try again.
// - Upcoming cards (UpcomingCard). Add to calendar is filled on the first card only, and on none
//   while a Change time note is open, so only one filled action shows at a time. With nothing
//   upcoming: "Nothing booked yet." and Book a donation (/slots), the page's one filled action.
// - Past rows (PastList): "✓ Donated", "Cancelled", "Missed", "Not recorded yet".
// - Times are Lagos time, labelled.
// - "Cancel booking" (canCancelBooking: BOOKED and the slot hasn't started) → ConfirmDialog →
//   POST /bookings/{id}/cancellation. Not optimistic: the dialog stays open, busy, until the
//   service answers, and the list is then read again to show what the service holds.
//     Cancelled → success message and a quiet reload.
//     409 BOOKING_NOT_ACTIVE, SLOT_CLOSED → each its own message (cancelBookingRefusal), and a reload.
//     404 or any other 409 → the service's message, and a reload.
//     Lost connection or timeout → no retry. We read the bookings again and say what this one
//       now shows ("We couldn't confirm. Your booking for … now shows as Cancelled.").
// - "Change time" → a note under the card. "Cancel and choose" sends the same cancellation (the
//   note is the confirmation); once cancelled we go to /slots to pick a new time. Any failure is
//   handled as above, the note closes and the donor stays here.
// - States: loading, error (+ Try again, Reference), list, refreshing.
// - Mock only: "Simulate state" swaps in upcoming and past bookings, or none, with dates counted
//   from the moment it is picked. Prism's own answer is one booking in a slot that has started,
//   so the page starts on "Upcoming and past bookings" (three donations, 4, 8 and 12 months back).

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError, IS_MOCK, toApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { Booking } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { MockControls } from "../components/MockControls";
import { ResultAlert, type Notice } from "../components/ResultAlert";
import { useAsync } from "../hooks/useAsync";
import { useNow } from "../hooks/useNow";
import { listAllBookings } from "../lib/donationQueries";
import { cancelBookingRefusal, canCancelBooking, slotWhenLabel, unconfirmedCancelMessage } from "../lib/donations";
import { donorBookingGroups } from "../lib/donorWeek";
import { BOOKING_LIST_SIMULATION_LABELS, simulateBookings, type BookingListSimulation } from "../lib/mockSimulation";
import { viewerOf } from "../lib/requestActions";
import { cn } from "../shared/cn";
import { ConfirmDialog } from "../shared/ui/dialog";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";
import { DonationsBand } from "./bookings/DonationsBand";
import { PastList } from "./bookings/PastList";
import { UpcomingCard } from "./bookings/UpcomingCard";

// "Started · too late to cancel" must not wait long to become true while the page is open.
const CLOCK_TICK_MS = 30_000;

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const filledLink = cn(
  "inline-flex h-10 shrink-0 items-center rounded-md bg-primary px-4 text-sm font-medium text-(--color-on-primary)",
  "hover:bg-(--color-primary-hover)",
  focusRing,
);

function whereLabel(booking: Booking): string {
  return `${booking.slot.bank.name}, ${slotWhenLabel(booking.slot)}`;
}

/** Our words for a refused cancellation, keeping the service's Reference. */
function withMessage(error: ApiError, message: string): ApiError {
  return new ApiError({ ...error, message });
}

export default function BookingsPage() {
  const { session } = useAuth();
  const viewer = viewerOf(session);
  const now = useNow(CLOCK_TICK_MS);
  const navigate = useNavigate();

  const bookings = useAsync((signal) => listAllBookings(signal), []);

  // A reload after a cancellation keeps the bookings on screen instead of the skeleton.
  const [quiet, setQuiet] = useState(false);
  if (quiet && !bookings.loading) setQuiet(false); // answered: the next load (Try again) shows the skeleton
  const refreshing = quiet && bookings.loading && bookings.data !== null;
  function reloadQuietly() {
    setQuiet(true);
    bookings.reload();
  }

  // Mock only: the simulation picked, and when (its dates count from then). Starts on the sample
  // bookings, so the band shows the donor's donations against Prism.
  const [simulated, setSimulated] = useState<{ state: BookingListSimulation; at: number } | null>(() =>
    IS_MOCK ? { state: "SAMPLE", at: Date.now() } : null,
  );
  function pickSimulation(next: BookingListSimulation | null) {
    setSimulated(next && { state: next, at: Date.now() });
  }
  const donorName = session?.user.displayName ?? "Donor";
  const data =
    bookings.data && IS_MOCK && simulated ? simulateBookings(simulated.state, simulated.at, donorName) : bookings.data;

  const [notice, setNotice] = useState<Notice | null>(null);
  const [target, setTarget] = useState<Booking | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inFlight, setInFlight] = useState<string | null>(null);
  // The booking whose Change time note is open, if any.
  const [changing, setChanging] = useState<string | null>(null);

  function openCancel(booking: Booking) {
    setChanging(null);
    setTarget(booking);
    setConfirmOpen(true);
  }

  /**
   * Cancels `booking`. Resolves either way, so ConfirmDialog never stays open; we close it
   * ourselves in the same update. `then`: what a cancellation leads to, a message here or /slots.
   */
  async function cancel(booking: Booking, then: "stay" | "choose") {
    setNotice(null);
    setInFlight("Cancelling your booking…");
    try {
      await api.cancelBooking(booking.id);
      setConfirmOpen(false);
      if (then === "choose") {
        navigate("/slots");
        return;
      }
      setNotice({
        tone: "success",
        message: `Booking cancelled: ${whereLabel(booking)}. The place is free for someone else.`,
      });
      reloadQuietly();
    } catch (e) {
      setConfirmOpen(false);
      setChanging(null);
      const error = toApiError(e);
      if (error.isConnectionProblem) {
        await checkAfterLostConnection(booking);
        return;
      }
      const message = cancelBookingRefusal(error.code);
      setNotice({ tone: "error", error: message ? withMessage(error, message) : error });
      if (error.status === 409 || error.status === 404) reloadQuietly();
    } finally {
      setInFlight(null);
    }
  }

  /**
   * After a timeout or lost connection we can't tell whether the cancellation happened. We don't
   * send it again: we read the bookings and say what this one now shows.
   */
  async function checkAfterLostConnection(booking: Booking) {
    setInFlight("We couldn't confirm. Checking your booking…");
    let status: Booking["status"] | null | undefined;
    try {
      status = (await listAllBookings()).find((b) => b.id === booking.id)?.status;
    } catch {
      status = null;
    }
    setNotice({ tone: "info", message: unconfirmedCancelMessage(status, whereLabel(booking)) });
    reloadQuietly();
  }

  const statusLine = inFlight ?? (refreshing ? "Checking your bookings…" : "");
  const groups = data && donorBookingGroups(data, now);

  return (
    <>
      <DonationsBand bookings={data} now={now} />

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8">
        {/* What is in flight, or that the list is being checked again. Always rendered, so it is announced. */}
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {statusLine}
        </p>

        {notice && <ResultAlert notice={notice} className="mt-2" />}

        <MockControls
          className="mt-4"
          simulation={{ value: simulated?.state ?? null, onChange: pickSimulation, labels: BOOKING_LIST_SIMULATION_LABELS }}
        />

        <div className="mt-4" aria-busy={bookings.loading || undefined}>
          {bookings.loading && !refreshing ? (
            <div className="flex flex-col gap-4">
              <p role="status" className="text-sm font-medium">
                Loading your bookings…
              </p>
              <Skeleton lines={6} />
            </div>
          ) : bookings.error ? (
            <ErrorState
              // ErrorState takes strings only; pre-line puts the Reference on its own line.
              className="whitespace-pre-line"
              title="We couldn't load your bookings"
              description={`${bookings.error.message}\nReference: ${bookings.error.requestId}`}
              onRetry={bookings.reload}
            />
          ) : groups ? (
            <div className="flex flex-col gap-8">
              <section aria-labelledby="upcoming-heading">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <h2 id="upcoming-heading" className="text-lg font-semibold">
                    Upcoming
                  </h2>
                  <p className="text-sm text-muted-foreground">Times are Lagos time.</p>
                </div>
                {groups.upcoming.length === 0 ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-md border border-dashed border-border bg-surface p-5">
                    <p className="font-medium">Nothing booked yet.</p>
                    <Link to="/slots" className={filledLink}>
                      Book a donation
                    </Link>
                  </div>
                ) : (
                  <ul className="mt-3 flex flex-col gap-4">
                    {groups.upcoming.map((booking, i) => (
                      <UpcomingCard
                        key={booking.id}
                        booking={booking}
                        where={whereLabel(booking)}
                        now={now}
                        calendarFilled={i === 0 && changing === null}
                        canCancel={canCancelBooking(booking, viewer, now)}
                        disabled={inFlight !== null}
                        noteOpen={changing === booking.id}
                        choosing={changing === booking.id && inFlight !== null}
                        onOpenNote={() => setChanging(booking.id)}
                        onCloseNote={() => setChanging(null)}
                        onCancel={() => openCancel(booking)}
                        onCancelAndChoose={() => cancel(booking, "choose")}
                      />
                    ))}
                  </ul>
                )}
              </section>
              <section aria-labelledby="past-heading">
                <h2 id="past-heading" className="text-lg font-semibold">
                  Past
                </h2>
                {groups.past.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No past bookings yet.</p>
                ) : (
                  <PastList bookings={groups.past} />
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="danger"
        title="Cancel this booking?"
        description={target ? `${whereLabel(target)}. Your place goes to someone else.` : ""}
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        loading={inFlight !== null}
        onConfirm={() => (target ? cancel(target, "stay") : undefined)}
      >
        {/* The page's status line is hidden from screen readers while the dialog is open. */}
        <p role="status" className="min-h-5 text-muted-foreground">
          {inFlight ?? ""}
        </p>
      </ConfirmDialog>
    </>
  );
}
