// @vitest-environment jsdom
// SlotsPage. Donors: the week of days, time cards, booking and its 409s, a lost connection, the
// booked marker, the day buttons, the hero (heading, donations line, next donation) and Add to
// calendar. Staff: the list, the 31-day rule, filters and what each role is offered.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiError as ApiErrorType, ApiResponse } from "../api/client";
import type { Booking, BookingQuery, DonationSlot, DonationSlotList, Organisation, Role, Session } from "../api/types";
import { addDays } from "../lib/donations";
import { dayHeading, longDayLabel, shortDayLabel, slotClockRange } from "../lib/donorWeek";
import { lagosToday } from "../lib/expiry";

// IS_MOCK is read from VITE_MOCK when api/client loads. .env.local may say VITE_MOCK=true, which
// would swap in the donor screen's simulated week, so these tests pin it off before importing.
vi.stubEnv("VITE_MOCK", "false");

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
    session: { user: { role: auth.role, organisation: auth.organisation, displayName: "Ngozi" } } as unknown as Session,
    role: auth.role,
  }),
}));

const { ApiError } = await import("../api/client");
const { default: SlotsPage } = await import("./SlotsPage");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

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

/** A slot at `time` on the Lagos day `daysAhead` from today. Lagos is UTC+1 all year. */
function slotOn(id: string, bank: Organisation, daysAhead: number, time: string, capacity: number, booked: number): DonationSlot {
  const start = Date.parse(`${lagosDay(daysAhead)}T${time}:00+01:00`);
  return {
    id,
    bank,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 2 * HOUR).toISOString(),
    capacity,
    booked,
    placesLeft: capacity - booked,
  };
}

function lagosDay(daysAhead: number): string {
  return addDays(lagosToday(Date.now()), daysAhead);
}

// 24 and 48 hours ahead are always tomorrow and the day after in Lagos.
const OPEN = slot("slot-open", BANK, 24, 10, 7);
const LATER = slot("slot-later", OTHER_BANK, 48, 6, 0);

function ok<T>(data: T): ApiResponse<T> {
  return { data, status: 200, requestId: "ref-ok", headers: new Headers() };
}

function list(items: DonationSlot[]): ApiResponse<DonationSlotList> {
  return ok({ computedAt: new Date().toISOString(), items });
}

function booking(id: string, s: DonationSlot, status: Booking["status"]): Booking {
  return { id, slot: s, donor: { id: "d-1", displayName: "Ngozi" }, status, createdAt: new Date().toISOString() };
}

function bookingPage(items: Booking[]) {
  return ok({ items, page: 0, size: 100, totalItems: items.length });
}

/** GET /bookings answers by ?status: BOOKED and ATTENDED lists for the donor screen. */
function bookingsByStatus({ booked = [], attended = [] }: { booked?: Booking[]; attended?: Booking[] }) {
  mocks.listBookings.mockImplementation(async (query: BookingQuery) => {
    if (query.status === "BOOKED") return bookingPage(booked);
    if (query.status === "ATTENDED") return bookingPage(attended);
    return bookingPage([...booked, ...attended]);
  });
}

function refusal(code: ApiErrorType["code"], status = 409): ApiErrorType {
  return new ApiError({ status, code, message: "The service's own words.", requestId: `ref-${code}` });
}

function renderPage(path = "/slots") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SlotsPage />
    </MemoryRouter>,
  );
}

/** The heading of the dialog shown once a booking is made. */
const BOOKED_TITLE = "You're booked. Thank you.";

/** The hero's line under the h1 when there's no donations line to show. */
const BOOK_A_TIME = "Book a time at a blood bank near you. It takes about an hour.";

const dayButton = (daysAhead: number, count: string) =>
  screen.getByRole("button", { name: `${shortDayLabel(lagosDay(daysAhead))}, ${count}` });

/** Opens the dialog for the slot at Lagos Central (Ikeja, tomorrow) and confirms. */
async function bookOpenSlot() {
  await userEvent.click(await screen.findByRole("button", { name: /^Book this time: .*, Ikeja$/ }));
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
  bookingsByStatus({});
});

afterEach(() => cleanup());

describe("SlotsPage (donor): choose a day", () => {
  it("asks for this week's slots, Lagos dates from today", async () => {
    renderPage();
    await screen.findByText("3 of 10 places left");
    expect(mocks.listDonationSlots).toHaveBeenCalledWith({ from: lagosDay(0), to: lagosDay(6) }, expect.any(AbortSignal));
  });

  it("seven days from today in a labelled group, each with its count; empty days disabled", async () => {
    mocks.listDonationSlots.mockResolvedValue(
      list([
        slotOn("a", BANK, 1, "10:00", 10, 7),
        slotOn("b", OTHER_BANK, 1, "14:00", 6, 5),
        slotOn("full", BANK, 2, "10:00", 4, 4),
        slotOn("c", BANK, 3, "09:00", 8, 0),
      ]),
    );
    renderPage();
    await screen.findByText("3 of 10 places left");

    const group = screen.getByRole("group", { name: "Choose a day" });
    expect(within(group).getAllByRole("button")).toHaveLength(7);
    expect(dayButton(1, "2 slots").getAttribute("aria-pressed")).toBe("true");
    expect(dayButton(3, "1 slot").getAttribute("aria-pressed")).toBe("false");
    for (const daysAhead of [0, 2, 4, 5, 6]) {
      const button = dayButton(daysAhead, "No slots");
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("defaults to the first day with slots and says its count in a live status", async () => {
    renderPage();
    const status = await screen.findByText(dayHeading(lagosDay(1), 1));
    expect(status.getAttribute("role")).toBe("status");
    // Only that day's cards show.
    expect(screen.getByText("3 of 10 places left")).toBeTruthy();
    expect(screen.queryByText("6 of 6 places left")).toBeNull();
  });

  it("picking another day shows its cards and moves aria-pressed", async () => {
    renderPage();
    await screen.findByText("3 of 10 places left");
    await userEvent.click(dayButton(2, "1 slot"));

    expect(dayButton(2, "1 slot").getAttribute("aria-pressed")).toBe("true");
    expect(dayButton(1, "1 slot").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("6 of 6 places left")).toBeTruthy();
    expect(screen.queryByText("3 of 10 places left")).toBeNull();
    expect(screen.getByText(dayHeading(lagosDay(2), 1))).toBeTruthy();
  });

  it("time cards: time, area, bank, places; 'Only 1 place left' as a warning", async () => {
    mocks.listDonationSlots.mockResolvedValue(list([slotOn("a", BANK, 1, "10:00", 10, 7), slotOn("b", OTHER_BANK, 1, "14:00", 6, 5)]));
    renderPage();
    expect(await screen.findByRole("heading", { level: 3, name: "10:00–12:00" })).toBeTruthy();
    const card = screen.getByRole("heading", { level: 3, name: "14:00–16:00" }).closest("li")!;
    expect(within(card).getByText("Surulere")).toBeTruthy();
    expect(within(card).getByText("Surulere Blood Centre")).toBeTruthy();
    expect(within(card).getByText("Only 1 place left").className).toMatch(/text-warning/);
    expect(
      screen.getByRole("button", { name: `Book this time: ${shortDayLabel(lagosDay(1))}, 14:00–16:00, Surulere` }),
    ).toBeTruthy();
  });

  it("full or past slots wait behind a toggle, with their reason in words", async () => {
    mocks.listDonationSlots.mockResolvedValue(
      list([slotOn("a", BANK, 1, "10:00", 10, 7), slotOn("full", OTHER_BANK, 1, "14:00", 4, 4)]),
    );
    renderPage();
    const toggle = await screen.findByRole("button", { name: "Show 1 full or past slot" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const reason = screen.getByText("Full: no places left.");
    expect(reason.closest("ul")?.hidden).toBe(true);

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide 1 full or past slot" }).getAttribute("aria-expanded")).toBe("true");
    expect(reason.closest("ul")?.hidden).toBe(false);
    expect(screen.getAllByRole("button", { name: /^Book this time/ })).toHaveLength(1);
  });

  it("filters by area on our side, from the URL", async () => {
    renderPage("/slots?area=Surulere");
    // Only the Surulere slot (the day after tomorrow) is left, so tomorrow has none.
    expect(await screen.findByText("6 of 6 places left")).toBeTruthy();
    expect(dayButton(1, "No slots")).toBeTruthy();
    expect(screen.queryByText("3 of 10 places left")).toBeNull();
  });

  it("no slots this week: says so", async () => {
    mocks.listDonationSlots.mockResolvedValue(list([]));
    renderPage();
    expect(await screen.findByRole("heading", { name: "No slots this week" })).toBeTruthy();
  });

  it("error: Try again with the Reference", async () => {
    mocks.listDonationSlots.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Down.", requestId: "ref-500" }));
    renderPage();
    expect(await screen.findByText(/Reference: ref-500/)).toBeTruthy();
    mocks.listDonationSlots.mockResolvedValue(list([OPEN]));
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("3 of 10 places left")).toBeTruthy();
  });

  it("headings in order: h1, then h2s", async () => {
    renderPage();
    await screen.findByText("3 of 10 places left");
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    levels.forEach((level, i) => i > 0 && expect(level - levels[i - 1]).toBeLessThanOrEqual(1));
    expect(screen.getByRole("heading", { level: 1, name: "Give blood this week." })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Before you donate" })).toBeTruthy();
  });
});

describe("SlotsPage (donor): booked marker and the hero", () => {
  it("a slot the donor booked shows 'You're booked' and no button", async () => {
    const other = slotOn("other", OTHER_BANK, 1, "14:00", 6, 1);
    mocks.listDonationSlots.mockResolvedValue(list([OPEN, other]));
    bookingsByStatus({ booked: [booking("b-1", OPEN, "BOOKED")] });
    renderPage();

    const marker = await screen.findByText("You're booked");
    const card = marker.closest("li")!;
    expect(within(card).queryByRole("button")).toBeNull();
    expect(within(card).queryByText("3 of 10 places left")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Book this time/ })).toHaveLength(1);
  });

  it("the booked day says '✓ Booked' instead of its count, and stays selectable", async () => {
    bookingsByStatus({ booked: [booking("b-1", OPEN, "BOOKED")] });
    renderPage();
    const bookedDay = await screen.findByRole("button", { name: `${shortDayLabel(lagosDay(1))}, booked` });
    expect(within(bookedDay).getByText("Booked")).toBeTruthy();
    expect(within(bookedDay).queryByText("1 slot")).toBeNull();

    await userEvent.click(dayButton(2, "1 slot"));
    expect(within(bookedDay).getByText("Booked").className).toMatch(/text-primary/);
    await userEvent.click(bookedDay);
    expect(bookedDay.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText("You're booked")).toBeTruthy();
  });

  it("a day with no slots is disabled, dashed and says 'No slots'", async () => {
    renderPage();
    await screen.findByText("3 of 10 places left");
    const empty = dayButton(0, "No slots") as HTMLButtonElement;
    expect(empty.disabled).toBe(true);
    expect(within(empty).getByText("No slots")).toBeTruthy();
    expect(empty.className).toMatch(/border-dashed/);
    expect(empty.className).toMatch(/bg-transparent/);
  });

  it("every 'Book this time' is outlined: teal border and text on white, never filled", async () => {
    mocks.listDonationSlots.mockResolvedValue(
      list([slotOn("a", BANK, 1, "10:00", 10, 7), slotOn("b", OTHER_BANK, 1, "14:00", 6, 5), slotOn("c", BANK, 1, "17:00", 6, 0)]),
    );
    renderPage();
    await screen.findByRole("heading", { level: 3, name: "10:00–12:00" });
    const buttons = screen.getAllByRole("button", { name: /^Book this time/ });
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      const classes = button.className.split(/\s+/);
      expect(classes).toEqual(expect.arrayContaining(["border-primary", "text-primary", "bg-surface"]));
      expect(classes).not.toContain("bg-primary");
      expect(classes.some((c) => c.startsWith("bg-[var(--color-primary"))).toBe(false);
    }
  });

  it("hero heading with a booking tomorrow; next donation: the soonest, with calendar and Manage", async () => {
    const later = slotOn("later", BANK, 4, "09:00", 6, 1);
    bookingsByStatus({ booked: [booking("b-2", later, "BOOKED"), booking("b-1", OPEN, "BOOKED")] });
    renderPage();

    const card = (await screen.findByRole("heading", { name: "Your next donation" })).closest("section")!;
    expect(screen.getByRole("heading", { level: 1, name: "You're donating tomorrow." })).toBeTruthy();
    expect(within(card).getByText(`${BANK.name} · ${BANK.area}`)).toBeTruthy();
    expect(within(card).getByText(longDayLabel(lagosDay(1)))).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Manage" }).getAttribute("href")).toBe("/bookings");
    expect(within(card).getByRole("button", { name: "Add to calendar" })).toBeTruthy();
  });

  it("hero heading with a booking later today", async () => {
    // A minute from now is still today in Lagos, except in the last minute before midnight.
    const soon = slot("soon", BANK, 1 / 60, 6, 1);
    bookingsByStatus({ booked: [booking("b-1", soon, "BOOKED")] });
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "You're donating today." })).toBeTruthy();
  });

  it("hero heading with a booking later this week names the day", async () => {
    bookingsByStatus({ booked: [booking("b-1", slotOn("later", BANK, 4, "09:00", 6, 1), "BOOKED")] });
    renderPage();
    expect(
      await screen.findByRole("heading", { level: 1, name: `You're donating on ${longDayLabel(lagosDay(4))}.` }),
    ).toBeTruthy();
  });

  it("no booking: the default heading, 'No upcoming donation' and nothing else", async () => {
    renderPage();
    expect(await screen.findByText("No upcoming donation")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Give blood this week." })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Your next donation" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add to calendar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage" })).toBeNull();
  });

  it("bookings fail to load: the default heading, Try again in the card, and the slots still show", async () => {
    mocks.listBookings.mockImplementation(async (query: BookingQuery) => {
      if (query.status === "BOOKED") throw new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Down.", requestId: "ref-500" });
      return bookingPage([]);
    });
    renderPage();
    expect(await screen.findByText("We couldn't check your bookings just now.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Give blood this week." })).toBeTruthy();
    expect(screen.queryByText("No upcoming donation")).toBeNull();
    expect(await screen.findByText("3 of 10 places left")).toBeTruthy();
  });

  it("Add to calendar saves an .ics file of the booking", async () => {
    const createObjectURL = vi.fn((blob: Blob) => (void blob, "blob:ics"));
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    bookingsByStatus({ booked: [booking("b-1", OPEN, "BOOKED")] });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Add to calendar" }));
    expect(click).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("text/calendar;charset=utf-8");
    const text = await blob.text();
    expect(text).toContain("UID:b-1@bloodlink\r\n");
    expect(text).toContain(`DTSTART:${OPEN.startsAt.replace(/[-:]/g, "").replace(/\.\d{3}/, "")}\r\n`);
    expect(text).toContain("LOCATION:Lagos Central Blood Bank\\, Ikeja\r\n");
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("donations line: the ATTENDED count, in place of the usual line", async () => {
    const past = (id: string, daysAgo: number) =>
      booking(id, { ...OPEN, id: `s-${id}`, startsAt: new Date(Date.now() - daysAgo * DAY).toISOString() }, "ATTENDED");
    bookingsByStatus({ attended: [past("a", 200), past("b", 40), past("c", 120)] });
    renderPage();
    expect(await screen.findByText("3 donations so far · thank you")).toBeTruthy();
    expect(screen.queryByText(BOOK_A_TIME)).toBeNull();
    expect(mocks.listBookings).toHaveBeenCalledWith({ status: "ATTENDED", page: 0, size: 100 }, expect.any(AbortSignal));
  });

  it("donations line: with no donations, the usual line instead", async () => {
    renderPage();
    await screen.findByText("No upcoming donation");
    expect(screen.getByText(BOOK_A_TIME)).toBeTruthy();
    expect(screen.queryByText(/so far · thank you/)).toBeNull();
  });

  it("donations line: while it loads, the usual line instead", async () => {
    mocks.listBookings.mockImplementation((query: BookingQuery) =>
      query.status === "ATTENDED" ? new Promise(() => {}) : Promise.resolve(bookingPage([])),
    );
    renderPage();
    await screen.findByText("No upcoming donation");
    expect(screen.getByText(BOOK_A_TIME)).toBeTruthy();
    expect(screen.queryByText(/so far · thank you/)).toBeNull();
  });

  it("donations line: when its read fails, the usual line instead, and the slots still show", async () => {
    mocks.listBookings.mockImplementation(async (query: BookingQuery) => {
      if (query.status === "ATTENDED") throw new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Down.", requestId: "ref-500" });
      return bookingPage([]);
    });
    renderPage();
    expect(await screen.findByText("3 of 10 places left")).toBeTruthy();
    await screen.findByText("No upcoming donation");
    expect(screen.getByText(BOOK_A_TIME)).toBeTruthy();
    expect(screen.queryByText(/so far · thank you/)).toBeNull();
  });
});

describe("SlotsPage (donor): booking", () => {
  it("books after confirming, shows 'You're booked', and reloads the places and the donor's bookings", async () => {
    mocks.bookDonationSlot.mockResolvedValue({ ...ok(booking("b-new", OPEN, "BOOKED")), status: 201 });
    renderPage();
    await bookOpenSlot();

    const dialog = await screen.findByRole("dialog", { name: BOOKED_TITLE });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(within(dialog).getByText("One donation can help more than one patient.")).toBeTruthy();
    expect(mocks.bookDonationSlot).toHaveBeenCalledTimes(1);
    expect(mocks.bookDonationSlot).toHaveBeenCalledWith("slot-open");
    await waitFor(() => expect(mocks.listDonationSlots).toHaveBeenCalledTimes(2));
    const bookedReads = mocks.listBookings.mock.calls.filter(([query]) => query.status === "BOOKED");
    expect(bookedReads).toHaveLength(2);
  });

  it("'You're booked' says when (Lagos day and time), where (bank · area), what to bring, and the cancel rule", async () => {
    mocks.bookDonationSlot.mockResolvedValue({ ...ok(booking("b-new", OPEN, "BOOKED")), status: 201 });
    renderPage();
    await bookOpenSlot();

    const dialog = await screen.findByRole("dialog", { name: BOOKED_TITLE });
    const text = dialog.textContent ?? "";
    expect(text).toContain(`${longDayLabel(lagosDay(1))} · ${slotClockRange(OPEN).label}`);
    expect(text).toContain("Lagos Central Blood Bank · Ikeja");
    expect(text).toContain("A photo ID. Eat and drink water first.");
    expect(text).toContain("You can cancel until the slot starts.");
    expect(within(dialog).getByRole("link", { name: "See my bookings" }).getAttribute("href")).toBe("/bookings");
    expect(within(dialog).getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("'You're booked': the heading takes focus; Escape closes it and focus goes to 'Choose a day'", async () => {
    mocks.bookDonationSlot.mockResolvedValue({ ...ok(booking("b-new", OPEN, "BOOKED")), status: 201 });
    renderPage();
    await bookOpenSlot();

    const dialog = await screen.findByRole("dialog", { name: BOOKED_TITLE });
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: BOOKED_TITLE })));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Choose a day" })));
  });

  it("'You're booked': the close button closes it too", async () => {
    mocks.bookDonationSlot.mockResolvedValue({ ...ok(booking("b-new", OPEN, "BOOKED")), status: 201 });
    renderPage();
    await bookOpenSlot();

    await userEvent.click(within(await screen.findByRole("dialog", { name: BOOKED_TITLE })).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Choose a day" }));
  });

  it("'You're booked': Add to calendar saves an .ics file of the new booking", async () => {
    const createObjectURL = vi.fn((blob: Blob) => (void blob, "blob:ics"));
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mocks.bookDonationSlot.mockResolvedValue({ ...ok(booking("b-new", OPEN, "BOOKED")), status: 201 });
    renderPage();
    await bookOpenSlot();

    const dialog = await screen.findByRole("dialog", { name: BOOKED_TITLE });
    await userEvent.click(within(dialog).getByRole("button", { name: "Add to calendar" }));
    expect(click).toHaveBeenCalledTimes(1);
    const text = await createObjectURL.mock.calls[0][0].text();
    expect(text).toContain("UID:b-new@bloodlink\r\n");
    expect(text).toContain("LOCATION:Lagos Central Blood Bank\\, Ikeja\r\n");
    // Saving doesn't close it.
    expect(screen.getByRole("dialog", { name: BOOKED_TITLE })).toBeTruthy();
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("is not optimistic: places stay as loaded until the service answers", async () => {
    let answer: (value: ApiResponse<Booking>) => void = () => {};
    mocks.bookDonationSlot.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderPage();
    await bookOpenSlot();

    expect(screen.getByText("3 of 10 places left")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: BOOKED_TITLE })).toBeNull();
    expect(screen.getAllByText("Booking your place at Lagos Central Blood Bank…").length).toBeGreaterThan(0);
    answer({ ...ok(booking("b-new", OPEN, "BOOKED")), status: 201 });
    expect(await screen.findByRole("dialog", { name: BOOKED_TITLE })).toBeTruthy();
  });

  it("409 SLOT_FULL: 'This slot just filled up', with the Reference, and a reload", async () => {
    mocks.bookDonationSlot.mockRejectedValue(refusal("SLOT_FULL"));
    renderPage();
    await bookOpenSlot();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/This slot just filled up/);
    expect(alert.textContent).toMatch(/Reference: ref-SLOT_FULL/);
    expect(screen.queryByRole("dialog", { name: BOOKED_TITLE })).toBeNull();
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
    expect(screen.queryByRole("dialog", { name: BOOKED_TITLE })).toBeNull();
    await waitFor(() => expect(mocks.listDonationSlots).toHaveBeenCalledTimes(2));
  });

  it("timeout: doesn't book again; checks the donor's bookings and says it wasn't booked", async () => {
    mocks.bookDonationSlot.mockRejectedValue(refusal("TIMEOUT", 0));
    renderPage();
    await bookOpenSlot();

    expect(await screen.findByText(/your bookings don't show .* so it wasn't booked/)).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: BOOKED_TITLE })).toBeNull();
    expect(mocks.bookDonationSlot).toHaveBeenCalledTimes(1);
    expect(mocks.listBookings).toHaveBeenCalledWith({ page: 0, size: 100 }, undefined);
    await waitFor(() => expect(mocks.listDonationSlots).toHaveBeenCalledTimes(2));
  });

  it("lost connection: shows 'You're booked' when the donor's bookings have it after all", async () => {
    mocks.bookDonationSlot.mockRejectedValue(refusal("NETWORK_ERROR", 0));
    renderPage();
    await screen.findByText("3 of 10 places left");
    // The service made the booking after all.
    bookingsByStatus({ booked: [booking("b-1", OPEN, "BOOKED")] });
    await bookOpenSlot();

    const dialog = await screen.findByRole("dialog", { name: BOOKED_TITLE });
    expect(dialog.textContent).toContain("Lagos Central Blood Bank · Ikeja");
    expect(mocks.bookDonationSlot).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByText("You're booked")).toBeTruthy();
  });
});

describe("SlotsPage (staff): the list and what each role is offered", () => {
  beforeEach(() => {
    auth.role = "BANK_STAFF";
    auth.organisation = BANK;
  });

  it("shows bank, Lagos time and places left as text", async () => {
    renderPage();
    expect(await screen.findByText("3 of 10 places left")).toBeTruthy();
    expect(screen.getByText("6 of 6 places left")).toBeTruthy();
    expect(screen.getAllByText(/Lagos time$/)).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Lagos Central Blood Bank" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Give blood this week." })).toBeNull();
  });

  it("only bank staff get New slot", async () => {
    renderPage();
    expect((await screen.findByRole("link", { name: "New slot" })).getAttribute("href")).toBe("/slots/new");
    cleanup();

    auth.role = "ADMIN";
    auth.organisation = null;
    renderPage();
    await screen.findByText("3 of 10 places left");
    expect(screen.queryByRole("link", { name: "New slot" })).toBeNull();
  });

  it("View bookings: on the staff's own bank's slots only; on every slot for the administrator; never for donors", async () => {
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
    cleanup();

    auth.role = "DONOR";
    renderPage();
    await screen.findByText("3 of 10 places left");
    expect(screen.queryByRole("link", { name: /^View bookings/ })).toBeNull();
  });

  it.each([["BANK_STAFF"], ["ADMIN"]] as const)("%s sees the slots but no Book button", async (role) => {
    auth.role = role;
    auth.organisation = role === "BANK_STAFF" ? BANK : null;
    renderPage();
    expect(await screen.findByText("3 of 10 places left")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Book/ })).toBeNull();
  });
});

describe("SlotsPage (staff): filters", () => {
  beforeEach(() => {
    auth.role = "BANK_STAFF";
    auth.organisation = BANK;
  });

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
