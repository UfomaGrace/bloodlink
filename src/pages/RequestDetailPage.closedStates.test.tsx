// @vitest-environment jsdom
// LAPSED and UNIT_EXPIRED are final (contract RequestState): no Approve or Decline, and the banner
// says the hospital can make a new request.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResponse } from "../api/client";
import type { BloodRequest, Reservation, Role, Session } from "../api/types";
import { ToastProvider } from "../shared/ui/toast";

const HOSPITAL = { id: "hospital-1", name: "Yaba General Hospital", type: "HOSPITAL", area: "Yaba" } as const;
const BANK = { id: "bank-1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" } as const;

const mocks = vi.hoisted(() => ({
  api: { getRequest: vi.fn() },
  role: { current: "BANK_STAFF" as Role },
}));
vi.mock("../api/endpoints", () => ({ api: mocks.api }));
vi.mock("../auth/AuthContext", () => {
  const organisations: Partial<Record<Role, unknown>> = { BANK_STAFF: BANK, HOSPITAL_STAFF: HOSPITAL };
  return {
    useAuth: () => ({
      session: {
        user: { role: mocks.role.current, organisation: organisations[mocks.role.current] ?? null },
      } as unknown as Session,
      role: mocks.role.current,
    }),
  };
});

const { default: RequestDetailPage } = await import("./RequestDetailPage");

function closedRequest(state: "LAPSED" | "UNIT_EXPIRED"): BloodRequest {
  const now = Date.now();
  const status: Reservation["status"] = state === "LAPSED" ? "LAPSED" : "UNIT_EXPIRED";
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
    state,
    declineReason: null,
    createdAt: new Date(now - 7_200_000).toISOString(),
    reservations: [
      {
        id: "res-1",
        unit: { id: "unit-1", reference: "LCB-2026-00042", expiryDate: "2099-12-31" },
        status,
        holdExpiresAt: new Date(now - 60_000).toISOString(),
        createdAt: new Date(now - 3_600_000).toISOString(),
      },
    ],
    history: [],
  };
}

function ok<T>(data: T): ApiResponse<T> {
  return { data, status: 200, requestId: "ref-ok", headers: new Headers() };
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
  mocks.api.getRequest.mockReset();
});

afterEach(() => cleanup());

describe("RequestDetailPage: LAPSED and UNIT_EXPIRED are final", () => {
  it.each([
    ["LAPSED", "BANK_STAFF"],
    ["LAPSED", "ADMIN"],
    ["UNIT_EXPIRED", "BANK_STAFF"],
    ["UNIT_EXPIRED", "ADMIN"],
  ] as const)("%s, seen by %s: no Approve or Decline, and points to a new request", async (state, role) => {
    mocks.role.current = role;
    mocks.api.getRequest.mockResolvedValue(ok(closedRequest(state)));
    renderPage();

    await screen.findByRole("heading", { name: /Request REQ-2026-000123/ });
    expect(screen.getByText(/The hospital can make a new request\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Decline/ })).toBeNull();
    expect(screen.queryByText(/approve it again/i)).toBeNull();
  });
});
