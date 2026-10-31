// DonorSlotsView: the donor's /slots. A week of slots to book, their next donation, and their donations.
// SlotsPage renders it for donors; Layout drops its column for it (FullBleed in App.tsx), so the
// hero runs edge to edge and this view sets its own max-w-6xl container below it.
//
// - GET /donation-slots?from=today&to=today+6 (Lagos dates). ?area (from the banks' areas) is
//   matched in the browser on slot.bank.area (lib/donationQueries listSlotsInArea), as on the
//   staff list. Stale ?bankId, ?from and ?to from that list are ignored here.
// - GET /bookings?status=BOOKED (every page): the hero's next donation and the "You're booked"
//   marker. GET /bookings?status=ATTENDED (every page): the hero's donations line. Either can
//   fail without blocking the page: the hero falls back to its default words.
// - Choose a day: seven buttons (DayPicker). The default is the first day that can be picked; if
//   the chosen day can no longer be picked (another area, a reload), the default takes over.
//   A live status says the chosen day and its count ("Saturday 31 October · 3 slots · Lagos time").
// - Booking: "Book this time" → ConfirmDialog → POST /donation-slots/{id}/bookings, as before.
//   Not optimistic. Booked → success message, then the slots and the donor's bookings reload
//   quietly (the card turns to "You're booked", the hero shows it). 409 SLOT_FULL, SLOT_CLOSED,
//   ALREADY_BOOKED → their own messages (bookingRefusal) and the same reload. Lost connection or
//   timeout → no retry; we read the donor's bookings for that slot and say what they show.
//   Focus: the result message takes focus (ResultAlert), just above the cards.
// - Mock only: "Mock server tools" in a closed <details>. Its simulation (lib/mockSimulation
//   simulateDonorWeek) starts on "A week of slots, with your bookings", so the screen shows
//   realistic data against Prism.

import { useState } from "react";
import { useSearchParams } from "react-router";
import { ApiError, IS_MOCK, toApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import type { Booking, DonationSlot, DonationSlotList } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { MockControls } from "../../components/MockControls";
import { ResultAlert, type Notice } from "../../components/ResultAlert";
import { UrlFilterSelect } from "../../components/UrlFilterSelect";
import { useAsync } from "../../hooks/useAsync";
import { useNow } from "../../hooks/useNow";
import { areaOptions, filterSlotsByArea, listAllBookings, listSlotBookings, listSlotsInArea } from "../../lib/donationQueries";
import { addDays, bookingRefusal, placesLeftLabel, slotWhenLabel } from "../../lib/donations";
import { buildWeek, dayHeading, defaultDay, nextBooking, WEEK_LENGTH } from "../../lib/donorWeek";
import { lagosToday } from "../../lib/expiry";
import { DONOR_WEEK_SIMULATION_LABELS, simulateDonorWeek, type DonorWeekSimulation } from "../../lib/mockSimulation";
import { ConfirmDialog } from "../../shared/ui/dialog";
import { EmptyState } from "../../shared/ui/empty-state";
import { ErrorState } from "../../shared/ui/error-state";
import { Skeleton } from "../../shared/ui/skeleton";
import { BeforeYouDonate } from "./BeforeYouDonate";
import { DayPicker } from "./DayPicker";
import { DonorHero } from "./DonorHero";
import { TimeCards } from "./TimeCards";

// "This slot has started" must not wait long to become true while the page is open.
const CLOCK_TICK_MS = 30_000;

/** Our words for a refused booking, keeping the service's Reference. */
function withMessage(error: ApiError, message: string): ApiError {
  return new ApiError({ ...error, message });
}

export function DonorSlotsView() {
  const { session } = useAuth();
  const donorName = session?.user.displayName ?? "Donor";
  const now = useNow(CLOCK_TICK_MS);
  const today = lagosToday(now);
  const [searchParams, setSearchParams] = useSearchParams();

  // Mock only: the simulation picked, and when (its dates count from then). Starts on a full week.
  const [simulated, setSimulated] = useState<{ state: DonorWeekSimulation; at: number } | null>(() =>
    IS_MOCK ? { state: "WEEK", at: Date.now() } : null,
  );
  function pickSimulation(next: DonorWeekSimulation | null) {
    setSimulated(next && { state: next, at: Date.now() });
  }
  const sim = IS_MOCK && simulated ? simulateDonorWeek(simulated.state, simulated.at, donorName) : null;

  const banks = useAsync(
    (signal) => api.listOrganisations({ type: "BLOOD_BANK" }, signal).then((res) => res.data.items),
    [],
  );
  const areaChoices = areaOptions([...(banks.data ?? []), ...(sim?.banks ?? [])]);
  // ?area: checked against the banks' areas once they're here; passed through while they load.
  const areaParam = searchParams.get("area")?.trim();
  const area = banks.data
    ? areaChoices.find((option) => option.value.toLowerCase() === areaParam?.toLowerCase())?.value
    : banks.loading
      ? areaParam || undefined
      : undefined;

  const slots = useAsync(
    (signal) => listSlotsInArea({ from: today, to: addDays(today, WEEK_LENGTH - 1) }, area, signal),
    [today, area],
  );
  const booked = useAsync((signal) => listAllBookings(signal, "BOOKED"), []);
  const attended = useAsync((signal) => listAllBookings(signal, "ATTENDED"), []);

  // A reload after a booking keeps the cards on screen; a change of area or day shows the skeleton.
  const filterKey = `${today}|${area ?? ""}`;
  const [quietKey, setQuietKey] = useState<string | null>(null);
  const refreshing = slots.loading && slots.data !== null && quietKey === filterKey;
  function reloadQuietly() {
    setQuietKey(filterKey);
    slots.reload();
    booked.reload();
  }

  // The simulation replaces what Prism sent, once it has answered (as on the other screens).
  const slotData: DonationSlotList | null =
    slots.data && sim ? { ...sim.slots, items: area ? filterSlotsByArea(sim.slots.items, area) : sim.slots.items } : slots.data;
  const bookedData: Booking[] | null = booked.data && sim ? sim.booked : booked.data;
  const attendedData: Booking[] | null = attended.data && sim ? sim.attended : attended.data;

  const bookedSlotIds = new Set(
    (bookedData ?? []).filter((b) => b.status === "BOOKED").map((b) => b.slot.id),
  );
  const week = buildWeek(slotData?.items ?? [], bookedSlotIds, now);

  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const chosen = week.find((day) => day.date === chosenDay && !day.disabled);
  const selectedDate = chosen?.date ?? defaultDay(week);
  const selected = week.find((day) => day.date === selectedDate) ?? null;

  const [notice, setNotice] = useState<Notice | null>(null);
  const [target, setTarget] = useState<DonationSlot | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inFlight, setInFlight] = useState<string | null>(null);

  function openBook(slot: DonationSlot) {
    setTarget(slot);
    setConfirmOpen(true);
  }

  // Resolves either way, so ConfirmDialog never stays open; we close it ourselves in the same update.
  async function book(slot: DonationSlot) {
    setNotice(null);
    setInFlight(`Booking your place at ${slot.bank.name}…`);
    try {
      await api.bookDonationSlot(slot.id);
      setConfirmOpen(false);
      setNotice({
        tone: "success",
        message: `Booked: ${slot.bank.name}, ${slotWhenLabel(slot)}. Please arrive on time.`,
      });
      reloadQuietly();
    } catch (e) {
      setConfirmOpen(false);
      const error = toApiError(e);
      if (error.isConnectionProblem) {
        await checkAfterLostConnection(slot);
        return;
      }
      const refusal = bookingRefusal(error.code);
      if (refusal?.tone === "info") setNotice({ tone: "info", message: refusal.message });
      else setNotice({ tone: "error", error: refusal ? withMessage(error, refusal.message) : error });
      if (refusal || error.status === 404) reloadQuietly();
    } finally {
      setInFlight(null);
    }
  }

  /**
   * After a timeout or lost connection we can't tell whether the booking was made. We don't book
   * again (the service would answer ALREADY_BOOKED at best): we read what the service now holds
   * and say so.
   */
  async function checkAfterLostConnection(slot: DonationSlot) {
    setInFlight("We couldn't confirm. Checking your bookings…");
    const where = `${slot.bank.name}, ${slotWhenLabel(slot)}`;
    try {
      const bookings = await listSlotBookings(slot.id);
      const found = bookings.some((b) => b.status === "BOOKED" || b.status === "ATTENDED");
      setNotice({
        tone: "info",
        message: found
          ? `We couldn't confirm at first, but your bookings now show a place for you: ${where}.`
          : `We couldn't confirm, and your bookings don't show ${where}, so it wasn't booked. You can book it again.`,
      });
    } catch {
      setNotice({
        tone: "info",
        message: "We couldn't confirm whether you were booked, or check your bookings. Check My bookings before booking once more.",
      });
    }
    reloadQuietly();
  }

  function clearArea() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("area");
      return next;
    });
  }

  const showCards = !slots.loading || refreshing;
  const dayStatus = showCards && slotData && selected ? dayHeading(selected.date, selected.bookable) : "";
  const progress = inFlight ?? (refreshing ? "Checking the latest places…" : "");

  return (
    <>
      <DonorHero
        next={{ ...booked, data: bookedData && nextBooking(bookedData, now) }}
        attended={attendedData}
        now={now}
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        {notice && <ResultAlert notice={notice} className="mb-6" />}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <section aria-labelledby="choose-day-heading" aria-busy={slots.loading || undefined} className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="choose-day-heading" className="text-xl font-semibold tracking-tight">
                Choose a day
              </h2>
              {!(banks.error && !banks.data) && (
                <UrlFilterSelect
                  label="Area"
                  param="area"
                  anyLabel={banks.loading ? "Loading areas…" : "All areas"}
                  options={areaChoices}
                  disabled={banks.loading}
                  className="w-full sm:w-52"
                />
              )}
            </div>

            <div className="mt-4">
              <DayPicker week={week} selected={selectedDate} labelledBy="choose-day-heading" onSelect={setChosenDay} />
            </div>

            {/* Always rendered: a live region must exist before its text changes to be announced. */}
            <p role="status" aria-atomic="true" className="mt-6 min-h-6 font-semibold">
              {dayStatus}
            </p>
            <p role="status" className="min-h-5 text-sm text-muted-foreground">
              {progress}
            </p>

            <div className="mt-3">
              {slots.loading && !refreshing ? (
                <div className="flex flex-col gap-4">
                  <p className="text-sm font-medium">Loading slots…</p>
                  <Skeleton lines={6} />
                </div>
              ) : slots.error ? (
                <ErrorState
                  // ErrorState takes strings only; pre-line puts the Reference on its own line.
                  className="whitespace-pre-line"
                  title="We couldn't load the donation slots"
                  description={`${slots.error.message}\nReference: ${slots.error.requestId}`}
                  onRetry={slots.reload}
                />
              ) : !selected ? (
                area ? (
                  <EmptyState
                    title={`No slots in ${area} this week`}
                    description="Try another area, or show every area."
                    action={{ label: "Show all areas", onClick: clearArea }}
                  />
                ) : (
                  <EmptyState
                    title="No slots this week"
                    description="No bank has a time to book in the next 7 days. Please check back soon."
                  />
                )
              ) : (
                <TimeCards
                  key={selected.date}
                  slots={selected.slots}
                  bookedSlotIds={bookedSlotIds}
                  now={now}
                  bookDisabled={inFlight !== null}
                  onBook={openBook}
                />
              )}
            </div>
          </section>

          <BeforeYouDonate />
        </div>

        {IS_MOCK && (
          <details className="mt-10 text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-muted-foreground">Mock server tools</summary>
            <MockControls
              className="mt-2"
              simulation={{ value: simulated?.state ?? null, onChange: pickSimulation, labels: DONOR_WEEK_SIMULATION_LABELS }}
            />
          </details>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Book this slot?"
        description={target ? `${target.bank.name}, ${slotWhenLabel(target)}.` : ""}
        confirmLabel="Book place"
        cancelLabel="Don't book"
        loading={inFlight !== null}
        onConfirm={() => (target ? book(target) : undefined)}
      >
        {target && <p>{placesLeftLabel(target)} when the list was loaded.</p>}
        {/* The page's status line is hidden from screen readers while the dialog is open. */}
        <p role="status" className="mt-2 min-h-5 text-muted-foreground">
          {inFlight ?? ""}
        </p>
      </ConfirmDialog>
    </>
  );
}
