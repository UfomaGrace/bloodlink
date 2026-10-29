// @vitest-environment jsdom
// Release a routine hold for an emergency on RequestDetailPage (ADR-002): not optimistic, the call
// is made on the routine request, and only the addressed bank or the administrator sees it.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { Availability, BloodRequest, BloodRequestPage, Organisation, Reservation, Session } from "../api/types";
import { ToastProvider } from "../shared/ui/toast";

const HOSPITAL = { id: "hospital-1", name: "Ikorodu General Hospital", type: "HOSPITAL", area: "Ikorodu" } as const;
const YABA = { id: "hospital-2", name: "Yaba General Hospital", type: "HOSPITAL", area: "Yaba" } as const;
const LEKKI = { id: "hospital-3", name: "Lekki Community Clinic", type: "HOSPITAL", area: "Lekki" } as const;
const BANK = { id: "bank-1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" } as const;
const OTHER_BANK = { id: "bank-2", name: "Surulere Blood Centre", type: "BLOOD_BANK", area: "Surulere" } as const;

const mocks = vi.hoisted(() => ({
  getRequest: vi.fn(),
  listRequests: vi.fn(),
  searchAvailability: vi.fn(),
  releaseHoldForEmergency: vi.fn(),
  approveRequest: vi.fn(),
}));
const auth = vi.hoisted(() => ({ role: "BANK_STAFF", organisation: null as Organisation | null }));
vi.mock("../api/endpoints", () => ({ api: mocks }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { role: auth.role, organisation: auth.organisation } } as unknown as Session,
    role: auth.role,
  }),
}));

const { default: RequestDetailPage } = await import("./RequestDetailPage");

const HOUR = 3_600_000;

function base(now: number): Omit<BloodRequest, "id" | "reference" | "urgency" | "state" | "reservations"> {
  return {
    hospital: HOSPITAL,
    bank: BANK,
    bloodGroup: "O",
    rhesus: "NEGATIVE",
    component: "RED_CELLS",
    quantity: 1,
    neededBy: new Date(now + 2 * HOUR).toISOString(),
    declineReason: null,
    createdAt: new Date(now - HOUR).toISOString(),
    history: [],
  };
}

function emergencyRequest(): BloodRequest {
  return { ...base(Date.now()), id: "emergency-1", reference: "REQ-2026-000500", urgency: "EMERGENCY", state: "PENDING", reservations: [] };
}

function held(ref: string, holdHours: number): Reservation {
  const now = Date.now();
  return {
    id: `res-${ref}`,
    unit: { id: `unit-${ref}`, reference: ref, expiryDate: "2099-12-31" },
    status: "ACTIVE",
    holdExpiresAt: new Date(now + holdHours * HOUR).toISOString(),
    createdAt: new Date(now - HOUR).toISOString(),
  };
}

function approved(id: string, reference: string, changes: Partial<BloodRequest>): BloodRequest {
  return { ...base(Date.now()), id, reference, urgency: "ROUTINE", state: "APPROVED", reservations: [held(`${id}-unit`, 3)], ...changes };
}

/** Two routine candidates at our bank (Yaba needed later, so listed first) and three that don't qualify. */
function approvedList(): BloodRequest[] {
  const now = Date.now();
  return [
    approved("routine-soon", "REQ-2026-000301", {
      hospital: LEKKI,
      neededBy: new Date(now + 24 * HOUR).toISOString(),
      reservations: [held("LCB-2026-04211", 3)],
    }),
    approved("urgent", "REQ-2026-000303", { urgency: "URGENT", reservations: [held("LCB-2026-04231", 1)] }),
    approved("routine-later", "REQ-2026-000302", {
      hospital: YABA,
      quantity: 2,
      neededBy: new Date(now + 72 * HOUR).toISOString(),
      reservations: [held("LCB-2026-04221", 2), held("LCB-2026-04222", 2)],
    }),
    approved("other-bank", "REQ-2026-000304", { bank: OTHER_BANK, reservations: [held("SBC-2026-00001", 3)] }),
    approved("other-component", "REQ-2026-000305", { component: "PLASMA" }),
  ];
}

function ok<T>(data: T, status = 200): ApiResponse<T> {
  return { data, status, requestId: "ref-ok", headers: new Headers() };
}

function listPage(items: BloodRequest[]): ApiResponse<BloodRequestPage> {
  return ok({ items, page: 0, size: 100, totalItems: items.length });
}

function availability(free: number): ApiResponse<Availability> {
  return ok({
    computedAt: new Date().toISOString(),
    matching: "Exact group, rhesus type and component only. No substitution.",
    items: free > 0 ? [{ bank: BANK, bloodGroup: "O", rhesus: "NEGATIVE", component: "RED_CELLS", availableUnits: free, earliestExpiryDate: "2099-12-31" }] : [],
  });
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/requests/emergency-1"]}>
        <Routes>
          <Route path="/requests/:requestId" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** Opens the dialog, chooses the candidate, types a reason and confirms. Returns the dialog. */
async function releaseWithReason(user: ReturnType<typeof userEvent.setup>, reference: string, reason: string) {
  await user.click(await screen.findByRole("button", { name: "Release a routine hold" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("radio", { name: new RegExp(reference) }));
  await user.type(within(dialog).getByRole("textbox", { name: /Reason/ }), reason);
  await user.click(within(dialog).getByRole("button", { name: "Release hold" }));
  return dialog;
}

const REASON = "Emergency theatre case; Yaba confirmed its courier has not left.";

beforeEach(() => {
  auth.role = "BANK_STAFF";
  auth.organisation = BANK;
  mocks.getRequest.mockReset().mockImplementation(() => Promise.resolve(ok(emergencyRequest())));
  mocks.listRequests.mockReset().mockImplementation(() => Promise.resolve(listPage(approvedList())));
  mocks.searchAvailability.mockReset().mockImplementation(() => Promise.resolve(availability(0)));
  mocks.releaseHoldForEmergency.mockReset();
  mocks.approveRequest.mockReset();
});

afterEach(() => cleanup());

describe("RequestDetailPage release a routine hold", () => {
  it("lists every candidate, makes the user choose, and calls the routine request for this emergency", async () => {
    let answer!: (value: ApiResponse<BloodRequest>) => void;
    mocks.releaseHoldForEmergency.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Emergency holds last 1 hour (set by the service), so collect promptly.")).toBeTruthy();
    const section = within(screen.getByRole("region", { name: "Release a routine hold" }));
    expect(await section.findByText("2 routine requests hold matching units.")).toBeTruthy();
    expect(section.getByText(/^Based on records at \d{2}:\d{2}\.$/)).toBeTruthy();
    expect(mocks.listRequests).toHaveBeenCalledWith({ state: "APPROVED", page: 0, size: 100 }, expect.anything());

    await user.click(section.getByRole("button", { name: "Release a routine hold" }));
    const dialog = await screen.findByRole("dialog");
    const radios = within(dialog).getAllByRole("radio");
    // Only the two routine matches, latest needed-by first, none chosen for the user.
    expect(radios).toHaveLength(2);
    expect(radios[0].closest("label")?.textContent).toMatch(/REQ-2026-000302.*Yaba General Hospital.*Routine, needed by.*Hold ends at.*Held: LCB-2026-04221, LCB-2026-04222/);
    expect(radios[1].closest("label")?.textContent).toMatch(/REQ-2026-000301.*Lekki Community Clinic/);
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);

    await user.type(within(dialog).getByRole("textbox", { name: /Reason/ }), REASON);
    await user.click(within(dialog).getByRole("button", { name: "Release hold" }));
    expect(await within(dialog).findByText("Choose the routine request whose hold you are releasing.")).toBeTruthy();
    expect(mocks.releaseHoldForEmergency).not.toHaveBeenCalled();

    await user.click(radios[0]);
    expect(
      within(dialog).getByText(/^REQ-2026-000302 \(routine, held until .+\) goes back to pending\. Its courier may already be on the way\. Only release it if the emergency can't wait\.$/),
    ).toBeTruthy();
    const units = within(dialog).getByRole("list", { name: "2 units released from their holds" });
    expect(within(units).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["LCB-2026-04221", "LCB-2026-04222"]);
    expect(within(dialog).getByText(/^Our reading of the contract:/)).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Release hold" }));
    expect(mocks.releaseHoldForEmergency).toHaveBeenCalledWith("routine-later", { forRequestId: "emergency-1", reason: REASON });
    // In flight: the dialog hides the page, so it announces the progress itself, and it can't be closed.
    expect(within(dialog).getByRole("status").textContent).toBe("Releasing hold…");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeTruthy();

    answer(
      ok(
        { ...emergencyRequest(), state: "APPROVED", reservations: [held("LCB-2026-04221", 1)] },
        201,
      ),
    );
    const status = await screen.findByText(
      "Hold released. REQ-2026-000500 is approved and holds its units. REQ-2026-000302 is back to pending.",
    );
    expect(status.closest("[role=status]")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    const link = screen.getByRole("link", { name: "REQ-2026-000302" });
    expect(link.getAttribute("href")).toBe("/requests/routine-later");
    expect(link.parentElement?.textContent).toContain("was loaded before the release. Open it and reload to see its new state.");
    // APPROVED now: no release section, no further reads for it.
    expect(screen.queryByRole("region", { name: "Release a routine hold" })).toBeNull();
  });

  it.each([
    ["HOLD_NOT_RELEASABLE", /That hold can't be released for this emergency/],
    ["REQUEST_NOT_PENDING", /This emergency request is no longer pending/],
    ["UNITS_NO_LONGER_AVAILABLE", /Even with that hold released, there aren't enough matching units/],
  ] as const)("shows its own message for 409 %s, then reloads the request and the candidates", async (code, message) => {
    mocks.releaseHoldForEmergency.mockRejectedValueOnce(
      new ApiError({ status: 409, code, message: "Service message.", requestId: "ref-409" }),
    );
    const user = userEvent.setup();
    renderPage();
    await releaseWithReason(user, "REQ-2026-000301", REASON);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(message);
    expect(alert.textContent).toContain("ref-409");
    await waitFor(() => expect(mocks.getRequest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.listRequests).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("link", { name: "REQ-2026-000301" })).toBeNull();
  });

  it("keeps the dialog open with the choice, the reason as typed and the field errors after a 422", async () => {
    mocks.releaseHoldForEmergency.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Some fields need attention.",
        requestId: "ref-422",
        details: [
          { field: "reason", issue: "Say why the emergency can't wait." },
          { field: "forRequestId", issue: "Must be a pending emergency request." },
        ],
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await releaseWithReason(user, "REQ-2026-000301", "Now");

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Say why the emergency can't wait.")).toBeTruthy();
    expect(within(dialog).getByRole("alert").textContent).toContain("Must be a pending emergency request.");
    expect(within(dialog).getByRole("textbox", { name: /Reason/ })).toHaveProperty("value", "Now");
    expect(within(dialog).getByRole("radio", { name: /REQ-2026-000301/ })).toHaveProperty("checked", true);
    expect(mocks.getRequest).toHaveBeenCalledTimes(1); // a 422 doesn't reload
  });

  it("after a timeout doesn't retry: it reloads and says what the request shows now", async () => {
    mocks.releaseHoldForEmergency.mockRejectedValueOnce(
      new ApiError({ status: 0, code: "TIMEOUT", message: "The service took too long.", requestId: "ref-t" }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("button", { name: "Release a routine hold" });
    mocks.getRequest.mockImplementation(() =>
      Promise.resolve(ok({ ...emergencyRequest(), state: "APPROVED", reservations: [held("LCB-2026-04211", 1)] })),
    );
    await releaseWithReason(user, "REQ-2026-000301", REASON);

    expect(await screen.findByText("We couldn't confirm. The request now shows as Approved.")).toBeTruthy();
    expect(mocks.releaseHoldForEmergency).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/failed/i)).toBeNull();
    const link = screen.getByRole("link", { name: "REQ-2026-000301" });
    expect(link.parentElement?.textContent).toContain("may have changed too.");
  });

  it("points to Approve instead when free units already meet the emergency", async () => {
    mocks.searchAvailability.mockImplementation(() => Promise.resolve(availability(3)));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Enough free units: approve it directly")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Release a routine hold" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Go to Approve" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Approve" }));
  });

  it("says when there is no hold to release", async () => {
    mocks.listRequests.mockImplementation(() => Promise.resolve(listPage(approvedList().filter((r) => r.urgency !== "ROUTINE"))));
    renderPage();
    expect(await screen.findByText(/^No routine request at this bank holds matching units right now/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Release a routine hold" })).toBeNull();
  });

  it("says when the scan stopped before reading every approved request", async () => {
    mocks.listRequests.mockImplementation(() =>
      Promise.resolve(ok({ items: approvedList(), page: 0, size: 100, totalItems: 1_000_000 })),
    );
    renderPage();
    expect(await screen.findByText(/Showing the first 25 approved requests; there may be more\./)).toBeTruthy();
  });

  it("for the administrator, offers only candidates at the emergency's bank", async () => {
    auth.role = "ADMIN";
    auth.organisation = null;
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Release a routine hold" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByRole("radio")).toHaveLength(2);
    expect(within(dialog).queryByText(/REQ-2026-000304/)).toBeNull();
  });

  it.each([
    ["hospital staff", "HOSPITAL_STAFF", HOSPITAL],
    ["staff of another bank", "BANK_STAFF", OTHER_BANK],
  ] as const)("gives %s no release action and reads no candidates", async (_, role, organisation) => {
    auth.role = role;
    auth.organisation = organisation;
    renderPage();
    expect(await screen.findByRole("heading", { name: "Request REQ-2026-000500" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Release a routine hold" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Release a routine hold" })).toBeNull();
    expect(mocks.listRequests).not.toHaveBeenCalled();
    expect(mocks.searchAvailability).not.toHaveBeenCalled();
  });
});
