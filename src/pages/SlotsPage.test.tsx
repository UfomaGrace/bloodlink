// @vitest-environment jsdom
// SlotsPage: the donor's slot list and booking, its 409s, a lost connection, the 31-day rule and roles.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { DonationSlot, DonationSlotList, Organisation, Role, Session } from "../api/types";

const BANK: Organisation = { id: "0d1f6a3e-2b4c-4e5f-8a9b-1c2d3e4f5a6b", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" };
const OTHER_BANK: Organisation = { id: "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b", name: "Surulere Blood Centre", type: "BLOOD_BANK", area: "Surulere" };

const mocks = vi.hoisted(() => ({
  listOrganisations: vi.fn(),
  listDonationSlots: vi.fn(),
  bookDonationSlot: vi.fn(),
  listBookings: vi.fn(),
}));
const auth = vi.hoisted(() => ({ role: "DONOR" as Role, organisation: null as Organisation | null }));
vi.mock("../api/endpoints", () => ({ api: mocks }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { role: auth.role, organisation: auth.organisation } } as unknown as Session,
    role: auth.role,
  }),
}));

const { default: SlotsPage } = await import("./SlotsPage");

const HOUR = 3_600_000;

function slot(id: string, bank: Organisation, startsInHours: number, capacity: number, booked: number): DonationSlot {
  const start = Date.now() + startsInHours * HOUR;
  return {
    id,
    bank,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + HOUR).toISOString(),
    capacity,
    booked,
    placesLeft: capacity - booked,
  };
}

const OPEN = slot("slot-open", BANK, 24, 10, 7);
const LATER = slot("slot-later", OTHER_BANK, 48, 6, 0);

function ok<T>(data: T): ApiResponse<T> {
  return { data, status: 200, requestId: "ref-ok", headers: new Headers() };
}

function list(items: DonationSlot[]): ApiResponse<DonationSlotList> {
  return ok({ computedAt: new Date().toISOString(), items });
}

function refusal(code: ApiError["code"], status = 409): ApiError {
  return new ApiError({ status, code, message: "The service's own words.", requestId: `ref-${code}` });
}

function renderPage(path = "/slots") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SlotsPage />
    </MemoryRouter>,
  );
}

/** Opens the dialog for the slot at Lagos Central and confirms. */
async function bookOpenSlot() {
  await userEvent.click(await screen.findByRole("button", { name: /^Book Lagos Central Blood Bank/ }));
  const dialog = await screen.findByRole("dialog", { name: "Book this slot?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Book place" }));
}

beforeEach(() => {
  auth.role = "DONOR";
  auth.organisation = null;
  mocks.listOrganisations.mockReset().mockResolvedValue(ok({ items: [BANK, OTHER_BANK] }));
  mocks.listDonationSlots.mockReset().mockResolvedValue(list([OPEN, LATER]));
  mocks.bookDonationSlot.mockReset();
  mocks.listBookings.mockReset();
});

afterEach(() => cleanup());

describe("SlotsPage: donor books a slot", () => {
  it("shows bank, Lagos time and places left as text", async () => {
    renderPage();
    expect(await screen.findByText("3 of 10 places left")).toBeTruthy();
    expect(screen.getByText("6 of 6 places left")).toBeTruthy();
    expect(screen.getAllByText(/Lagos time$/)).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Lagos Central Blood Bank" })).toBeTruthy();
  });

  it("books after confirming, says so, and reloads the places", async () => {
    mocks.bookDonationSlot.mockResolvedValue({ ...ok({}), status: 201 });
    renderPage();
    await bookOpenSlot();

    expect(await screen.findByText(/^Booked: Lagos Central Blood Bank/)).toBeTruthy();
    expect(mocks.bookDonationSlot).toHaveBeenCalledTimes(1);
    expect(mocks.bookDonationSlot).toHaveBeenCalledWith("slot-open");
    await waitFor(() => expect(mocks.listDonationSlots).toHaveBeenCalledTimes(2));
  });

  it("is not optimistic: places stay as loaded until the service answers", async () => {
    let answer: (value: ApiResponse<object>) => void = () => {};
    mocks.bookDonationSlot.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderPage();
    await bookOpenSlot();

    expect(screen.getByText("3 of 10 places left")).toBeTruthy();
    expect(screen.queryByText(/^Booked:/)).toBeNull();
    expect(screen.getAllByText("Booking your place at Lagos Central Blood Bank…").length).toBeGreaterThan(0);
    answer({ ...ok({}), status: 201 });
    expect(await screen.findByText(/^Booked:/)).toBeTruthy();
  });
});

describe("SlotsPage: refused bookings", () => {
  it("409 SLOT_FULL: 'This slot just filled up', with the Reference, and a reload", async () => {
    mocks.bookDonationSlot.mockRejectedValue(refusal("SLOT_FULL"));
    renderPage();
    await bookOpenSlot();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/This slot just filled up/);
    expect(alert.textContent).toMatch(/Reference: ref-SLOT_FULL/);
    await waitFor(() => expect(mocks.listDonationSlots).toHaveBeenCalledTimes(2));
  });

  it("409 SLOT_CLOSED: says the slot has started, and reloads", async () => {
    mocks.bookDonationSlot.mockRejectedValue(refusal("SLOT_CLOSED"));
    renderPage();
    await bookOpenSlot();

    expect((await screen.findByRole("alert")).textContent).toMatch(/has started, so it can't be booked/);
    await waitFor(() => expect(mocks.listDonationSlots).toHaveBeenCalledTimes(2));
  });

  it("409 ALREADY_BOOKED: says the donor already has a place (not an error), and reloads", async () => {
    mocks.bookDonationSlot.mockRejectedValue(refusal("ALREADY_BOOKED"));
    renderPage();
    await bookOpenSlot();

    expect(await screen.findByText(/You already have a place in this slot/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(mocks.listDonationSlots).toHaveBeenCalledTimes(2));
  });

  it("timeout: doesn't book again; checks the donor's bookings and says it wasn't booked", async () => {
    mocks.bookDonationSlot.mockRejectedValue(refusal("TIMEOUT", 0));
    mocks.listBookings.mockResolvedValue(ok({ items: [], page: 0, size: 100, totalItems: 0 }));
    renderPage();
    await bookOpenSlot();

    expect(await screen.findByText(/your bookings don't show .* so it wasn't booked/)).toBeTruthy();
    expect(mocks.bookDonationSlot).toHaveBeenCalledTimes(1);
    expect(mocks.listBookings).toHaveBeenCalledWith({ page: 0, size: 100 }, undefined);
    await waitFor(() => expect(mocks.listDonationSlots).toHaveBeenCalledTimes(2));
  });

  it("lost connection: says the booking now shows when the service has it", async () => {
    mocks.bookDonationSlot.mockRejectedValue(refusal("NETWORK_ERROR", 0));
    mocks.listBookings.mockResolvedValue(
      ok({
        items: [{ id: "b-1", slot: OPEN, donor: { id: "d-1", displayName: "Ngozi" }, status: "BOOKED", createdAt: new Date().toISOString() }],
        page: 0,
        size: 100,
        totalItems: 1,
      }),
    );
    renderPage();
    await bookOpenSlot();

    expect(await screen.findByText(/your bookings now show a place for you/)).toBeTruthy();
    expect(mocks.bookDonationSlot).toHaveBeenCalledTimes(1);
  });
});

describe("SlotsPage: what each role is offered", () => {
  it("no Book on a full or started slot, with the reason in words", async () => {
    mocks.listDonationSlots.mockResolvedValue(list([slot("full", BANK, 24, 4, 4), slot("started", OTHER_BANK, -0.5, 8, 3)]));
    renderPage();
    expect(await screen.findByText("Full: no places left.")).toBeTruthy();
    expect(screen.getByText("Booking closed: this slot has started.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Book / })).toBeNull();
  });

  it("only bank staff get New slot", async () => {
    renderPage();
    await screen.findByText("3 of 10 places left");
    expect(screen.queryByRole("link", { name: "New slot" })).toBeNull();
    cleanup();

    auth.role = "BANK_STAFF";
    auth.organisation = BANK;
    renderPage();
    expect((await screen.findByRole("link", { name: "New slot" })).getAttribute("href")).toBe("/slots/new");
  });

  it("View bookings: on the staff's own bank's slots only; on every slot for the administrator; never for donors", async () => {
    renderPage();
    await screen.findByText("3 of 10 places left");
    expect(screen.queryByRole("link", { name: /^View bookings/ })).toBeNull();
    cleanup();

    auth.role = "BANK_STAFF";
    auth.organisation = BANK;
    renderPage();
    const links = await screen.findAllByRole("link", { name: /^View bookings/ });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("aria-label")).toMatch(/^View bookings: Lagos Central Blood Bank/);
    expect(links[0].getAttribute("href")).toBe("/slots/slot-open");
    cleanup();

    auth.role = "ADMIN";
    auth.organisation = null;
    renderPage();
    expect(await screen.findAllByRole("link", { name: /^View bookings/ })).toHaveLength(2);
  });

  it.each([["BANK_STAFF"], ["ADMIN"]] as const)("%s sees the slots but no Book button", async (role) => {
    auth.role = role;
    auth.organisation = role === "BANK_STAFF" ? BANK : null;
    renderPage();
    expect(await screen.findByText("3 of 10 places left")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Book / })).toBeNull();
  });
});

describe("SlotsPage: filters", () => {
  it("refuses a range over 31 days in the form, with a clear message, and sends nothing", async () => {
    renderPage();
    await screen.findByText("3 of 10 places left");
    fireEvent.change(screen.getByLabelText(/First day/), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText(/Last day/), { target: { value: "2026-12-03" } });
    await userEvent.click(screen.getByRole("button", { name: "Show slots" }));

    expect(await screen.findByText(/Choose a range of 31 days or fewer.*2 Dec 2026 at the latest/)).toBeTruthy();
    expect(mocks.listDonationSlots).toHaveBeenCalledTimes(1);
  });

  it("sends a range of 31 days", async () => {
    renderPage();
    await screen.findByText("3 of 10 places left");
    fireEvent.change(screen.getByLabelText(/First day/), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText(/Last day/), { target: { value: "2026-12-02" } });
    await userEvent.click(screen.getByRole("button", { name: "Show slots" }));

    await waitFor(() =>
      expect(mocks.listDonationSlots).toHaveBeenLastCalledWith(
        { bankId: undefined, from: "2026-11-01", to: "2026-12-02" },
        expect.any(AbortSignal),
      ),
    );
  });

  it("a link with a range over 31 days loads nothing and says why", async () => {
    renderPage("/slots?from=2026-11-01&to=2026-12-20");
    expect(await screen.findByRole("heading", { name: "Choose other dates" })).toBeTruthy();
    expect(mocks.listDonationSlots).not.toHaveBeenCalled();
  });

  it("refuses a day after 31 Dec 2100 in the form, and sends nothing", async () => {
    renderPage();
    await screen.findByText("3 of 10 places left");
    fireEvent.change(screen.getByLabelText(/First day/), { target: { value: "2100-12-31" } });
    fireEvent.change(screen.getByLabelText(/Last day/), { target: { value: "2101-01-01" } });
    await userEvent.click(screen.getByRole("button", { name: "Show slots" }));

    expect(await screen.findByText("Choose days from 1 Jan 2000 to 31 Dec 2100.")).toBeTruthy();
    expect(mocks.listDonationSlots).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a first day before 2000", "/slots?from=1999-12-31"],
    ["a last day after 2100", "/slots?from=2100-12-20&to=2101-01-02"],
  ])("a link with %s loads nothing and says which days can be chosen", async (_, url) => {
    renderPage(url);
    expect(await screen.findByRole("heading", { name: "Choose other dates" })).toBeTruthy();
    expect(screen.getAllByText("Choose days from 1 Jan 2000 to 31 Dec 2100.").length).toBeGreaterThan(0);
    expect(mocks.listDonationSlots).not.toHaveBeenCalled();
  });

  it("filters by area on our side, from the URL", async () => {
    renderPage("/slots?area=Surulere");
    expect(await screen.findByText("6 of 6 places left")).toBeTruthy();
    expect(screen.queryByText("3 of 10 places left")).toBeNull();
    expect(screen.getByText("Matched here against each slot's bank.")).toBeTruthy();
  });

  it("first use: says no bank has opened a slot", async () => {
    mocks.listDonationSlots.mockResolvedValue(list([]));
    renderPage();
    expect(await screen.findByRole("heading", { name: "No donation slots yet" })).toBeTruthy();
  });

  it("error: Try again with the Reference", async () => {
    mocks.listDonationSlots.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Down.", requestId: "ref-500" }));
    renderPage();
    expect(await screen.findByText(/Reference: ref-500/)).toBeTruthy();
    mocks.listDonationSlots.mockResolvedValue(list([OPEN]));
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("3 of 10 places left")).toBeTruthy();
  });
});
