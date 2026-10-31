// @vitest-environment jsdom
// The optimistic cancel as a row action on RequestsPage: CANCELLED at once, put back on refusal.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { BloodRequest, BloodRequestPage, Session } from "../api/types";
import { REQUEST_CLOSED_MESSAGE } from "../lib/optimisticCancel";
import { ToastProvider } from "../shared/ui/toast";

const HOSPITAL = { id: "hospital-1", name: "Yaba General Hospital", type: "HOSPITAL", area: "Yaba" } as const;
const OTHER_HOSPITAL = { id: "hospital-2", name: "Ikeja Clinic", type: "HOSPITAL", area: "Ikeja" } as const;
const BANK = { id: "bank-1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" } as const;

const mocks = vi.hoisted(() => ({ listRequests: vi.fn(), cancelRequest: vi.fn() }));
vi.mock("../api/endpoints", () => ({ api: mocks }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { role: "HOSPITAL_STAFF", organisation: HOSPITAL } } as unknown as Session,
    role: "HOSPITAL_STAFF",
  }),
}));

const { default: RequestsPage } = await import("./RequestsPage");

function pending(id: string, reference: string, hospital: BloodRequest["hospital"] = HOSPITAL): BloodRequest {
  const now = Date.now();
  return {
    id,
    reference,
    hospital,
    bank: BANK,
    bloodGroup: "O",
    rhesus: "NEGATIVE",
    component: "RED_CELLS",
    quantity: 1,
    urgency: "ROUTINE",
    neededBy: new Date(now + 86_400_000).toISOString(),
    state: "PENDING",
    declineReason: null,
    createdAt: new Date(now - 3_600_000).toISOString(),
    reservations: [],
    history: [],
  };
}

function page(items: BloodRequest[]): ApiResponse<BloodRequestPage> {
  return {
    data: { items, page: 0, size: 20, totalItems: items.length } as BloodRequestPage,
    status: 200,
    requestId: "ref-ok",
    headers: new Headers(),
  };
}

beforeEach(() => {
  mocks.listRequests
    .mockReset()
    .mockImplementation(() => Promise.resolve(page([pending("req-1", "REQ-1"), pending("req-2", "REQ-2", OTHER_HOSPITAL)])));
  mocks.cancelRequest.mockReset();
});

afterEach(() => cleanup());

/** The table row for a reference (the table is the md+ layout; jsdom renders both). */
function tableRow(reference: string): HTMLElement {
  const link = within(screen.getByRole("table")).getByRole("link", { name: reference });
  const row = link.closest("tr");
  if (!row) throw new Error(`No row for ${reference}`);
  return row;
}

describe("RequestsPage optimistic cancel", () => {
  it("offers Cancel only on the hospital's own open requests", async () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <RequestsPage />
        </MemoryRouter>
      </ToastProvider>,
    );
    await screen.findByRole("table");
    expect(within(tableRow("REQ-1")).getByRole("button", { name: "Cancel request REQ-1" })).toBeTruthy();
    expect(within(tableRow("REQ-2")).queryByRole("button")).toBeNull();
  });

  it("shows the row CANCELLED at once, then puts it back and reports a 409", async () => {
    const user = userEvent.setup();
    let refuse!: (reason: unknown) => void;
    mocks.cancelRequest.mockReturnValueOnce(new Promise((_, reject) => (refuse = reject)));
    render(
      <ToastProvider>
        <MemoryRouter>
          <RequestsPage />
        </MemoryRouter>
      </ToastProvider>,
    );
    await screen.findByRole("table");

    await user.click(within(tableRow("REQ-1")).getByRole("button", { name: "Cancel request REQ-1" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /Reason/ }), "Patient discharged.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel request" }));

    expect(within(tableRow("REQ-1")).getByText("Cancelled")).toBeTruthy();
    expect(within(tableRow("REQ-2")).getByText("Pending")).toBeTruthy();
    expect(screen.getByText("Cancelling request REQ-1…")).toBeTruthy();

    refuse(
      new ApiError({ status: 409, code: "REQUEST_CLOSED", message: "This request is already closed.", requestId: "ref-409" }),
    );

    await waitFor(() => expect(within(tableRow("REQ-1")).getByText("Pending")).toBeTruthy());
    expect(within(tableRow("REQ-1")).queryByText("Cancelled")).toBeNull();
    const pageAlert = screen.getAllByRole("alert").find((el) => el.textContent?.includes("Reference: ref-409"));
    expect(pageAlert?.textContent).toContain(REQUEST_CLOSED_MESSAGE);
    expect(await screen.findByText("Cancellation of REQ-1 undone")).toBeTruthy();
    expect(screen.getByText(`${REQUEST_CLOSED_MESSAGE} Reference: ref-409`)).toBeTruthy();
    await waitFor(() => expect(mocks.listRequests).toHaveBeenCalledTimes(2)); // quiet reload after 409
    expect(screen.getByRole("table")).toBeTruthy(); // rows stayed up
  });
});
