// @vitest-environment jsdom
// NewSlotPage: open a slot; 422 on its fields; and after a lost connection, never resubmit but look.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { DonationSlot, DonationSlotCreate, Organisation, Session } from "../api/types";
import { lagosToday } from "../lib/expiry";

const BANK: Organisation = { id: "0d1f6a3e-2b4c-4e5f-8a9b-1c2d3e4f5a6b", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" };

const mocks = vi.hoisted(() => ({ createDonationSlot: vi.fn(), listDonationSlots: vi.fn() }));
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

function ok<T>(data: T, status = 200): ApiResponse<T> {
  return { data, status, requestId: "ref-ok", headers: new Headers() };
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
  mocks.listDonationSlots.mockReset();
});

afterEach(() => cleanup());

describe("NewSlotPage: open a slot", () => {
  it("sends Lagos times as instants (+01:00) and shows the slot the service sent back", async () => {
    mocks.createDonationSlot.mockImplementation((body: DonationSlotCreate) => Promise.resolve(ok(slotFrom(body), 201)));
    renderPage();
    await fillAndSubmit();

    expect(await screen.findByRole("heading", { name: "Slot opened" })).toBeTruthy();
    expect(mocks.createDonationSlot).toHaveBeenCalledTimes(1);
    expect(mocks.createDonationSlot).toHaveBeenCalledWith({ startsAt: STARTS_AT, endsAt: ENDS_AT, capacity: 10 });
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

describe("NewSlotPage: lost connection (no Idempotency-Key, so never resubmit)", () => {
  it("timeout, and the bank's slots show one with the same times: 'It was created'", async () => {
    mocks.createDonationSlot.mockRejectedValue(lost("TIMEOUT"));
    mocks.listDonationSlots.mockResolvedValue(
      ok({
        computedAt: new Date().toISOString(),
        // Written with the +01:00 offset, as the service may send it: matched as instants.
        items: [slotFrom({ startsAt: `${DATE}T09:00:00+01:00`, endsAt: `${DATE}T11:00:00+01:00`, capacity: 10 }, "slot-found")],
      }),
    );
    renderPage();
    await fillAndSubmit();

    expect(await screen.findByRole("heading", { name: "It was created" })).toBeTruthy();
    expect(screen.getByText(/We didn't send it again/)).toBeTruthy();
    expect(mocks.createDonationSlot).toHaveBeenCalledTimes(1);
    expect(mocks.listDonationSlots).toHaveBeenCalledWith({ bankId: BANK.id, from: DATE, to: DATE });
  });

  it("lost connection, and no slot with those times: 'It wasn't created', and they can try again", async () => {
    mocks.createDonationSlot.mockRejectedValueOnce(lost("NETWORK_ERROR"));
    mocks.listDonationSlots.mockResolvedValue(
      ok({
        computedAt: new Date().toISOString(),
        items: [slotFrom({ startsAt: STARTS_AT, endsAt: new Date(`${DATE}T12:00:00+01:00`).toISOString(), capacity: 10 })],
      }),
    );
    renderPage();
    await fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/It wasn't created\./);
    expect(alert.textContent).toMatch(/You can try again/);
    expect(alert.textContent).toMatch(/Reference: ref-lost/);
    expect(mocks.createDonationSlot).toHaveBeenCalledTimes(1);

    // The form is still filled in; trying again is their choice.
    mocks.createDonationSlot.mockImplementation((body: DonationSlotCreate) => Promise.resolve(ok(slotFrom(body), 201)));
    await userEvent.click(screen.getByRole("button", { name: "Open slot" }));
    expect(await screen.findByRole("heading", { name: "Slot opened" })).toBeTruthy();
    expect(mocks.createDonationSlot).toHaveBeenCalledTimes(2);
  });

  it("timeout, and the check fails too: says it can't tell, and links to the bank's slots that day", async () => {
    mocks.createDonationSlot.mockRejectedValue(lost("TIMEOUT"));
    mocks.listDonationSlots.mockRejectedValue(lost("NETWORK_ERROR"));
    renderPage();
    await fillAndSubmit();

    expect((await screen.findByRole("alert")).textContent).toMatch(/We can't tell whether it was created\./);
    const link = screen.getByRole("link", { name: "Check your bank's slots" });
    expect(link.getAttribute("href")).toBe(`/slots?from=${DATE}&to=${DATE}&bankId=${BANK.id}`);
    expect(mocks.createDonationSlot).toHaveBeenCalledTimes(1);
  });
});
