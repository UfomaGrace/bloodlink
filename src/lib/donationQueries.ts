// Donation queries: workarounds for what the contract doesn't offer yet.
//
// Each gap lives in exactly one function here, so when the service adds what's missing the
// change is one line in this file and no screen changes. Asked of the service team:
//   - `area` on GET /donation-slots          → listSlotsInArea
//   - `slotId` on GET /bookings              → listSlotBookings
//   - GET /donation-slots/{slotId}           → getSlotWithBookings
//
// Every call still goes through api/endpoints.

import { api } from "../api/endpoints";
import type { Booking, DonationSlot, DonationSlotList, DonationSlotQuery } from "../api/types";

/** The contract's largest page for GET /bookings. */
const BOOKINGS_PAGE_SIZE = 100;
/** Stop after this many pages (10,000 bookings), so a service that misreports totals can't loop us forever. */
const MAX_BOOKING_PAGES = 100;

/**
 * GET /donation-slots narrowed to banks in `area` (exact match, case and spaces ignored).
 * WORKAROUND: listDonationSlots has no `area` parameter yet, so we filter on slot.bank.area.
 * DonationSlotList isn't paged, so one call already holds every slot in the date range and the
 * filter can't hide slots on later pages. When the service adds `area`, pass it in the query
 * and drop the filter.
 */
export async function listSlotsInArea(
  query: DonationSlotQuery,
  area: string | undefined,
  signal?: AbortSignal,
): Promise<DonationSlotList> {
  const { data } = await api.listDonationSlots(query, signal);
  if (!area) return data;
  const wanted = normaliseArea(area);
  return { ...data, items: data.items.filter((slot) => normaliseArea(slot.bank.area) === wanted) };
}

/**
 * Every booking the caller can see (a donor's own, a bank's slots', or all for the administrator),
 * read page by page at the contract's largest size. Not a workaround: GET /bookings is paged,
 * and "upcoming" and "past" need the whole list to be split correctly.
 */
export async function listAllBookings(signal?: AbortSignal): Promise<Booking[]> {
  const found: Booking[] = [];
  for (let page = 0; page < MAX_BOOKING_PAGES; page++) {
    const { data } = await api.listBookings({ page, size: BOOKINGS_PAGE_SIZE }, signal);
    found.push(...data.items);
    const read = (page + 1) * BOOKINGS_PAGE_SIZE;
    if (data.items.length === 0 || read >= data.totalItems) break;
  }
  return found;
}

/**
 * The bookings the caller can see for one slot: a donor's own, or every booking for a bank's slot.
 * WORKAROUND: listBookings has no `slotId` parameter yet, so we read every page and keep the
 * slot's bookings. When the service adds `slotId`, send it here and drop the filter.
 */
export async function listSlotBookings(slotId: string, signal?: AbortSignal): Promise<Booking[]> {
  return (await listAllBookings(signal)).filter((booking) => booking.slot.id === slotId);
}

function normaliseArea(area: string): string {
  return area.trim().toLowerCase();
}

/**
 * One slot and the bookings the caller can see for it.
 * WORKAROUND: there is no GET /donation-slots/{slotId} yet. The slot's details come from its
 * bookings (each Booking carries its slot, read just now), else from `known`, the copy the slot
 * list passed along. With neither (a direct link to a slot nobody has booked) `slot` is null.
 * When the service adds the endpoint, fetch the slot here alongside the bookings.
 */
export async function getSlotWithBookings(
  slotId: string,
  known: DonationSlot | null,
  signal?: AbortSignal,
): Promise<{ slot: DonationSlot | null; bookings: Booking[] }> {
  const bookings = await listSlotBookings(slotId, signal);
  const slot = bookings[0]?.slot ?? (known?.id === slotId ? known : null);
  return { slot, bookings };
}
