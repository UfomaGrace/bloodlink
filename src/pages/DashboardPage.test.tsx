// @vitest-environment jsdom
// DashboardPage: who gets the bank filter, the computed-at line, first use, and errors.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { Dashboard, Organisation, Role, Session } from "../api/types";
import { simulateDashboard } from "../lib/mockSimulation";

const BANK: Organisation = {
  id: "0d1f6a3e-2b4c-4e5f-8a9b-1c2d3e4f5a6b",
  name: "Lagos Central Blood Bank",
  type: "BLOOD_BANK",
  area: "Ikeja",
};
const OTHER_BANK: Organisation = {
  id: "1e2a7b4f-3c5d-4f6a-9b0c-2d3e4f5a6b7c",
  name: "Surulere Blood Centre",
  type: "BLOOD_BANK",
  area: "Surulere",
};

const mocks = vi.hoisted(() => ({
  api: { getDashboard: vi.fn(), listOrganisations: vi.fn() },
  role: { current: "BANK_STAFF" as Role },
}));
vi.mock("../api/endpoints", () => ({ api: mocks.api }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    session: {
      user: { role: mocks.role.current, organisation: mocks.role.current === "BANK_STAFF" ? BANK : null },
    } as unknown as Session,
    role: mocks.role.current,
  }),
}));

const { default: DashboardPage } = await import("./DashboardPage");

function ok<T>(data: T): ApiResponse<T> {
  return { data, status: 200, requestId: "ref-ok", headers: new Headers() };
}

function dashboard(bank: Organisation | null, at = Date.now()): Dashboard {
  return simulateDashboard("SAMPLE", at, bank);
}

function renderAt(path = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DashboardPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.role.current = "BANK_STAFF";
  mocks.api.getDashboard.mockReset().mockImplementation((query: { bankId?: string }) => {
    const bank = mocks.role.current === "BANK_STAFF" ? BANK : ([BANK, OTHER_BANK].find((b) => b.id === query.bankId) ?? null);
    return Promise.resolve(ok(dashboard(bank)));
  });
  mocks.api.listOrganisations.mockReset().mockResolvedValue(ok({ items: [BANK, OTHER_BANK] }));
});

afterEach(() => cleanup());

describe("DashboardPage", () => {
  it("bank staff: no bank filter, no bankId sent, their own bank named", async () => {
    renderAt();
    expect(await screen.findByText("Lagos Central Blood Bank")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Bank" })).toBeNull();
    expect(mocks.api.listOrganisations).not.toHaveBeenCalled();
    expect(mocks.api.getDashboard).toHaveBeenCalledTimes(1);
    expect(mocks.api.getDashboard.mock.calls[0][0]).toEqual({ bankId: undefined });
  });

  it("admin: all banks by default, and a bank filter that passes bankId", async () => {
    mocks.role.current = "ADMIN";
    const user = userEvent.setup();
    renderAt();
    expect(await screen.findByText("All banks", { selector: "strong" })).toBeTruthy();
    const filter = await screen.findByRole("combobox", { name: "Bank" });
    await waitFor(() => expect((filter as HTMLSelectElement).disabled).toBe(false));
    expect(mocks.api.getDashboard).toHaveBeenLastCalledWith({ bankId: undefined }, expect.anything());

    await user.selectOptions(filter, "Surulere Blood Centre");
    expect(await screen.findByText("Surulere Blood Centre", { selector: "strong" })).toBeTruthy();
    expect(mocks.api.getDashboard).toHaveBeenLastCalledWith({ bankId: OTHER_BANK.id }, expect.anything());
    expect(screen.getAllByText("The requests list shows every bank.").length).toBeGreaterThan(0);
  });

  it("admin: ?bankId from the URL picks that bank", async () => {
    mocks.role.current = "ADMIN";
    renderAt(`/dashboard?bankId=${BANK.id}`);
    expect(await screen.findByText("Lagos Central Blood Bank", { selector: "strong" })).toBeTruthy();
    expect(mocks.api.getDashboard).toHaveBeenCalledWith({ bankId: BANK.id }, expect.anything());
  });

  it("labels the figures with computedAt, and links the pending count", async () => {
    const at = Date.now() - 3 * 60_000;
    mocks.api.getDashboard.mockResolvedValue(ok(dashboard(BANK, at)));
    renderAt();
    const line = await screen.findByText(/Figures computed at/);
    expect(line.textContent).toMatch(/^Figures computed at \d{2}:\d{2} \(3 min ago\)$/);
    expect(line.querySelector("time")?.getAttribute("datetime")).toBe(new Date(at).toISOString());
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "4 pending requests: view them" }).getAttribute("href")).toBe(
      "/requests?state=PENDING",
    );
    expect(screen.getByText(/All components combined: red cells/)).toBeTruthy();
  });

  it("renders Prism's made-up answer as sent (no Dashboard example in the contract)", async () => {
    const org = { id: "497f6eca-6276-4993-bfeb-53cbbbba6f08", name: "string", type: "BLOOD_BANK", area: "string" } as const;
    const prism: Dashboard = {
      computedAt: "2019-08-24T14:15:22Z",
      bank: org,
      lowStockThreshold: -2147483648,
      holdsEndingWithinMinutes: -2147483648,
      expiringWithinDays: -2147483648,
      availableByGroup: [{ bloodGroup: "A", rhesus: "POSITIVE", availableUnits: 0 }],
      lowGroups: [{ bloodGroup: "A", rhesus: "POSITIVE", availableUnits: 0 }],
      openRequests: { pending: -2147483648, approved: -2147483648 },
      holdsEndingSoon: [
        {
          requestId: "d385ab22-0f51-4b97-9ecd-b8ff3fd4fcb6",
          requestReference: "string",
          hospital: org,
          unit: { id: org.id, reference: "string", expiryDate: "2019-08-24" },
          holdExpiresAt: "2019-08-24T14:15:22Z",
        },
      ],
      unitsExpiringSoon: [{ ...dashboard(BANK).unitsExpiringSoon[0], reference: "LCB-2026-00042" }],
      recentActivity: [{ at: "2019-08-24T14:15:22Z", event: "string", subject: "UNIT", reference: "string", actor: "string", note: "string" }],
    };
    mocks.api.getDashboard.mockResolvedValue(ok(prism));
    renderAt();
    expect(await screen.findByRole("heading", { name: "Available by blood group" })).toBeTruthy();
    expect(screen.getByText("Lapsed")).toBeTruthy();
    expect(screen.getByRole("link", { name: "-2147483648 pending requests: view them" })).toBeTruthy();
    expect(screen.getByText("LCB-2026-00042")).toBeTruthy();
  });

  it("shows the first-use state, with Record unit for bank staff", async () => {
    mocks.api.getDashboard.mockResolvedValue(ok(simulateDashboard("EMPTY", Date.now(), BANK)));
    renderAt();
    expect(await screen.findByRole("heading", { name: "No units recorded yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Record unit" }).getAttribute("href")).toBe("/units/new");
    expect(screen.queryByRole("heading", { name: "Available by blood group" })).toBeNull();
  });

  it("shows each empty list on its own when the others have data", async () => {
    mocks.api.getDashboard.mockResolvedValue(ok({ ...dashboard(BANK), holdsEndingSoon: [], recentActivity: [] }));
    renderAt();
    expect(await screen.findByText("No holds end in the next 120 minutes.")).toBeTruthy();
    expect(screen.getByText("No activity yet.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Units expiring soon" })).toBeTruthy();
  });

  it("shows an error with Retry and the Reference, and retries", async () => {
    mocks.api.getDashboard.mockRejectedValueOnce(
      new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Something went wrong on our side.", requestId: "ref-500" }),
    );
    const user = userEvent.setup();
    renderAt();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn't load the dashboard");
    expect(alert.textContent).toContain("Reference: ref-500");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Lagos Central Blood Bank", { selector: "strong" })).toBeTruthy();
    expect(mocks.api.getDashboard).toHaveBeenCalledTimes(2);
  });
});
