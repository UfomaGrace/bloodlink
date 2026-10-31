// @vitest-environment jsdom
// NewSlotPage: open a slot with an Idempotency-Key; 422 on its fields; a 200 replay; key reuse;
// and after a lost connection, one resend with the same key.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { DonationSlot, DonationSlotCreate, Organisation, Session } from "../api/types";
import { lagosToday } from "../lib/expiry";

const BANK: Organisation = { id: "0d1f6a3e-2b4c-4e5f-8a9b-1c2d3e4f5a6b", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" };

const mocks = vi.hoisted(() => ({ createDonationSlot: vi.fn() }));
vi.mock("../api/endpoints", () => ({ api: mocks }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { role: "BANK_STAFF", organisation: BANK } } as unknown as Session,
    role: "BANK_STAFF",
  }),
}));

const { default: NewSlotPage } = await import("./NewSlotPage");

// Two days ahead, so "in the future" holds whatever time the tests run.
const DATE = lagosToday(Date.now() + 2 * 86_400_000);
const STARTS_AT = new Date(`${DATE}T09:00:00+01:00`).toISOString();
const ENDS_AT = new Date(`${DATE}T11:00:00+01:00`).toISOString();

function slotFrom(body: DonationSlotCreate, id = "slot-new"): DonationSlot {
  return { id, bank: BANK, ...body, booked: 0, placesLeft: body.capacity };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function ok<T>(data: T, status = 200, headers: Record<string, string> = {}): ApiResponse<T> {
  return { data, status, requestId: "ref-ok", headers: new Headers(headers) };
}

const opened = (body: DonationSlotCreate) => Promise.resolve(ok(slotFrom(body), 201));

/** The Idempotency-Key sent on each call so far. */
function keysSent(): string[] {
  return mocks.createDonationSlot.mock.calls.map((call) => call[1] as string);
}

function lost(code: "TIMEOUT" | "NETWORK_ERROR" = "TIMEOUT"): ApiError {
  return new ApiError({ status: 0, code, message: "The service took too long to answer.", requestId: "ref-lost" });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <NewSlotPage />
    </MemoryRouter>,
  );
}

async function fillAndSubmit(values: { date?: string; start?: string; end?: string; capacity?: string } = {}) {
  fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: values.date ?? DATE } });
  fireEvent.change(screen.getByLabelText(/^Start time/), { target: { value: values.start ?? "09:00" } });
  fireEvent.change(screen.getByLabelText(/^End time/), { target: { value: values.end ?? "11:00" } });
  fireEvent.change(screen.getByLabelText(/^Places/), { target: { value: values.capacity ?? "10" } });
  await userEvent.click(screen.getByRole("button", { name: "Open slot" }));
}

beforeEach(() => {
  mocks.createDonationSlot.mockReset();
});

afterEach(() => cleanup());

describe("NewSlotPage: open a slot", () => {
  it("sends Lagos times as instants (+01:00) with an Idempotency-Key, and shows the slot the service sent back", async () => {
    mocks.createDonationSlot.mockImplementation(opened);
    renderPage();
    await fillAndSubmit();

    expect(await screen.findByRole("heading", { name: "Slot opened" })).toBeTruthy();
    expect(mocks.createDonationSlot).toHaveBeenCalledTimes(1);
    expect(mocks.createDonationSlot).toHaveBeenCalledWith(
      { startsAt: STARTS_AT, endsAt: ENDS_AT, capacity: 10 },
      expect.stringMatching(UUID),
    );
    expect(screen.getByText("Donors can now book it.")).toBeTruthy();
    expect(screen.getByText("09:00–11:00 Lagos time")).toBeTruthy();
    expect(screen.getByText("10 of 10 places left")).toBeTruthy();
    expect(document.activeElement?.id).toBe("slot-created-heading");
  });

  it("checks the contract's rules before sending: end after start, at most 8 hours, 1 to 50 places", async () => {
    renderPage();
    await fillAndSubmit({ end: "08:00", capacity: "0" });
    expect(await screen.findByText("The end time must be after the start time.")).toBeTruthy();
    expect(screen.getByText("A slot needs at least 1 place.")).toBeTruthy();

    await fillAndSubmit({ end: "17:30", capacity: "51" });
    expect(await screen.findByText("A slot can be at most 8 hours long.")).toBeTruthy();
    expect(screen.getByText("A slot can have at most 50 places.")).toBeTruthy();
    expect(mocks.createDonationSlot).not.toHaveBeenCalled();
  });

  it("422: puts startsAt, endsAt and capacity details on their fields, the rest in the alert", async () => {
    mocks.createDonationSlot.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Some fields need attention.",
        requestId: "ref-422",
        details: [
          { field: "startsAt", issue: "Must be in the future." },
          { field: "capacity", issue: "Must be at most 50." },
          { field: "bankId", issue: "Bank is closed that day." },
        ],
      }),
    );
    renderPage();
    await fillAndSubmit();

    expect(await screen.findByText("Must be in the future.")).toBeTruthy();
    expect(screen.getByLabelText(/^Start time/).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText(/^Places/).getAttribute("aria-invalid")).toBe("true");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/bankId: Bank is closed that day\./);
    expect(alert.textContent).toMatch(/Reference: ref-422/);
  });

  it("ignores a second submit while the first is in flight", async () => {
    let answer: (value: ApiResponse<DonationSlot>) => void = () => {};
    mocks.createDonationSlot.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderPage();
    await fillAndSubmit();
    await waitFor(() => expect(mocks.createDonationSlot).toHaveBeenCalledTimes(1));

    const button = screen.getByRole("button", { name: /Opening slot/ });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(button);
    fireEvent.submit(button.closest("form") as HTMLFormElement);
    expect(mocks.createDonationSlot).toHaveBeenCalledTimes(1);

    answer(ok(slotFrom({ startsAt: STARTS_AT, endsAt: ENDS_AT, capacity: 10 }), 201));
    expect(await screen.findByRole("heading", { name: "Slot opened" })).toBeTruthy();
  });
});

describe("NewSlotPage: Idempotency-Key", () => {
  it("200 replay (Idempotent-Replayed: true): shows the slot as opened, and says no second one was", async () => {
    mocks.createDonationSlot.mockImplementation((body: DonationSlotCreate) =>
      Promise.resolve(ok(slotFrom(body), 200, { "Idempotent-Replayed": "true" })),
    );
    renderPage();
    await fillAndSubmit();

    expect(await screen.findByRole("heading", { name: "Slot opened" })).toBeTruthy();
    expect(screen.getByText(/This slot had already been opened\. No second slot was opened\./)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("422 IDEMPOTENCY_KEY_REUSED: shows the service's message and Reference; the next submit has a new key", async () => {
    mocks.createDonationSlot.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: "IDEMPOTENCY_KEY_REUSED",
        message: "This key was already used with different details. Nothing was opened.",
        requestId: "ref-key",
      }),
    );
    renderPage();
    await fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/This key was already used with different details\. Nothing was opened\./);
    expect(alert.textContent).toMatch(/Reference: ref-key/);

    mocks.createDonationSlot.mockImplementation(opened);
    await userEvent.click(screen.getByRole("button", { name: "Open slot" }));
    expect(await screen.findByRole("heading", { name: "Slot opened" })).toBeTruthy();
    const [first, second] = keysSent();
    expect(second).toMatch(UUID);
    expect(second).not.toBe(first);
  });

  it("a changed form gets a new key; 'Open another slot' starts a new submission too", async () => {
    mocks.createDonationSlot.mockRejectedValueOnce(
      new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Something went wrong.", requestId: "ref-500" }),
    );
    mocks.createDonationSlot.mockImplementation(opened);
    renderPage();
    await fillAndSubmit();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Reference: ref-500/);

    await fillAndSubmit({ capacity: "12" }); // edited: a different body
    expect(await screen.findByRole("heading", { name: "Slot opened" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Open another slot" }));
    await fillAndSubmit({ capacity: "12" }); // same body as the last success, but a new submission
    await waitFor(() => expect(mocks.createDonationSlot).toHaveBeenCalledTimes(3));

    const keys = keysSent();
    expect(new Set(keys).size).toBe(3);
  });

  it("a 500 keeps the key: sending the same form again is a replay", async () => {
    mocks.createDonationSlot.mockRejectedValueOnce(
      new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Something went wrong.", requestId: "ref-500" }),
    );
    mocks.createDonationSlot.mockImplementation(opened);
    renderPage();
    await fillAndSubmit();
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Open slot" }));
    expect(await screen.findByRole("heading", { name: "Slot opened" })).toBeTruthy();
    const [first, second] = keysSent();
    expect(second).toBe(first);
  });
});

describe("NewSlotPage: lost connection (resend once, same key)", () => {
  it("timeout: sends again once with the same key, and shows the slot", async () => {
    mocks.createDonationSlot.mockRejectedValueOnce(lost("TIMEOUT"));
    mocks.createDonationSlot.mockImplementation((body: DonationSlotCreate) =>
      Promise.resolve(ok(slotFrom(body), 200, { "Idempotent-Replayed": "true" })),
    );
    renderPage();
    await fillAndSubmit();

    expect(await screen.findByRole("heading", { name: "Slot opened" })).toBeTruthy();
    expect(screen.getByText(/No second slot was opened/)).toBeTruthy();
    expect(mocks.createDonationSlot).toHaveBeenCalledTimes(2);
    const [first, second] = keysSent();
    expect(first).toMatch(UUID);
    expect(second).toBe(first);
    expect(mocks.createDonationSlot.mock.calls[1][0]).toEqual(mocks.createDonationSlot.mock.calls[0][0]);
  });

  it("announces the resend while it is in flight", async () => {
    let answer: (value: ApiResponse<DonationSlot>) => void = () => {};
    mocks.createDonationSlot.mockRejectedValueOnce(lost("NETWORK_ERROR"));
    mocks.createDonationSlot.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    renderPage();
    await fillAndSubmit();

    expect(await screen.findByText("We lost the connection. Sending it again with the same details…")).toBeTruthy();
    answer(ok(slotFrom({ startsAt: STARTS_AT, endsAt: ENDS_AT, capacity: 10 }), 201));
    expect(await screen.findByRole("heading", { name: "Slot opened" })).toBeTruthy();
  });

  it("lost twice: says trying again is safe, keeps the form and the key", async () => {
    mocks.createDonationSlot.mockRejectedValueOnce(lost("TIMEOUT"));
    mocks.createDonationSlot.mockRejectedValueOnce(lost("NETWORK_ERROR"));
    renderPage();
    await fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/We couldn't confirm the slot was opened\./);
    expect(alert.textContent).toMatch(/It's safe: it won't open a second slot\./);
    expect(alert.textContent).toMatch(/Reference: ref-lost/);
    expect(mocks.createDonationSlot).toHaveBeenCalledTimes(2); // one resend, no more

    mocks.createDonationSlot.mockImplementation(opened);
    await userEvent.click(screen.getByRole("button", { name: "Open slot" }));
    expect(await screen.findByRole("heading", { name: "Slot opened" })).toBeTruthy();
    expect(new Set(keysSent()).size).toBe(1);
  });

  it("a refusal on the resend is shown like any other", async () => {
    mocks.createDonationSlot.mockRejectedValueOnce(lost("TIMEOUT"));
    mocks.createDonationSlot.mockRejectedValueOnce(
      new ApiError({ status: 403, code: "FORBIDDEN", message: "Only bank staff can open slots.", requestId: "ref-403" }),
    );
    renderPage();
    await fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Only bank staff can open slots\./);
    expect(alert.textContent).toMatch(/Reference: ref-403/);
    expect(mocks.createDonationSlot).toHaveBeenCalledTimes(2);
  });
});
