import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking, DonationSlot } from "../api/types";

const mocks = vi.hoisted(() => ({ listDonationSlots: vi.fn(), listBookings: vi.fn() }));
vi.mock("../api/endpoints", () => ({ api: mocks }));

const { getSlotWithBookings, listAllBookings, listSlotBookings, listSlotsInArea } = await import("./donationQueries");

function slot(id: string, area: string): DonationSlot {
  return {
    id,
    bank: { id: `bank-${area}`, name: `${area} Blood Bank`, type: "BLOOD_BANK", area },
    startsAt: "2026-10-30T08:00:00Z",
    endsAt: "2026-10-30T09:00:00Z",
    capacity: 4,
    booked: 0,
    placesLeft: 4,
  };
}

function booking(id: string, slotId: string): Booking {
  return {
    id,
    slot: slot(slotId, "Ikeja"),
    donor: { id: "donor-1", displayName: "Ngozi" },
    status: "BOOKED",
    createdAt: "2026-10-28T10:00:00Z",
  };
}

const ok = <T,>(data: T) => ({ data, status: 200, requestId: "ref", headers: new Headers() });

beforeEach(() => {
  mocks.listDonationSlots.mockReset();
  mocks.listBookings.mockReset();
});

describe("listSlotsInArea (no `area` on listDonationSlots yet)", () => {
  it("sends the other filters and keeps only slots whose bank is in the area, ignoring case and spaces", async () => {
    mocks.listDonationSlots.mockResolvedValue(
      ok({ computedAt: "2026-10-29T10:00:00Z", items: [slot("a", "Ikeja"), slot("b", "Surulere"), slot("c", " ikeja ")] }),
    );
    const result = await listSlotsInArea({ bankId: undefined, from: "2026-10-29", to: "2026-11-05" }, "IKEJA");
    expect(mocks.listDonationSlots).toHaveBeenCalledWith({ bankId: undefined, from: "2026-10-29", to: "2026-11-05" }, undefined);
    expect(result.items.map((s) => s.id)).toEqual(["a", "c"]);
    expect(result.computedAt).toBe("2026-10-29T10:00:00Z");
  });

  it("returns the list as sent when no area is chosen", async () => {
    const data = { computedAt: "2026-10-29T10:00:00Z", items: [slot("a", "Ikeja"), slot("b", "Surulere")] };
    mocks.listDonationSlots.mockResolvedValue(ok(data));
    expect(await listSlotsInArea({}, undefined)).toBe(data);
  });
});

describe("listSlotBookings (no `slotId` on listBookings yet)", () => {
  it("reads every page at size 100 and keeps the slot's bookings", async () => {
    const page0 = Array.from({ length: 100 }, (_, i) => booking(`p0-${i}`, i === 5 ? "wanted" : "other"));
    const page1 = [booking("p1-0", "wanted"), booking("p1-1", "other")];
    mocks.listBookings
      .mockResolvedValueOnce(ok({ items: page0, page: 0, size: 100, totalItems: 102 }))
      .mockResolvedValueOnce(ok({ items: page1, page: 1, size: 100, totalItems: 102 }));

    const result = await listSlotBookings("wanted");
    expect(mocks.listBookings).toHaveBeenNthCalledWith(1, { page: 0, size: 100 }, undefined);
    expect(mocks.listBookings).toHaveBeenNthCalledWith(2, { page: 1, size: 100 }, undefined);
    expect(mocks.listBookings).toHaveBeenCalledTimes(2);
    expect(result.map((b) => b.id)).toEqual(["p0-5", "p1-0"]);
  });

  it("stops at an empty page even if the total says there is more", async () => {
    mocks.listBookings.mockResolvedValue(ok({ items: [], page: 0, size: 100, totalItems: 500 }));
    expect(await listSlotBookings("wanted")).toEqual([]);
    expect(mocks.listBookings).toHaveBeenCalledTimes(1);
  });
});

describe("listAllBookings", () => {
  it("stops when the total is nonsense (Prism sends a negative one)", async () => {
    mocks.listBookings.mockResolvedValue(ok({ items: [booking("b-1", "s")], page: -2147483648, size: -2147483648, totalItems: -9007199254740991 }));
    expect((await listAllBookings()).map((b) => b.id)).toEqual(["b-1"]);
    expect(mocks.listBookings).toHaveBeenCalledTimes(1);
  });
});

describe("getSlotWithBookings (no GET /donation-slots/{slotId} yet)", () => {
  it("takes the slot's details from its bookings, read just now", async () => {
    mocks.listBookings.mockResolvedValue(ok({ items: [booking("b-1", "wanted"), booking("b-2", "other")], page: 0, size: 100, totalItems: 2 }));
    const stale = { ...slot("wanted", "Ikeja"), placesLeft: 99 };
    const result = await getSlotWithBookings("wanted", stale);
    expect(result.bookings.map((b) => b.id)).toEqual(["b-1"]);
    expect(result.slot?.placesLeft).toBe(4);
  });

  it("falls back to the copy passed from the list when nobody has booked", async () => {
    mocks.listBookings.mockResolvedValue(ok({ items: [], page: 0, size: 100, totalItems: 0 }));
    const known = slot("wanted", "Ikeja");
    expect(await getSlotWithBookings("wanted", known)).toEqual({ slot: known, bookings: [] });
  });

  it("has no details with neither, and ignores a passed copy of another slot", async () => {
    mocks.listBookings.mockResolvedValue(ok({ items: [], page: 0, size: 100, totalItems: 0 }));
    expect((await getSlotWithBookings("wanted", null)).slot).toBeNull();
    expect((await getSlotWithBookings("wanted", slot("other", "Ikeja"))).slot).toBeNull();
  });
});
