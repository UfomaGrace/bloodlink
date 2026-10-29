// @vitest-environment jsdom
// Reverse issue on RequestDetailPage: not optimistic, the dialog waits for the service.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { BloodRequest, HistoryEntry, Session } from "../api/types";
import { ToastProvider } from "../shared/ui/toast";

const HOSPITAL = { id: "hospital-1", name: "Yaba General Hospital", type: "HOSPITAL", area: "Yaba" } as const;
const BANK = { id: "bank-1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" } as const;

const mocks = vi.hoisted(() => ({ getRequest: vi.fn(), reverseIssue: vi.fn() }));
vi.mock("../api/endpoints", () => ({ api: mocks }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { role: "BANK_STAFF", organisation: BANK } } as unknown as Session,
    role: "BANK_STAFF",
  }),
}));

const { default: RequestDetailPage } = await import("./RequestDetailPage");

const ISSUED_ENTRY: HistoryEntry = {
  at: "2026-10-28T10:00:00Z",
  event: "ISSUED",
  actor: "Adaeze Okafor, Lagos Central Blood Bank",
  note: null,
};

/** Fulfilled with two units: one still in date, one past its expiry date. */
function fulfilledRequest(): BloodRequest {
  const now = Date.now();
  const issued = (id: string, reference: string, expiryDate: string) => ({
    id,
    unit: { id: `unit-${id}`, reference, expiryDate },
    status: "ISSUED" as const,
    holdExpiresAt: new Date(now - 60_000).toISOString(),
    createdAt: new Date(now - 3_600_000).toISOString(),
  });
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
    state: "FULFILLED",
    declineReason: null,
    createdAt: new Date(now - 7_200_000).toISOString(),
    reservations: [issued("res-1", "LCB-2026-00042", "2099-12-31"), issued("res-2", "LCB-2026-00043", "2020-01-01")],
    history: [ISSUED_ENTRY],
  };
}

function ok<T>(data: T): ApiResponse<T> {
  return { data, status: 201, requestId: "ref-ok", headers: new Headers() };
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

/** Opens the dialog, types a reason and confirms. Returns the dialog. */
async function reverseWithReason(user: ReturnType<typeof userEvent.setup>, reason: string) {
  await user.click(await screen.findByRole("button", { name: "Reverse issue" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByRole("textbox", { name: /Reason/ }), reason);
  await user.click(within(dialog).getByRole("button", { name: "Reverse issue" }));
  return dialog;
}

beforeEach(() => {
  mocks.getRequest.mockReset().mockImplementation(() => Promise.resolve(ok(fulfilledRequest())));
  mocks.reverseIssue.mockReset();
});

afterEach(() => cleanup());

describe("RequestDetailPage reverse issue", () => {
  it("says per unit where it goes, then shows the service's copy with both history entries", async () => {
    const reason = "Issued to the wrong request; the units never left the bank.";
    let answer!: (value: ApiResponse<BloodRequest>) => void;
    mocks.reverseIssue.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const reversed = (): ApiResponse<BloodRequest> =>
      ok({
        ...fulfilledRequest(),
        state: "PENDING",
        reservations: fulfilledRequest().reservations.map((r) => ({ ...r, status: "REVERSED" as const })),
        history: [
          ISSUED_ENTRY,
          { at: "2026-10-28T11:00:00Z", event: "ISSUE_REVERSED", actor: ISSUED_ENTRY.actor, note: reason },
        ],
      });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Reverse issue" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("LCB-2026-00042: back in stock as available (based on expiry date).")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "LCB-2026-00043: past its expiry date, so it becomes expired, not available (based on expiry date).",
      ),
    ).toBeTruthy();

    await user.type(within(dialog).getByRole("textbox", { name: /Reason/ }), reason);
    await user.click(within(dialog).getByRole("button", { name: "Reverse issue" }));

    expect(mocks.reverseIssue).toHaveBeenCalledWith("req-1", { reason });
    // In flight: the dialog hides the page, so it announces the progress itself.
    expect(within(dialog).getByRole("status").textContent).toBe("Reversing issue…");
    answer(reversed());

    const status = await screen.findByText(/^Issue reversed\. The request is pending again\./);
    expect(status.closest("[role=status]")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    const history = within(screen.getByRole("region", { name: "History" }));
    expect(history.getByText("Unit issued")).toBeTruthy();
    expect(history.getByText("Issue reversed")).toBeTruthy();
    expect(history.getByText(reason)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reverse issue" })).toBeNull();
  });

  it("keeps the dialog open with the reason as typed and the field error after a 422", async () => {
    mocks.reverseIssue.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Some fields need attention.",
        requestId: "ref-422",
        details: [{ field: "reason", issue: "Say what was recorded in error." }],
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await reverseWithReason(user, "Wrong");

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Say what was recorded in error.")).toBeTruthy();
    expect(within(dialog).getByRole("textbox", { name: /Reason/ })).toHaveProperty("value", "Wrong");
    expect(within(dialog).getByRole("button", { name: "Reverse issue" }).getAttribute("aria-busy")).toBeNull();
    expect(mocks.getRequest).toHaveBeenCalledTimes(1); // a 422 doesn't reload
  });

  it("shows the service's message and reloads after a 409", async () => {
    mocks.reverseIssue.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: "REQUEST_NOT_FULFILLED",
        message: "This request is not fulfilled, so there is no issue to reverse.",
        requestId: "ref-409",
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await reverseWithReason(user, "Issued to the wrong request.");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This request is not fulfilled, so there is no issue to reverse.");
    expect(alert.textContent).toContain("ref-409");
    await waitFor(() => expect(mocks.getRequest).toHaveBeenCalledTimes(2));
  });
});
