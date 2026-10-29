// @vitest-environment jsdom
// Reserved unit references on RequestDetailPage: links for bank staff and the administrator, plain text for hospitals.
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResponse } from "../api/client";
import type { BloodRequest, Role, Session } from "../api/types";
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

/** Fulfilled, with one issued unit. */
function fulfilledRequest(): BloodRequest {
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
    state: "FULFILLED",
    declineReason: null,
    createdAt: new Date(now - 7_200_000).toISOString(),
    reservations: [
      {
        id: "res-1",
        unit: { id: "unit-1", reference: "LCB-2026-00042", expiryDate: "2099-12-31" },
        status: "ISSUED",
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

async function reservedUnits() {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/requests/req-1"]}>
        <Routes>
          <Route path="/requests/:requestId" element={<RequestDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
  return within(await screen.findByRole("region", { name: "Reserved units" }));
}

beforeEach(() => {
  mocks.role.current = "BANK_STAFF";
  mocks.api.getRequest.mockReset().mockImplementation(() => Promise.resolve(ok(fulfilledRequest())));
});

afterEach(() => cleanup());

describe("RequestDetailPage reserved unit links", () => {
  it.each(["BANK_STAFF", "ADMIN"] as const)("%s: each unit reference links to its unit page", async (role) => {
    mocks.role.current = role;
    const units = await reservedUnits();
    expect(units.getByRole("link", { name: "LCB-2026-00042" }).getAttribute("href")).toBe("/units/unit-1");
  });

  it("hospital staff: unit references are plain text, with no links", async () => {
    mocks.role.current = "HOSPITAL_STAFF";
    const units = await reservedUnits();
    expect(units.getByText("LCB-2026-00042")).toBeTruthy();
    expect(units.queryAllByRole("link")).toHaveLength(0);
  });
});
