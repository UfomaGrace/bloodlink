// Donation queries: workarounds for what the contract doesn't offer yet.
//
// Each gap lives in exactly one function here, so when the service adds what's missing the
// change is one line in this file and no screen changes. Asked of the service team:
//   - `area` on GET /donation-slots          → listSlotsInArea
//   - `slotId` on GET /bookings              → listSlotBookings
//
// Every call still goes through api/endpoints.

import { api } from "../api/endpoints";
import type { Booking, DonationSlotList, DonationSlotQuery } from "../api/types";

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
 * The bookings the caller can see for one slot: a donor's own, or every booking for a bank's slot.
 * WORKAROUND: listBookings has no `slotId` parameter yet, so we read every page at the
 * contract's largest size and keep the slot's bookings. When the service adds `slotId`, send it
 * and read one page.
 */
export async function listSlotBookings(slotId: string, signal?: AbortSignal): Promise<Booking[]> {
  const found: Booking[] = [];
  for (let page = 0; page < MAX_BOOKING_PAGES; page++) {
    const { data } = await api.listBookings({ page, size: BOOKINGS_PAGE_SIZE }, signal);
    found.push(...data.items.filter((booking) => booking.slot.id === slotId));
    const read = (page + 1) * BOOKINGS_PAGE_SIZE;
    if (data.items.length === 0 || read >= data.totalItems) break;
  }
  return found;
}

function normaliseArea(area: string): string {
  return area.trim().toLowerCase();
}
