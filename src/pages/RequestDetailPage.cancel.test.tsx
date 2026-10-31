// @vitest-environment jsdom
// The optimistic cancel on RequestDetailPage: CANCELLED at once, put back when the service refuses.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { BloodRequest, Session } from "../api/types";
import { REQUEST_CLOSED_MESSAGE } from "../lib/optimisticCancel";
import { ToastProvider } from "../shared/ui/toast";

const HOSPITAL = { id: "hospital-1", name: "Yaba General Hospital", type: "HOSPITAL", area: "Yaba" } as const;
const BANK = { id: "bank-1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" } as const;

const mocks = vi.hoisted(() => ({ getRequest: vi.fn(), cancelRequest: vi.fn() }));
vi.mock("../api/endpoints", () => ({ api: mocks }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { role: "HOSPITAL_STAFF", organisation: HOSPITAL } } as unknown as Session,
    role: "HOSPITAL_STAFF",
  }),
}));

const { default: RequestDetailPage } = await import("./RequestDetailPage");

function approvedRequest(): BloodRequest {
  const now = Date.now();
  return {
    id: "req-1",
    reference: "REQ-2026-000123",
    hospital: HOSPITAL,
    bank: BANK,
    bloodGroup: "O",
    rhesus: "NEGATIVE",
    component: "RED_CELLS",
    quantity: 1,
    urgency: "ROUTINE",
    neededBy: new Date(now + 86_400_000).toISOString(),
    state: "APPROVED",
    declineReason: null,
    createdAt: new Date(now - 3_600_000).toISOString(),
    reservations: [
      {
        id: "res-1",
        unit: { id: "unit-1", reference: "LCB-2026-00042", expiryDate: "2099-12-31" },
        status: "ACTIVE",
        holdExpiresAt: new Date(now + 3_600_000).toISOString(),
        createdAt: new Date(now - 60_000).toISOString(),
      },
    ],
    history: [],
  };
}

function ok<T>(data: T): ApiResponse<T> {
  return { data, status: 200, requestId: "ref-ok", headers: new Headers() };
}

/** A promise the test settles by hand, so we can look at the screen while the call is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/requests/req-1"]}>
        <Routes>
          <Route path="/requests/:requestId" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** Opens the dialog, types a reason and confirms. Returns the in-flight cancel call. */
async function cancelWithReason(user: ReturnType<typeof userEvent.setup>, reason: string) {
  const call = deferred<ApiResponse<BloodRequest>>();
  mocks.cancelRequest.mockReturnValueOnce(call.promise);
  await user.click(await screen.findByRole("button", { name: "Cancel request" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByRole("textbox", { name: /Reason/ }), reason);
  await user.click(within(dialog).getByRole("button", { name: "Cancel request" }));
  return call;
}

beforeEach(() => {
  mocks.getRequest.mockReset().mockImplementation(() => Promise.resolve(ok(approvedRequest())));
  mocks.cancelRequest.mockReset();
});

afterEach(() => cleanup());

describe("RequestDetailPage optimistic cancel", () => {
  it("shows CANCELLED at once, then puts the request back, reports the refusal and reloads after a 409", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: /Request REQ-2026-000123/ });
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);

    const call = await cancelWithReason(user, "Patient transferred to another hospital.");

    // Optimistic: closed dialog, CANCELLED on screen, the call announced as in flight.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Request cancelled" })).toBeTruthy();
    expect(screen.getByText("Cancelling request…")).toBeTruthy();
    expect(mocks.cancelRequest).toHaveBeenCalledWith("req-1", { reason: "Patient transferred to another hospital." });

    call.reject(
      new ApiError({
        status: 409,
        code: "REQUEST_CLOSED",
        message: "This request is already closed.",
        requestId: "ref-409",
      }),
    );

    // Rolled back: the request reads as before, with our REQUEST_CLOSED message in the page and a toast.
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Request cancelled" })).toBeNull());
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    const pageAlert = screen.getAllByRole("alert").find((el) => el.textContent?.includes("Reference: ref-409"));
    expect(pageAlert?.textContent).toContain(REQUEST_CLOSED_MESSAGE);
    expect(await screen.findByText("Cancellation undone")).toBeTruthy();
    expect(screen.getByText(`${REQUEST_CLOSED_MESSAGE} Reference: ref-409`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    await waitFor(() => expect(mocks.getRequest).toHaveBeenCalledTimes(2));
  });

  it("puts the request back and reopens the dialog with the reason and the field error after a 422", async () => {
    const user = userEvent.setup();
    renderPage();
    const call = await cancelWithReason(user, "Not needed");

    call.reject(
      new ApiError({
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Some fields need attention.",
        requestId: "ref-422",
        details: [{ field: "reason", issue: "Say why the units are no longer needed." }],
      }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: /Reason/ })).toHaveProperty("value", "Not needed");
    expect(within(dialog).getByText("Say why the units are no longer needed.")).toBeTruthy();
    // The open dialog hides the page from role queries, so look past that.
    expect(screen.queryByRole("heading", { name: "Request cancelled", hidden: true })).toBeNull();
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(mocks.getRequest).toHaveBeenCalledTimes(1); // a 422 doesn't reload
  });

  it("keeps the service's copy once the cancel is confirmed", async () => {
    const user = userEvent.setup();
    renderPage();
    const call = await cancelWithReason(user, "Patient discharged.");
    call.resolve(ok({ ...approvedRequest(), state: "CANCELLED", reservations: [] }));

    const status = await screen.findByText(
      "Request cancelled. Any units held for it are back in stock, or are marked expired if past their expiry date.",
    );
    expect(status.closest("[role=status]")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Request cancelled" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel request" })).toBeNull();
  });
});
