// @vitest-environment jsdom
// SlotDetailPage: a slot's bookings and recording attendance, its 409s and 422, a lost
// connection, and who gets the actions (not donors, not staff of another bank).
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { Booking, BookingPage, DonationSlot, Organisation, Role, Session } from "../api/types";

const BANK: Organisation = { id: "bank-1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" };
const OTHER_BANK: Organisation = { id: "bank-2", name: "Surulere Blood Centre", type: "BLOOD_BANK", area: "Surulere" };

const mocks = vi.hoisted(() => ({ listBookings: vi.fn(), recordAttendance: vi.fn() }));
const auth = vi.hoisted(() => ({ role: "BANK_STAFF" as Role, organisation: null as Organisation | null }));
vi.mock("../api/endpoints", () => ({ api: mocks }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { role: auth.role, organisation: auth.organisation } } as unknown as Session,
    role: auth.role,
  }),
}));

const { default: SlotDetailPage } = await import("./SlotDetailPage");

const HOUR = 3_600_000;
const SLOT_ID = "slot-1";

function slotAt(bank: Organisation, startsInHours: number): DonationSlot {
  const start = Date.now() + startsInHours * HOUR;
  return {
    id: SLOT_ID,
    bank,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 2 * HOUR).toISOString(),
    capacity: 10,
    booked: 3,
    placesLeft: 7,
  };
}

function booking(id: string, name: string, slot: DonationSlot, status: Booking["status"] = "BOOKED"): Booking {
  return { id, slot, donor: { id: `donor-${id}`, displayName: name }, status, createdAt: new Date(Date.now() - 48 * HOUR).toISOString() };
}

// Started half an hour ago at Lagos Central: Ngozi and Emeka to record, Funmi already recorded.
const STARTED = slotAt(BANK, -0.5);
const NGOZI = booking("b-1", "Ngozi Adeyemi", STARTED);
const EMEKA = booking("b-2", "Emeka Obi", STARTED);
const FUNMI = booking("b-3", "Funmi Lawal", STARTED, "ATTENDED");
const ELSEWHERE = booking("b-9", "Someone Else", { ...STARTED, id: "slot-other" });

function page(items: Booking[]): ApiResponse<BookingPage> {
  return { data: { items, page: 0, size: 100, totalItems: items.length }, status: 200, requestId: "ref-ok", headers: new Headers() };
}

function refusal(code: ApiError["code"], status = 409, details: ApiError["details"] = []): ApiError {
  return new ApiError({ status, code, message: "The service's own words.", requestId: `ref-${code}`, details });
}

function renderPage(state?: { slot: DonationSlot }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/slots/${SLOT_ID}`, state }]}>
      <Routes>
        <Route path="/slots/:slotId" element={<SlotDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function record(button: RegExp, confirm: string) {
  await userEvent.click(await screen.findByRole("button", { name: button }));
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(within(dialog).getByRole("button", { name: confirm }));
}

beforeEach(() => {
  auth.role = "BANK_STAFF";
  auth.organisation = BANK;
  mocks.listBookings.mockReset().mockResolvedValue(page([NGOZI, ELSEWHERE, EMEKA, FUNMI]));
  mocks.recordAttendance.mockReset();
});

afterEach(() => cleanup());

describe("SlotDetailPage: the slot and its bookings", () => {
  it("shows the slot's details, places used, and only its own bookings", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Bookings (3)" })).toBeTruthy();
    expect(screen.getByText("3 of 10 places used · 7 of 10 places left")).toBeTruthy();
    expect(screen.getByText(/Lagos time$/)).toBeTruthy();
    expect(screen.queryByText("Someone Else")).toBeNull();
    expect(mocks.listBookings).toHaveBeenCalledWith({ page: 0, size: 100 }, expect.any(AbortSignal));
  });

  it("offers Attended and No-show only on BOOKED bookings", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Bookings (3)" });
    expect(screen.getAllByRole("button", { name: /^Attended: / })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^No-show: / })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Funmi/ })).toBeNull();
  });

  it("before the slot starts: no actions, and says when they will be", async () => {
    const later = slotAt(BANK, 24);
    mocks.listBookings.mockResolvedValue(page([booking("b-1", "Ngozi Adeyemi", later)]));
    renderPage();
    expect(await screen.findByText(/Attendance can be recorded once the slot starts at \d\d:\d\d Lagos time\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Attended: / })).toBeNull();
  });

  it("nobody booked, slot passed from the list: details and 'No bookings yet'", async () => {
    mocks.listBookings.mockResolvedValue(page([]));
    renderPage({ slot: STARTED });
    expect(await screen.findByRole("heading", { name: "No bookings yet" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Lagos Central Blood Bank" })).toBeTruthy();
  });

  it("nobody booked and opened from a link: says it can't show the details", async () => {
    mocks.listBookings.mockResolvedValue(page([ELSEWHERE]));
    renderPage();
    expect(await screen.findByRole("heading", { name: "We can't show this slot's details here" })).toBeTruthy();
  });

  it("error: Try again with the Reference", async () => {
    mocks.listBookings.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Down.", requestId: "ref-500" }));
    renderPage();
    expect(await screen.findByText(/Reference: ref-500/)).toBeTruthy();
    mocks.listBookings.mockResolvedValue(page([NGOZI]));
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("heading", { name: "Bookings (1)" })).toBeTruthy();
  });
});

describe("SlotDetailPage: who gets the attendance actions", () => {
  it("a donor can't record attendance", async () => {
    auth.role = "DONOR";
    auth.organisation = null;
    renderPage();
    expect(await screen.findByText(/Only staff at Lagos Central Blood Bank can see/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^(Attended|No-show): / })).toBeNull();
    expect(screen.queryByText("Ngozi Adeyemi")).toBeNull();
  });

  it("bank staff of another bank get no attendance actions", async () => {
    auth.organisation = OTHER_BANK;
    renderPage();
    expect(await screen.findByText(/Only staff at Lagos Central Blood Bank can see/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^(Attended|No-show): / })).toBeNull();
    expect(screen.queryByText("Ngozi Adeyemi")).toBeNull();
  });

  it("the administrator gets them", async () => {
    auth.role = "ADMIN";
    auth.organisation = null;
    renderPage();
    expect(await screen.findAllByRole("button", { name: /^Attended: / })).toHaveLength(2);
  });
});

describe("SlotDetailPage: record attendance", () => {
  it("records attended after confirming, says so, and reads the bookings again (not optimistic)", async () => {
    let answer: (value: ApiResponse<Booking>) => void = () => {};
    mocks.recordAttendance.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderPage();
    await record(/^Attended: record Ngozi Adeyemi/, "Record attended");

    expect(mocks.recordAttendance).toHaveBeenCalledWith("b-1", { outcome: "ATTENDED" });
    expect(screen.getByRole("dialog", { name: "Record Ngozi Adeyemi as attended?" })).toBeTruthy();

    mocks.listBookings.mockResolvedValue(page([{ ...NGOZI, status: "ATTENDED" }, EMEKA, FUNMI]));
    answer({ data: { ...NGOZI, status: "ATTENDED" }, status: 201, requestId: "ref", headers: new Headers() });

    expect(await screen.findByText("Recorded: Ngozi Adeyemi attended.")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Attended: / })).toHaveLength(1));
    expect(mocks.listBookings).toHaveBeenCalledTimes(2);
  });

  it("records a no-show", async () => {
    mocks.recordAttendance.mockResolvedValue({ data: { ...EMEKA, status: "NO_SHOW" }, status: 201, requestId: "ref", headers: new Headers() });
    renderPage();
    await record(/^No-show: record Emeka Obi/, "Record no-show");
    expect(mocks.recordAttendance).toHaveBeenCalledWith("b-2", { outcome: "NO_SHOW" });
    expect(await screen.findByText("Recorded: Emeka Obi did not attend.")).toBeTruthy();
  });

  it("409 BOOKING_NOT_ACTIVE: its own message with the Reference, and a reload", async () => {
    mocks.recordAttendance.mockRejectedValue(refusal("BOOKING_NOT_ACTIVE"));
    renderPage();
    await record(/^Attended: record Ngozi Adeyemi/, "Record attended");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/already recorded or cancelled/);
    expect(alert.textContent).toMatch(/Reference: ref-BOOKING_NOT_ACTIVE/);
    await waitFor(() => expect(mocks.listBookings).toHaveBeenCalledTimes(2));
  });

  it("409 SLOT_NOT_STARTED: says the slot hasn't started, and reloads", async () => {
    mocks.recordAttendance.mockRejectedValue(refusal("SLOT_NOT_STARTED"));
    renderPage();
    await record(/^Attended: record Ngozi Adeyemi/, "Record attended");

    expect((await screen.findByRole("alert")).textContent).toMatch(/hasn't started yet, so attendance can't be recorded/);
    await waitFor(() => expect(mocks.listBookings).toHaveBeenCalledTimes(2));
  });

  it("422: the service's message with each detail and the Reference; no reload", async () => {
    mocks.recordAttendance.mockRejectedValue(
      refusal("VALIDATION_FAILED", 422, [{ field: "outcome", issue: "Must be ATTENDED or NO_SHOW." }]),
    );
    renderPage();
    await record(/^No-show: record Emeka Obi/, "Record no-show");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/outcome: Must be ATTENDED or NO_SHOW\./);
    expect(alert.textContent).toMatch(/Reference: ref-VALIDATION_FAILED/);
    expect(mocks.listBookings).toHaveBeenCalledTimes(1);
  });

  it("timeout: no retry; reads the bookings and says what this one now shows", async () => {
    mocks.recordAttendance.mockRejectedValue(refusal("TIMEOUT", 0));
    renderPage();
    await screen.findByRole("heading", { name: "Bookings (3)" });
    mocks.listBookings.mockResolvedValue(page([{ ...NGOZI, status: "ATTENDED" }, EMEKA, FUNMI]));
    await record(/^Attended: record Ngozi Adeyemi/, "Record attended");

    expect(await screen.findByText("We couldn't confirm. Ngozi Adeyemi's booking now shows as Attended.")).toBeTruthy();
    expect(mocks.recordAttendance).toHaveBeenCalledTimes(1);
  });
});
