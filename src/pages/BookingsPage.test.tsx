// @vitest-environment jsdom
// BookingsPage: the donations band, upcoming cards and past rows, Change time, cancelling one,
// its 409s and a lost connection.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { Booking, BookingPage, Organisation, Session } from "../api/types";

const BANK: Organisation = { id: "bank-1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" };
const OTHER_BANK: Organisation = { id: "bank-2", name: "Surulere Blood Centre", type: "BLOOD_BANK", area: "Surulere" };

const mocks = vi.hoisted(() => ({ listBookings: vi.fn(), cancelBooking: vi.fn() }));
vi.mock("../api/endpoints", () => ({ api: mocks }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { role: "DONOR", organisation: null, displayName: "Ngozi" } } as unknown as Session,
    role: "DONOR",
  }),
}));

const { default: BookingsPage } = await import("./BookingsPage");

const HOUR = 3_600_000;
// Sat 31 Oct 2026, 12:00 Lagos (11:00 UTC). Only Date is faked, so "Today" and "Tomorrow" hold.
const NOW = Date.parse("2026-10-31T11:00:00Z");

function booking(id: string, bank: Organisation, startsInHours: number, status: Booking["status"]): Booking {
  const start = NOW + startsInHours * HOUR;
  return {
    id,
    slot: {
      id: `slot-${id}`,
      bank,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + 2 * HOUR).toISOString(),
      capacity: 10,
      booked: 5,
      placesLeft: 5,
    },
    donor: { id: "donor-1", displayName: "Ngozi" },
    status,
    createdAt: new Date(NOW - 48 * HOUR).toISOString(),
  };
}

const UPCOMING = booking("up", BANK, 24, "BOOKED"); // Sun 1 Nov, 12:00 Lagos
const STARTED = booking("started", OTHER_BANK, -1, "BOOKED"); // today, 11:00–13:00, running
const ATTENDED = booking("attended", BANK, -24 * 7, "ATTENDED"); // Sat 24 Oct
const ATTENDED_EARLIER = booking("attended-2", OTHER_BANK, -24 * 60, "ATTENDED");
const NO_SHOW = booking("no-show", OTHER_BANK, -24 * 14, "NO_SHOW");
const CANCELLED = booking("cancelled", BANK, -24 * 3, "CANCELLED");
const UNRECORDED = booking("unrecorded", BANK, -24, "BOOKED");

function page(items: Booking[]): ApiResponse<BookingPage> {
  return { data: { items, page: 0, size: 100, totalItems: items.length }, status: 200, requestId: "ref-ok", headers: new Headers() };
}

function refusal(code: ApiError["code"], status = 409): ApiError {
  return new ApiError({ status, code, message: "The service's own words.", requestId: `ref-${code}` });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/bookings"]}>
      <Routes>
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/slots" element={<p>Slots page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function cancelUpcoming() {
  await userEvent.click(await screen.findByRole("button", { name: /^Cancel booking Lagos Central Blood Bank/ }));
  const dialog = await screen.findByRole("dialog", { name: "Cancel this booking?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
}

async function openChangeTime() {
  const change = await screen.findByRole("button", { name: /^Change time Lagos Central Blood Bank/ });
  await userEvent.click(change);
  return { change, note: screen.getByRole("group", { name: "Change time?" }) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.listBookings.mockReset().mockResolvedValue(page([NO_SHOW, UPCOMING, ATTENDED, STARTED]));
  mocks.cancelBooking.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BookingsPage: donations band", () => {
  it("n > 0: the count, thanks and the latest donation's Lagos date, in an h1 that names the page", async () => {
    mocks.listBookings.mockResolvedValue(page([ATTENDED_EARLIER, UPCOMING, ATTENDED, NO_SHOW]));
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "My bookings: 2 donations so far" })).toBeTruthy();
    expect(screen.getByText("Thank you. Each one helps a patient in Lagos. Last on 24 October.")).toBeTruthy();
  });

  it("n = 0: the first donation is waiting, with no number", async () => {
    mocks.listBookings.mockResolvedValue(page([UPCOMING, NO_SHOW]));
    renderPage();
    expect(
      await screen.findByRole("heading", { level: 1, name: "My bookings: Your first donation is waiting." }),
    ).toBeTruthy();
    expect(screen.queryByText(/so far/)).toBeNull();
  });

  it("request failed: 'My bookings', no count, and the error below with Try again", async () => {
    mocks.listBookings.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Down.", requestId: "ref-500" }));
    renderPage();
    expect(await screen.findByText(/Reference: ref-500/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("My bookings");
    mocks.listBookings.mockResolvedValue(page([UPCOMING]));
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("region", { name: "Upcoming" })).toBeTruthy();
  });
});

describe("BookingsPage: upcoming", () => {
  it("BOOKED and not ended, soonest first, with Today / Tomorrow chips and Lagos times", async () => {
    renderPage();
    const upcoming = await screen.findByRole("region", { name: "Upcoming" });
    const cards = within(upcoming).getAllByRole("heading", { level: 3 });
    expect(cards.map((h) => h.textContent)).toEqual(["Saturday 31 October, 11:00–13:00", "Sunday 1 November, 12:00–14:00"]);
    const today = within(upcoming).getByText("Today");
    expect(today.className).toMatch(/whitespace-nowrap/);
    expect(within(upcoming).getByText("Tomorrow")).toBeTruthy();
    expect(screen.getByText("Times are Lagos time.")).toBeTruthy();
  });

  it("offers Cancel only on a booking whose slot hasn't started, and says why not otherwise", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Upcoming" });
    expect(screen.getAllByRole("button", { name: /^Cancel booking/ })).toHaveLength(1);
    expect(screen.getByText("You can cancel until 12:00 tomorrow.")).toBeTruthy();
    expect(screen.getByText("Started · too late to cancel")).toBeTruthy();
  });

  it("no Book link while an upcoming booking exists", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Upcoming" });
    expect(screen.queryByRole("link", { name: /^Book (a|another) donation/ })).toBeNull();
    expect(screen.queryByText("Nothing booked yet.")).toBeNull();
  });

  it("nothing upcoming: an empty state with Book a donation to /slots", async () => {
    mocks.listBookings.mockResolvedValue(page([ATTENDED]));
    renderPage();
    const upcoming = await screen.findByRole("region", { name: "Upcoming" });
    expect(within(upcoming).getByText("Nothing booked yet.")).toBeTruthy();
    expect(within(upcoming).getByRole("link", { name: "Book a donation" }).getAttribute("href")).toBe("/slots");
  });

  it("first use: no bookings at all", async () => {
    mocks.listBookings.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText("Nothing booked yet.")).toBeTruthy();
    expect(screen.getByText("No past bookings yet.")).toBeTruthy();
  });
});

describe("BookingsPage: past", () => {
  it("everything else, newest first, each status in words", async () => {
    mocks.listBookings.mockResolvedValue(page([NO_SHOW, UPCOMING, ATTENDED, CANCELLED, UNRECORDED]));
    renderPage();
    const past = await screen.findByRole("region", { name: "Past" });
    const statuses = within(past)
      .getAllByRole("listitem")
      .map((row) => row.lastElementChild?.textContent);
    expect(statuses).toEqual(["Not recorded yet", "Cancelled", "✓ Donated", "Missed"]);

    const donated = within(past).getByText("Donated");
    expect(donated.className).toMatch(/text-success/);
    expect(donated.className).toMatch(/whitespace-nowrap/);
    expect(donated.querySelector("[aria-hidden='true']")?.textContent).toBe("✓ ");
    expect(within(past).getByText("Missed").className).toMatch(/text-warning/);
    expect(within(past).getByText("Cancelled").className).toMatch(/text-muted-foreground/);
  });
});

describe("BookingsPage: change time", () => {
  it("opens a note under the card and moves focus to it; Keep booking closes it with focus back", async () => {
    renderPage();
    const { change, note } = await openChangeTime();
    expect(note.textContent).toMatch(/This cancels your current booking first, then you pick a new time\./);
    expect(document.activeElement).toBe(note);
    expect(change.getAttribute("aria-expanded")).toBe("true");

    await userEvent.click(within(note).getByRole("button", { name: "Keep booking" }));
    expect(screen.queryByRole("group", { name: "Change time?" })).toBeNull();
    expect(document.activeElement).toBe(change);
    expect(mocks.cancelBooking).not.toHaveBeenCalled();
  });

  it("only one filled action: Add to calendar goes outlined while the note is open", async () => {
    renderPage();
    const [first] = await screen.findAllByRole("button", { name: /^Add to calendar/ });
    expect(first.className).toMatch(/color-primary\)/);
    const { note } = await openChangeTime();
    for (const button of screen.getAllByRole("button", { name: /^Add to calendar/ })) {
      expect(button.className).toMatch(/border-input/);
    }
    expect(within(note).getByRole("button", { name: "Cancel and choose" }).className).toMatch(/bg-secondary/);
  });

  it("Cancel and choose cancels the booking, then goes to /slots", async () => {
    mocks.cancelBooking.mockResolvedValue({ data: { ...UPCOMING, status: "CANCELLED" }, status: 201, requestId: "ref", headers: new Headers() });
    renderPage();
    const { note } = await openChangeTime();
    await userEvent.click(within(note).getByRole("button", { name: "Cancel and choose" }));

    expect(await screen.findByText("Slots page")).toBeTruthy();
    expect(mocks.cancelBooking).toHaveBeenCalledWith("up");
  });

  it("a refused cancellation stays here with the message and its Reference", async () => {
    mocks.cancelBooking.mockRejectedValue(refusal("SLOT_CLOSED"));
    renderPage();
    const { note } = await openChangeTime();
    await userEvent.click(within(note).getByRole("button", { name: "Cancel and choose" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/has started, so the booking can't be cancelled/);
    expect(alert.textContent).toMatch(/Reference: ref-SLOT_CLOSED/);
    expect(screen.queryByText("Slots page")).toBeNull();
    expect(screen.queryByRole("group", { name: "Change time?" })).toBeNull();
    await waitFor(() => expect(mocks.listBookings).toHaveBeenCalledTimes(2));
  });
});

describe("BookingsPage: cancel", () => {
  it("cancels after confirming, says so, and reads the list again (not optimistic)", async () => {
    let answer: (value: ApiResponse<Booking>) => void = () => {};
    mocks.cancelBooking.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderPage();
    await cancelUpcoming();

    // Still upcoming until the service answers. (The open dialog hides the page from the accessibility tree.)
    const upcoming = screen.getByRole("region", { name: "Upcoming", hidden: true });
    expect(within(upcoming).getAllByRole("heading", { level: 3, hidden: true })).toHaveLength(2);
    expect(screen.getByRole("dialog", { name: "Cancel this booking?" })).toBeTruthy();
    expect(mocks.cancelBooking).toHaveBeenCalledWith("up");

    mocks.listBookings.mockResolvedValue(page([NO_SHOW, { ...UPCOMING, status: "CANCELLED" }, ATTENDED, STARTED]));
    answer({ data: { ...UPCOMING, status: "CANCELLED" }, status: 201, requestId: "ref", headers: new Headers() });

    expect(await screen.findByText(/^Booking cancelled: Lagos Central Blood Bank/)).toBeTruthy();
    expect(await within(screen.getByRole("region", { name: "Past" })).findByText("Cancelled")).toBeTruthy();
    expect(mocks.listBookings).toHaveBeenCalledTimes(2);
  });

  it("409 BOOKING_NOT_ACTIVE: its own message with the Reference, and a reload", async () => {
    mocks.cancelBooking.mockRejectedValue(refusal("BOOKING_NOT_ACTIVE"));
    renderPage();
    await cancelUpcoming();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/already cancelled or recorded/);
    expect(alert.textContent).toMatch(/Reference: ref-BOOKING_NOT_ACTIVE/);
    await waitFor(() => expect(mocks.listBookings).toHaveBeenCalledTimes(2));
  });

  it("409 SLOT_CLOSED: says the slot has started, and reloads", async () => {
    mocks.cancelBooking.mockRejectedValue(refusal("SLOT_CLOSED"));
    renderPage();
    await cancelUpcoming();

    expect((await screen.findByRole("alert")).textContent).toMatch(/has started, so the booking can't be cancelled/);
    await waitFor(() => expect(mocks.listBookings).toHaveBeenCalledTimes(2));
  });

  it("timeout: no retry; reads the bookings and says what this one now shows", async () => {
    mocks.cancelBooking.mockRejectedValue(refusal("TIMEOUT", 0));
    renderPage();
    await screen.findByRole("region", { name: "Upcoming" });
    mocks.listBookings.mockResolvedValue(page([NO_SHOW, { ...UPCOMING, status: "CANCELLED" }, ATTENDED, STARTED]));
    await cancelUpcoming();

    expect(
      await screen.findByText(/^We couldn't confirm\. Your booking for Lagos Central Blood Bank, .* now shows as Cancelled\.$/),
    ).toBeTruthy();
    expect(mocks.cancelBooking).toHaveBeenCalledTimes(1);
  });

  it("lost connection, and the check fails too: says it couldn't check", async () => {
    mocks.cancelBooking.mockRejectedValue(refusal("NETWORK_ERROR", 0));
    renderPage();
    await screen.findByRole("region", { name: "Upcoming" });
    mocks.listBookings.mockRejectedValue(refusal("NETWORK_ERROR", 0));
    await cancelUpcoming();

    expect(await screen.findByText(/couldn't confirm whether your booking was cancelled, or check your bookings/)).toBeTruthy();
    expect(mocks.cancelBooking).toHaveBeenCalledTimes(1);
  });
});
