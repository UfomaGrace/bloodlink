// SlotDetailPage (/slots/:slotId): one slot, its places used, and its bookings. Staff of the
// slot's bank and the administrator.
//
// - The contract has no GET /donation-slots/{slotId} and no `slotId` filter on GET /bookings yet.
//   lib/donationQueries getSlotWithBookings reads every page of bookings, keeps this slot's, and
//   takes the slot's details from them, or from the copy the slot list passed in router state.
//   A direct link to a slot nobody has booked can't show its details, and says so.
// - Staff of another bank see the slot (when it was passed along) but never its bookings or any
//   action: GET /bookings gives them none, and canManageSlot / canRecordAttendance check the bank.
// - "Attended" / "No-show" on each BOOKED booking once the slot has started (canRecordAttendance)
//   → ConfirmDialog → POST /bookings/{id}/attendance. Not optimistic: the dialog stays open, busy,
//   until the service answers, and the bookings are then read again.
//     Recorded → success message and a quiet reload.
//     409 BOOKING_NOT_ACTIVE, SLOT_NOT_STARTED → each its own message (attendanceRefusal), and a reload.
//     422 → the service's message with each detail, and the Reference. Nothing to reload.
//     404 or any other 409 → the service's message, and a reload.
//     Lost connection or timeout → no retry. We read the bookings again and say what this one
//       now shows ("We couldn't confirm. Ngozi's booking now shows as Attended.").
// - States: loading, error (+ Try again, Reference), no details, first use (no bookings), list,
//   refreshing.
// - Mock only: "Simulate state" swaps in this slot run by your bank: started with bookings to
//   record, not started yet, or with nobody booked. Dates count from the moment it is picked.

import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ApiError, IS_MOCK, toApiError } from "../api/client";
import { api } from "../api/endpoints";
import { userOrganisation, type Booking, type DonationSlot } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { MockControls } from "../components/MockControls";
import { ResultAlert, type Notice } from "../components/ResultAlert";
import { useAsync } from "../hooks/useAsync";
import { useNow } from "../hooks/useNow";
import { getSlotWithBookings } from "../lib/donationQueries";
import {
  attendanceRefusal,
  canManageSlot,
  canRecordAttendance,
  formatLagosDay,
  formatLagosTime,
  hasSlotEnded,
  hasSlotStarted,
  placesLeftLabel,
  placesUsedLabel,
  slotTimeRangeLabel,
  slotWhenLabel,
  unconfirmedAttendanceMessage,
  type AttendanceOutcome,
} from "../lib/donations";
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_TONES, formatDateTime } from "../lib/labels";
import {
  DEMO_BANK,
  SLOT_DETAIL_SIMULATION_LABELS,
  simulateSlotDetail,
  type SlotDetailSimulation,
} from "../lib/mockSimulation";
import { viewerOf } from "../lib/requestActions";
import { cn } from "../shared/cn";
import { Button } from "../shared/ui/button";
import { ConfirmDialog } from "../shared/ui/dialog";
import { EmptyState } from "../shared/ui/empty-state";
import { ErrorState } from "../shared/ui/error-state";
import { Skeleton } from "../shared/ui/skeleton";
import { StatusBadge } from "../shared/ui/status-badge";

// "Attendance can be recorded once the slot starts" must not wait long to change while the page is open.
const CLOCK_TICK_MS = 30_000;

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const backLink = cn(
  "inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-(--color-primary) underline underline-offset-2",
  focusRing,
);

const OUTCOME_WORDS: Record<AttendanceOutcome, { button: string; confirm: string; done: string; title: string }> = {
  ATTENDED: { button: "Attended", confirm: "Record attended", done: "attended", title: "as attended" },
  NO_SHOW: { button: "No-show", confirm: "Record no-show", done: "did not attend", title: "as a no-show" },
};

/** What the slot list passes in router state: `{ slot }`, checked before use. */
export type SlotDetailState = { slot: DonationSlot };

function slotFromState(state: unknown, slotId: string): DonationSlot | null {
  if (typeof state !== "object" || state === null || !("slot" in state)) return null;
  const slot: unknown = state.slot;
  if (typeof slot !== "object" || slot === null || !("id" in slot) || slot.id !== slotId) return null;
  return slot as DonationSlot;
}

/** Our words, keeping the service's Reference. */
function withMessage(error: ApiError, message: string): ApiError {
  return new ApiError({ ...error, message });
}

export default function SlotDetailPage() {
  const { slotId = "" } = useParams();
  const location = useLocation();
  const known = slotFromState(location.state, slotId);
  const { session } = useAuth();
  const viewer = viewerOf(session);
  const now = useNow(CLOCK_TICK_MS);

  const loaded = useAsync((signal) => getSlotWithBookings(slotId, known, signal), [slotId]);

  // A reload after recording keeps the bookings on screen instead of the skeleton.
  const [quiet, setQuiet] = useState(false);
  if (quiet && !loaded.loading) setQuiet(false); // answered: the next load (Try again) shows the skeleton
  const refreshing = quiet && loaded.loading && loaded.data !== null;
  function reloadQuietly() {
    setQuiet(true);
    loaded.reload();
  }

  // Mock only: the simulation picked, and when (its dates count from then).
  const [simulated, setSimulated] = useState<{ state: SlotDetailSimulation; at: number } | null>(null);
  function pickSimulation(next: SlotDetailSimulation | null) {
    setSimulated(next && { state: next, at: Date.now() });
  }
  const simulatedBank = (viewer.role === "BANK_STAFF" && session ? userOrganisation(session.user) : null) ?? DEMO_BANK;
  const data =
    loaded.data && IS_MOCK && simulated
      ? simulateSlotDetail(simulated.state, simulated.at, slotId, simulatedBank)
      : loaded.data;

  const [notice, setNotice] = useState<Notice | null>(null);
  const [target, setTarget] = useState<{ booking: Booking; outcome: AttendanceOutcome } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inFlight, setInFlight] = useState<string | null>(null);

  function openRecord(booking: Booking, outcome: AttendanceOutcome) {
    setTarget({ booking, outcome });
    setConfirmOpen(true);
  }

  // Resolves either way, so ConfirmDialog never stays open; we close it ourselves in the same update.
  async function record(booking: Booking, outcome: AttendanceOutcome) {
    const name = booking.donor.displayName;
    setNotice(null);
    setInFlight(`Recording ${name} ${OUTCOME_WORDS[outcome].title}…`);
    try {
      await api.recordAttendance(booking.id, { outcome });
      setConfirmOpen(false);
      setNotice({ tone: "success", message: `Recorded: ${name} ${OUTCOME_WORDS[outcome].done}.` });
      reloadQuietly();
    } catch (e) {
      setConfirmOpen(false);
      const error = toApiError(e);
      if (error.isConnectionProblem) {
        await checkAfterLostConnection(booking);
        return;
      }
      if (error.code === "VALIDATION_FAILED") {
        // Attendance has one field (outcome), so there is no form to put details on: list them.
        const details = error.details.map((d) => `${d.field}: ${d.issue}`).join(" ");
        setNotice({ tone: "error", error: details ? withMessage(error, `${error.message} ${details}`) : error });
        return;
      }
      const message = attendanceRefusal(error.code);
      setNotice({ tone: "error", error: message ? withMessage(error, message) : error });
      if (error.status === 409 || error.status === 404) reloadQuietly();
    } finally {
      setInFlight(null);
    }
  }

  /**
   * After a timeout or lost connection we can't tell whether the outcome was recorded. We don't
   * send it again (a second one is refused with BOOKING_NOT_ACTIVE at best): we read the bookings
   * and say what this one now shows.
   */
  async function checkAfterLostConnection(booking: Booking) {
    setInFlight("We couldn't confirm. Checking the bookings…");
    let status: Booking["status"] | null | undefined;
    try {
      status = (await getSlotWithBookings(slotId, known)).bookings.find((b) => b.id === booking.id)?.status;
    } catch {
      status = null;
    }
    setNotice({ tone: "info", message: unconfirmedAttendanceMessage(status, booking.donor.displayName) });
    reloadQuietly();
  }

  const statusLine = inFlight ?? (refreshing ? "Checking the latest bookings…" : "");

  return (
    <>
      <Link to="/slots" className={backLink}>
        <span aria-hidden="true">←&nbsp;</span>All donation slots
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Donation slot</h1>
      {/* What is in flight, or that the bookings are being checked again. Always rendered, so it is announced. */}
      <p role="status" className="mt-1 min-h-5 text-sm text-muted-foreground">
        {statusLine}
      </p>

      {notice && <ResultAlert notice={notice} className="mt-4" />}

      <MockControls
        className="mt-4"
        simulation={{ value: simulated?.state ?? null, onChange: pickSimulation, labels: SLOT_DETAIL_SIMULATION_LABELS }}
      />

      <div className="mt-6" aria-busy={loaded.loading || undefined}>
        {loaded.loading && !refreshing ? (
          <div className="flex flex-col gap-4">
            <p role="status" className="text-sm font-medium">
              Loading the slot and its bookings…
            </p>
            <Skeleton lines={6} />
          </div>
        ) : loaded.error ? (
          <ErrorState
            // ErrorState takes strings only; pre-line puts the Reference on its own line.
            className="whitespace-pre-line"
            title="We couldn't load this slot's bookings"
            description={`${loaded.error.message}\nReference: ${loaded.error.requestId}`}
            onRetry={loaded.reload}
          />
        ) : data && !data.slot ? (
          <section aria-labelledby="no-details-heading" className="flex flex-col items-start gap-2">
            <h2 id="no-details-heading" className="text-lg font-semibold">
              We can't show this slot's details here
            </h2>
            <p className="max-w-prose text-muted-foreground">
              Nobody has booked it yet, and its details can only come from the slot list for now. Open it from there.
            </p>
            <Link to="/slots" className={backLink}>
              Go to donation slots
            </Link>
          </section>
        ) : data?.slot ? (
          <SlotView
            slot={data.slot}
            bookings={data.bookings}
            now={now}
            manageable={canManageSlot(data.slot, viewer)}
            canRecord={(booking) => canRecordAttendance(booking, viewer, now)}
            recordDisabled={inFlight !== null}
            onRecord={openRecord}
          />
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={target ? `Record ${target.booking.donor.displayName} ${OUTCOME_WORDS[target.outcome].title}?` : ""}
        description={
          target ? `${slotWhenLabel(target.booking.slot)}. Once recorded, it can't be changed here.` : ""
        }
        confirmLabel={target ? OUTCOME_WORDS[target.outcome].confirm : "Record"}
        cancelLabel="Go back"
        loading={inFlight !== null}
        onConfirm={() => (target ? record(target.booking, target.outcome) : undefined)}
      >
        {/* The page's status line is hidden from screen readers while the dialog is open. */}
        <p role="status" className="min-h-5 text-muted-foreground">
          {inFlight ?? ""}
        </p>
      </ConfirmDialog>
    </>
  );
}

function slotTimingLabel(slot: DonationSlot, now: number): string {
  if (hasSlotEnded(slot, now)) return "Ended";
  if (hasSlotStarted(slot, now)) return "Running now";
  return "Not started yet";
}

function SlotView({
  slot,
  bookings,
  now,
  manageable,
  canRecord,
  recordDisabled,
  onRecord,
}: {
  slot: DonationSlot;
  bookings: readonly Booking[];
  now: number;
  manageable: boolean;
  canRecord: (booking: Booking) => boolean;
  recordDisabled: boolean;
  onRecord: (booking: Booking, outcome: AttendanceOutcome) => void;
}) {
  const started = hasSlotStarted(slot, now);
  return (
    <>
      <section aria-labelledby="slot-details-heading" className="rounded-md border border-border bg-surface p-4 sm:p-5">
        <h2 id="slot-details-heading" className="text-lg font-semibold wrap-break-word">
          {slot.bank.name}
        </h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Day</dt>
          <dd className="min-w-0">
            <time dateTime={slot.startsAt}>{formatLagosDay(slot.startsAt)}</time>
          </dd>
          <dt className="text-muted-foreground">Time</dt>
          <dd className="min-w-0 tabular-nums">{slotTimeRangeLabel(slot)}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="min-w-0">{slotTimingLabel(slot, now)}</dd>
          <dt className="text-muted-foreground">Places</dt>
          <dd className="min-w-0 font-medium">
            {placesUsedLabel(slot)} · {placesLeftLabel(slot)}
          </dd>
        </dl>
      </section>

      {!manageable ? (
        <p className="mt-6 max-w-prose text-muted-foreground">
          Only staff at {slot.bank.name} can see this slot's bookings and record attendance.
        </p>
      ) : (
        <section aria-labelledby="slot-bookings-heading" className="mt-8">
          <h2 id="slot-bookings-heading" className="text-lg font-semibold">
            Bookings ({bookings.length})
          </h2>
          {!started && bookings.some((b) => b.status === "BOOKED") && (
            <p className="mt-1 text-sm text-muted-foreground">
              Attendance can be recorded once the slot starts at {formatLagosTime(slot.startsAt)} Lagos time.
            </p>
          )}
          {bookings.length === 0 ? (
            <EmptyState
              className="mt-3"
              headingLevel="h3"
              title="No bookings yet"
              description="When donors book this slot, they show here, and you can record who came."
            />
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {bookings.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  recordable={canRecord(booking)}
                  disabled={recordDisabled}
                  onRecord={onRecord}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function BookingRow({
  booking,
  recordable,
  disabled,
  onRecord,
}: {
  booking: Booking;
  recordable: boolean;
  disabled: boolean;
  onRecord: (booking: Booking, outcome: AttendanceOutcome) => void;
}) {
  const name = booking.donor.displayName;
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium wrap-break-word">{name}</span>
          <StatusBadge tone={BOOKING_STATUS_TONES[booking.status]} className="text-sm">
            {BOOKING_STATUS_LABELS[booking.status]}
          </StatusBadge>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Booked <time dateTime={booking.createdAt}>{formatDateTime(booking.createdAt)}</time>
        </p>
      </div>
      {recordable && (
        <div className="flex flex-wrap gap-2">
          {(["ATTENDED", "NO_SHOW"] as const).map((outcome) => (
            <Button
              key={outcome}
              variant="secondary"
              className="min-h-11"
              disabled={disabled}
              onClick={() => onRecord(booking, outcome)}
              // Starts with the visible word, so voice control users can say it.
              aria-label={`${OUTCOME_WORDS[outcome].button}: record ${name} ${OUTCOME_WORDS[outcome].title}`}
            >
              {OUTCOME_WORDS[outcome].button}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}
