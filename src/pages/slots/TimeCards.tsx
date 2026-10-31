// TimeCards: the chosen day's slots as cards, 3 a row on large screens, 1 on phones.
//
// - Shown: slots that can be booked, and any the donor has booked. Full or started ones wait
//   behind "Show N full or past slots", each with its reason in words.
// - A card: the Lagos time range (large, tabular), the area, the bank, places left ("Only 1 place
//   left" in warning text), and an outline "Book this time". Its accessible name starts with the
//   visible words and adds the day, time and area, so every button on the screen is unique.
// - Booked by the donor (matched on booking.slot.id): a tinted card, "You're booked", no button.

import { Check } from "lucide-react";
import { useId, useState } from "react";
import type { DonationSlot } from "../../api/types";
import { bookingClosedReason } from "../../lib/donations";
import { donorPlacesLabel, isBookableNow, shortDayLabel, slotClockRange, slotLagosDay } from "../../lib/donorWeek";
import { cn } from "../../shared/cn";
import { Button } from "../../shared/ui/button";

export function TimeCards({
  slots,
  bookedSlotIds,
  now,
  bookDisabled,
  onBook,
}: {
  /** The chosen day's slots, in start order. */
  slots: readonly DonationSlot[];
  bookedSlotIds: ReadonlySet<string>;
  now: number;
  bookDisabled: boolean;
  onBook: (slot: DonationSlot) => void;
}) {
  const [showClosed, setShowClosed] = useState(false);
  const closedListId = useId();
  const open = slots.filter((slot) => bookedSlotIds.has(slot.id) || isBookableNow(slot, now));
  const closed = slots.filter((slot) => !open.includes(slot));
  const closedLabel = `${closed.length} full or past ${closed.length === 1 ? "slot" : "slots"}`;

  const card = (slot: DonationSlot) => (
    <TimeCard
      key={slot.id}
      slot={slot}
      booked={bookedSlotIds.has(slot.id)}
      closedReason={bookingClosedReason(slot, now)}
      bookDisabled={bookDisabled}
      onBook={onBook}
    />
  );

  return (
    <>
      {open.length > 0 && <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{open.map(card)}</ul>}
      {closed.length > 0 && (
        <div className="mt-4">
          <Button
            variant="ghost"
            className="min-h-11 px-0 text-sm text-muted-foreground underline underline-offset-4"
            aria-expanded={showClosed}
            aria-controls={closedListId}
            onClick={() => setShowClosed((shown) => !shown)}
          >
            {showClosed ? `Hide ${closedLabel}` : `Show ${closedLabel}`}
          </Button>
          <ul id={closedListId} hidden={!showClosed} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {closed.map(card)}
          </ul>
        </div>
      )}
    </>
  );
}

function TimeCard({
  slot,
  booked,
  closedReason,
  bookDisabled,
  onBook,
}: {
  slot: DonationSlot;
  booked: boolean;
  closedReason: string | null;
  bookDisabled: boolean;
  onBook: (slot: DonationSlot) => void;
}) {
  const { label: time, endsNextDay } = slotClockRange(slot);
  const places = donorPlacesLabel(slot);

  return (
    <li
      className={cn(
        "flex min-w-0 flex-col rounded-md border p-4",
        booked ? "border-primary bg-(--color-surface-hover)" : "border-border bg-surface",
      )}
    >
      <h3 className="text-2xl font-semibold tracking-tight tabular-nums">
        <time dateTime={slot.startsAt}>{time}</time>
      </h3>
      {endsNextDay && <p className="text-xs text-muted-foreground">Ends the next day</p>}
      <p className="mt-3 font-semibold wrap-break-word">{slot.bank.area}</p>
      <p className="text-sm text-muted-foreground wrap-break-word">{slot.bank.name}</p>
      {!booked && (
        <p className={cn("mt-3 text-sm font-medium", places.lastPlace && "text-warning")}>{places.text}</p>
      )}
      <div className="mt-auto pt-4">
        {booked ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Check aria-hidden="true" className="size-4" />
            You're booked
          </p>
        ) : closedReason ? (
          <p className="text-sm font-medium text-muted-foreground">{closedReason}</p>
        ) : (
          <Button
            variant="secondary"
            className="min-h-11 w-full border-primary text-primary"
            disabled={bookDisabled}
            onClick={() => onBook(slot)}
            aria-label={`Book this time: ${shortDayLabel(slotLagosDay(slot))}, ${time}, ${slot.bank.area}`}
          >
            Book this time
          </Button>
        )}
      </div>
    </li>
  );
}
