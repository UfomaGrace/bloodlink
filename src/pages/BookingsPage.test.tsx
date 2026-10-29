// @vitest-environment jsdom
// BookingsPage: a donor's upcoming and past bookings, cancelling one, its 409s and a lost connection.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
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

function booking(id: string, bank: Organisation, startsInHours: number, status: Booking["status"]): Booking {
  const start = Date.now() + startsInHours * HOUR;
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
    createdAt: new Date(Date.now() - 48 * HOUR).toISOString(),
  };
}

const UPCOMING = booking("up", BANK, 24, "BOOKED");
const STARTED = booking("started", OTHER_BANK, -1, "BOOKED");
const ATTENDED = booking("attended", BANK, -24 * 7, "ATTENDED");
const NO_SHOW = booking("no-show", OTHER_BANK, -24 * 14, "NO_SHOW");

function page(items: Booking[]): ApiResponse<BookingPage> {
  return { data: { items, page: 0, size: 100, totalItems: items.length }, status: 200, requestId: "ref-ok", headers: new Headers() };
}

function refusal(code: ApiError["code"], status = 409): ApiError {
  return new ApiError({ status, code, message: "The service's own words.", requestId: `ref-${code}` });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BookingsPage />
    </MemoryRouter>,
  );
}

async function cancelUpcoming() {
  await userEvent.click(await screen.findByRole("button", { name: /^Cancel booking Lagos Central Blood Bank/ }));
  const dialog = await screen.findByRole("dialog", { name: "Cancel this booking?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
}

beforeEach(() => {
  mocks.listBookings.mockReset().mockResolvedValue(page([NO_SHOW, UPCOMING, ATTENDED, STARTED]));
  mocks.cancelBooking.mockReset();
});

afterEach(() => cleanup());

describe("BookingsPage: upcoming and past", () => {
  it("splits bookings by their slot, with status as text", async () => {
    renderPage();
    const upcoming = await screen.findByRole("region", { name: /Upcoming \(2\)/ });
    const past = screen.getByRole("region", { name: /Past \(2\)/ });
    expect(within(upcoming).getAllByText("Booked")).toHaveLength(2);
    expect(within(past).getByText("Attended")).toBeTruthy();
    expect(within(past).getByText("Did not attend")).toBeTruthy();
    expect(screen.getAllByText(/Lagos time$/)).toHaveLength(4);
  });

  it("offers Cancel only on a BOOKED booking whose slot hasn't started, and says why not otherwise", async () => {
    renderPage();
    await screen.findByRole("region", { name: /Upcoming/ });
    expect(screen.getAllByRole("button", { name: /^Cancel booking/ })).toHaveLength(1);
    expect(screen.getByText("Started: too late to cancel.")).toBeTruthy();
  });

  it("first use: no bookings, with a way to find a slot", async () => {
    mocks.listBookings.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByRole("heading", { name: "No bookings yet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Find a donation slot" })).toBeTruthy();
  });

  it("error: Try again with the Reference", async () => {
    mocks.listBookings.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Down.", requestId: "ref-500" }));
    renderPage();
    expect(await screen.findByText(/Reference: ref-500/)).toBeTruthy();
    mocks.listBookings.mockResolvedValue(page([UPCOMING]));
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("region", { name: /Upcoming \(1\)/ })).toBeTruthy();
  });
});

describe("BookingsPage: cancel", () => {
  it("cancels after confirming, says so, and reads the list again (not optimistic)", async () => {
    let answer: (value: ApiResponse<Booking>) => void = () => {};
    mocks.cancelBooking.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderPage();
    await cancelUpcoming();

    // Still Booked until the service answers. (The open dialog hides the page from the accessibility tree.)
    expect(within(screen.getByRole("region", { name: /Upcoming/, hidden: true })).getAllByText("Booked")).toHaveLength(2);
    expect(screen.getByRole("dialog", { name: "Cancel this booking?" })).toBeTruthy();
    expect(mocks.cancelBooking).toHaveBeenCalledWith("up");

    mocks.listBookings.mockResolvedValue(page([NO_SHOW, { ...UPCOMING, status: "CANCELLED" }, ATTENDED, STARTED]));
    answer({ data: { ...UPCOMING, status: "CANCELLED" }, status: 201, requestId: "ref", headers: new Headers() });

    expect(await screen.findByText(/^Booking cancelled: Lagos Central Blood Bank/)).toBeTruthy();
    expect(await screen.findByText("Cancelled")).toBeTruthy();
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
    await screen.findByRole("region", { name: /Upcoming/ });
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
    await screen.findByRole("region", { name: /Upcoming/ });
    mocks.listBookings.mockRejectedValue(refusal("NETWORK_ERROR", 0));
    await cancelUpcoming();

    expect(await screen.findByText(/couldn't confirm whether your booking was cancelled, or check your bookings/)).toBeTruthy();
    expect(mocks.cancelBooking).toHaveBeenCalledTimes(1);
  });
});
