// @vitest-environment jsdom
// Approve and Decline on RequestDetailPage: the Approve dialog says how long the hold lasts, and
// after a lost connection neither is sent again: the request is read, then we say what it shows.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { BloodRequest, Session, Urgency } from "../api/types";
import { ToastProvider } from "../shared/ui/toast";

const HOSPITAL = { id: "hospital-1", name: "Yaba General Hospital", type: "HOSPITAL", area: "Yaba" } as const;
const BANK = { id: "bank-1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" } as const;

const mocks = vi.hoisted(() => ({ getRequest: vi.fn(), approveRequest: vi.fn(), declineRequest: vi.fn() }));
vi.mock("../api/endpoints", () => ({ api: mocks }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { role: "BANK_STAFF", organisation: BANK } } as unknown as Session,
    role: "BANK_STAFF",
  }),
}));

const { default: RequestDetailPage } = await import("./RequestDetailPage");

function request(changes: Partial<BloodRequest> = {}): BloodRequest {
  const now = Date.now();
  return {
    id: "req-1",
    reference: "REQ-2026-000123",
    hospital: HOSPITAL,
    bank: BANK,
    bloodGroup: "O",
    rhesus: "NEGATIVE",
    component: "RED_CELLS",
    quantity: 2,
    urgency: "ROUTINE",
    neededBy: new Date(now + 86_400_000).toISOString(),
    state: "PENDING",
    declineReason: null,
    createdAt: new Date(now - 3_600_000).toISOString(),
    reservations: [],
    history: [],
    ...changes,
  };
}

function ok<T>(data: T): ApiResponse<T> {
  return { data, status: 200, requestId: "ref-ok", headers: new Headers() };
}

function lost(code: "TIMEOUT" | "NETWORK_ERROR"): ApiError {
  return new ApiError({ status: 0, code, message: "The service took too long to answer.", requestId: "ref-lost" });
}

function renderPage() {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/requests/req-1"]}>
        <Routes>
          <Route path="/requests/:requestId" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  // A fresh object per read, as a real fetch gives: the page tells a reload's answer from the old copy by identity.
  mocks.getRequest.mockReset().mockImplementation(() => Promise.resolve(ok(request())));
  mocks.approveRequest.mockReset();
  mocks.declineRequest.mockReset();
});

afterEach(() => cleanup());

describe("RequestDetailPage: the Approve dialog says how long the hold lasts", () => {
  it.each([
    ["ROUTINE", "4 hours (routine hold"],
    ["URGENT", "2 hours (urgent hold"],
  ] as [Urgency, string][])("%s: held for %s…)", async (urgency, length) => {
    mocks.getRequest.mockResolvedValue(ok(request({ urgency })));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Approve" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(new RegExp(`They will be held for ${length.replace(/[()]/g, "\\$&")}`))).toBeTruthy();
    expect(within(dialog).getByText(/If they aren't issued by then, the hold lapses\./)).toBeTruthy();
  });
});

describe("RequestDetailPage: lost connection on Approve or Decline (read, never resend)", () => {
  it("approve times out: reads the request, says it now shows as Approved, and doesn't approve again", async () => {
    mocks.approveRequest.mockRejectedValue(lost("TIMEOUT"));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    mocks.getRequest.mockResolvedValue(ok(request({ state: "APPROVED" })));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve and reserve" }));

    expect(await screen.findByText("We couldn't confirm. The request now shows as Approved.")).toBeTruthy();
    expect(mocks.getRequest).toHaveBeenCalledTimes(2);
    expect(mocks.approveRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/took too long/)).toBeNull(); // no "failed" message
  });

  it("decline loses the connection: reads the request, says it still shows as Pending, and doesn't decline again", async () => {
    mocks.declineRequest.mockRejectedValue(lost("NETWORK_ERROR"));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Decline" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /Reason/ }), "No matching units until Friday.");
    await user.click(within(dialog).getByRole("button", { name: "Decline request" }));

    expect(await screen.findByText("We couldn't confirm. The request now shows as Pending.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.getRequest).toHaveBeenCalledTimes(2);
    expect(mocks.declineRequest).toHaveBeenCalledTimes(1);
  });

  it("the read fails too: says it couldn't check, so they look before trying again", async () => {
    mocks.approveRequest.mockRejectedValue(lost("TIMEOUT"));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    mocks.getRequest.mockRejectedValue(lost("NETWORK_ERROR"));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve and reserve" }));

    expect(await screen.findByText(/We couldn't confirm whether that went through, or check the latest state\./)).toBeTruthy();
    expect(mocks.approveRequest).toHaveBeenCalledTimes(1);
  });
});
