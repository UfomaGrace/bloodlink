import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking, DonationSlot } from "../api/types";

const mocks = vi.hoisted(() => ({ listDonationSlots: vi.fn(), listBookings: vi.fn() }));
vi.mock("../api/endpoints", () => ({ api: mocks }));

const { listSlotBookings, listSlotsInArea } = await import("./donationQueries");

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
