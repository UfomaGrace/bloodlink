// BookingsPage (/bookings): the signed-in donor's own bookings, upcoming and past, with status.
//
// - GET /bookings holds only the donor's own. Every page is read (lib/donationQueries
//   listAllBookings), so the upcoming / past split (lib/donations splitBookings) is never cut
//   off by paging. Upcoming: the slot hasn't ended, soonest first. Past: most recent first.
// - Times are Lagos time, labelled, like SlotsPage.
// - "Cancel booking" (canCancelBooking: BOOKED and the slot hasn't started) → ConfirmDialog →
//   POST /bookings/{id}/cancellation. Not optimistic: the dialog stays open, busy, until the
//   service answers, and the list is then read again to show what the service holds.
//     Cancelled → success message and a quiet reload.
//     409 BOOKING_NOT_ACTIVE, SLOT_CLOSED → each its own message (cancelBookingRefusal), and a reload.
//     404 or any other 409 → the service's message, and a reload.
//     Lost connection or timeout → no retry. We read the bookings again and say what this one
//       now shows ("We couldn't confirm. Your booking for … now shows as Cancelled.").
// - States: loading, error (+ Try again, Reference), first use (+ Find a slot), list, refreshing.
// - Mock only: "Simulate state" swaps in upcoming and past bookings, or none, with dates counted
//   from the moment it is picked. Prism's own answer is one booking in a slot that has started.

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
import {
  cancelBookingRefusal,
  canCancelBooking,
  formatLagosDay,
  hasSlotStarted,
  slotTimeRangeLabel,
  slotWhenLabel,
  splitBookings,
  unconfirmedCancelMessage,
} from "../lib/donations";
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_TONES } from "../lib/labels";
import { BOOKING_LIST_SIMULATION_LABELS, simulateBookings, type BookingListSimulation } from "../lib/mockSimulation";
import { viewerOf } from "../lib/requestActions";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { ConfirmDialog } from "../shared/ui/dialog";
import { EmptyState } from "../shared/ui/empty-state";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";
import { StatusBadge } from "../shared/ui/status-badge";

// "Started: too late to cancel" must not wait long to become true while the page is open.
const CLOCK_TICK_MS = 30_000;

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const textLink = cn(
  "inline-flex min-h-11 items-center rounded-sm font-medium text-(--color-primary) underline underline-offset-2",
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

  // Mock only: the simulation picked, and when (its dates count from then).
  const [simulated, setSimulated] = useState<{ state: BookingListSimulation; at: number } | null>(null);
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

  function openCancel(booking: Booking) {
    setTarget(booking);
    setConfirmOpen(true);
  }

  // Resolves either way, so ConfirmDialog never stays open; we close it ourselves in the same update.
  async function cancel(booking: Booking) {
    setNotice(null);
    setInFlight("Cancelling your booking…");
    try {
      await api.cancelBooking(booking.id);
      setConfirmOpen(false);
      setNotice({
        tone: "success",
        message: `Booking cancelled: ${whereLabel(booking)}. The place is free for someone else.`,
      });
      reloadQuietly();
    } catch (e) {
      setConfirmOpen(false);
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

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
      <p className="mt-2 text-muted-foreground">Your donation bookings. Times are Lagos time.</p>
      {/* What is in flight, or that the list is being checked again. Always rendered, so it is announced. */}
      <p role="status" className="mt-1 min-h-5 text-sm text-muted-foreground">
        {statusLine}
      </p>

      {notice && <ResultAlert notice={notice} className="mt-4" />}

      <MockControls
        className="mt-4"
        simulation={{ value: simulated?.state ?? null, onChange: pickSimulation, labels: BOOKING_LIST_SIMULATION_LABELS }}
      />

      <div className="mt-6" aria-busy={bookings.loading || undefined}>
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
        ) : data && data.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            description="Choose a donation slot at a bank near you and book a place."
            action={{ label: "Find a donation slot", onClick: () => navigate("/slots") }}
          />
        ) : data ? (
          <BookingSections
            bookings={data}
            now={now}
            canCancel={(booking) => canCancelBooking(booking, viewer, now)}
            cancelDisabled={inFlight !== null}
            onCancel={openCancel}
          />
        ) : null}
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
        onConfirm={() => (target ? cancel(target) : undefined)}
      >
        {/* The page's status line is hidden from screen readers while the dialog is open. */}
        <p role="status" className="min-h-5 text-muted-foreground">
          {inFlight ?? ""}
        </p>
      </ConfirmDialog>
    </>
  );
}

function BookingSections({
  bookings,
  now,
  canCancel,
  cancelDisabled,
  onCancel,
}: {
  bookings: readonly Booking[];
  now: number;
  canCancel: (booking: Booking) => boolean;
  cancelDisabled: boolean;
  onCancel: (booking: Booking) => void;
}) {
  const { upcoming, past } = splitBookings(bookings, now);
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="text-lg font-semibold">
          Upcoming ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing booked.{" "}
            <Link to="/slots" className={textLink}>
              Find a donation slot
            </Link>
          </p>
        ) : (
          <BookingList bookings={upcoming} now={now} canCancel={canCancel} cancelDisabled={cancelDisabled} onCancel={onCancel} />
        )}
      </section>
      <section aria-labelledby="past-heading">
        <h2 id="past-heading" className="text-lg font-semibold">
          Past ({past.length})
        </h2>
        {past.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No past bookings yet.</p>
        ) : (
          <BookingList bookings={past} now={now} canCancel={canCancel} cancelDisabled={cancelDisabled} onCancel={onCancel} />
        )}
      </section>
    </div>
  );
}

function BookingList({
  bookings,
  now,
  canCancel,
  cancelDisabled,
  onCancel,
}: {
  bookings: readonly Booking[];
  now: number;
  canCancel: (booking: Booking) => boolean;
  cancelDisabled: boolean;
  onCancel: (booking: Booking) => void;
}) {
  return (
    <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {bookings.map((booking) => {
        const { slot } = booking;
        // BOOKED in a slot that has started: say why there is no Cancel.
        const tooLate = booking.status === "BOOKED" && hasSlotStarted(slot, now);
        return (
          <li key={booking.id} className="flex min-w-0 flex-col rounded-md border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 font-semibold wrap-break-word">{slot.bank.name}</h3>
              <StatusBadge tone={BOOKING_STATUS_TONES[booking.status]} className="text-sm">
                {BOOKING_STATUS_LABELS[booking.status]}
              </StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground wrap-break-word">{slot.bank.area}</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Day</dt>
              <dd className="min-w-0">
                <time dateTime={slot.startsAt}>{formatLagosDay(slot.startsAt)}</time>
              </dd>
              <dt className="text-muted-foreground">Time</dt>
              <dd className="min-w-0 tabular-nums">{slotTimeRangeLabel(slot)}</dd>
            </dl>
            {canCancel(booking) ? (
              <div className="mt-auto pt-4">
                <Button
                  variant="secondary"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={cancelDisabled}
                  onClick={() => onCancel(booking)}
                  // Starts with the visible words, so voice control users can say "Cancel booking".
                  aria-label={`Cancel booking ${whereLabel(booking)}`}
                >
                  Cancel booking
                </Button>
              </div>
            ) : (
              tooLate && <p className="mt-auto pt-4 text-sm font-medium text-muted-foreground">Started: too late to cancel.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
