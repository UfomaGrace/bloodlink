// @vitest-environment jsdom
// DashboardPage: who gets the bank filter, the Updated line, the figures, the emergency strip,
// low stock, the two lists and their empty states, first use, and errors.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { BloodRequest, BloodRequestPage, Dashboard, Organisation, Role, Session } from "../api/types";
import { formatLagosTime } from "../lib/donations";
import { simulateDashboard, simulatePendingRequests } from "../lib/mockSimulation";

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
const YABA: Organisation = { id: "2f3b8c5a-4d6e-4a7b-8c1d-3e4f5a6b7c8d", name: "Yaba General Hospital", type: "HOSPITAL", area: "Yaba" };

const MINUTE = 60_000;

const mocks = vi.hoisted(() => ({
  api: { getDashboard: vi.fn(), listOrganisations: vi.fn(), listRequests: vi.fn() },
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

function pageOf(items: BloodRequest[], totalItems = items.length): ApiResponse<BloodRequestPage> {
  return ok({ items, page: 0, size: 100, totalItems });
}

function dashboard(bank: Organisation | null, at = Date.now()): Dashboard {
  return simulateDashboard("SAMPLE", at, bank);
}

/** A pending request at `bank`, received `minutesAgo` before now. */
function pendingRequest(n: number, changes: Partial<BloodRequest> & { minutesAgo: number; bank?: Organisation }): BloodRequest {
  const { minutesAgo, ...rest } = changes;
  return {
    ...simulatePendingRequests("SAMPLE", Date.now(), BANK)[0],
    id: `3a4b5c6d-7e8f-4a9b-8c0d-1e2f3a4b5c${String(n).padStart(2, "0")}`,
    reference: `REQ-2026-0009${String(n).padStart(2, "0")}`,
    hospital: YABA,
    bank: BANK,
    urgency: "ROUTINE",
    createdAt: new Date(Date.now() - minutesAgo * MINUTE).toISOString(),
    ...rest,
  };
}

function renderAt(path = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DashboardPage />
    </MemoryRouter>,
  );
}

const emergencyHeading = () => screen.queryByRole("heading", { name: /^Emergency:/ });

beforeEach(() => {
  mocks.role.current = "BANK_STAFF";
  mocks.api.getDashboard.mockReset().mockImplementation((query: { bankId?: string }) => {
    const bank = mocks.role.current === "BANK_STAFF" ? BANK : ([BANK, OTHER_BANK].find((b) => b.id === query.bankId) ?? null);
    return Promise.resolve(ok(dashboard(bank)));
  });
  mocks.api.listOrganisations.mockReset().mockResolvedValue(ok({ items: [BANK, OTHER_BANK] }));
  mocks.api.listRequests.mockReset().mockResolvedValue(pageOf([]));
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
    expect(mocks.api.listRequests.mock.calls[0][0]).toEqual({ state: "PENDING", page: 0, size: 100 });
  });

  it("admin: all banks by default, and a bank filter that passes bankId", async () => {
    mocks.role.current = "ADMIN";
    const user = userEvent.setup();
    renderAt();
    expect(await screen.findByText("All banks", { selector: "span" })).toBeTruthy();
    const filter = await screen.findByRole("combobox", { name: "Bank" });
    await waitFor(() => expect((filter as HTMLSelectElement).disabled).toBe(false));
    expect(mocks.api.getDashboard).toHaveBeenLastCalledWith({ bankId: undefined }, expect.anything());

    await user.selectOptions(filter, "Surulere Blood Centre");
    expect(await screen.findByText("Surulere Blood Centre", { selector: "span" })).toBeTruthy();
    expect(mocks.api.getDashboard).toHaveBeenLastCalledWith({ bankId: OTHER_BANK.id }, expect.anything());
  });

  it("admin: ?bankId from the URL picks that bank", async () => {
    mocks.role.current = "ADMIN";
    renderAt(`/dashboard?bankId=${BANK.id}`);
    expect(await screen.findByText("Lagos Central Blood Bank", { selector: "span" })).toBeTruthy();
    expect(mocks.api.getDashboard).toHaveBeenCalledWith({ bankId: BANK.id }, expect.anything());
  });

  it("admin: the bank filter applies to the requests waiting too", async () => {
    mocks.role.current = "ADMIN";
    mocks.api.listRequests.mockResolvedValue(
      pageOf([
        pendingRequest(1, { minutesAgo: 30, bank: BANK, hospital: { ...YABA, name: "Ikeja Medical Centre" } }),
        pendingRequest(2, { minutesAgo: 20, bank: OTHER_BANK, hospital: { ...YABA, name: "Surulere Clinic" } }),
      ]),
    );
    const user = userEvent.setup();
    renderAt();
    const waiting = await screen.findByRole("region", { name: "Waiting for you" });
    expect(within(waiting).getByText("Ikeja Medical Centre")).toBeTruthy();
    expect(within(waiting).getByText("Surulere Clinic")).toBeTruthy();
    // All banks: each row names its bank.
    expect(within(waiting).getByText(/· Surulere Blood Centre$/)).toBeTruthy();

    const filter = await screen.findByRole("combobox", { name: "Bank" });
    await waitFor(() => expect((filter as HTMLSelectElement).disabled).toBe(false));
    await user.selectOptions(filter, "Surulere Blood Centre");
    await screen.findByText("Surulere Blood Centre", { selector: "span" });
    const filtered = await screen.findByRole("region", { name: "Waiting for you" });
    expect(within(filtered).queryByText("Ikeja Medical Centre")).toBeNull();
    expect(within(filtered).getByText("Surulere Clinic")).toBeTruthy();
    expect(mocks.api.listRequests).toHaveBeenCalledTimes(1);
  });

  it("labels the figures Updated HH:mm (Lagos), and links the figures to their lists", async () => {
    const at = Date.now() - 3 * MINUTE;
    mocks.api.getDashboard.mockResolvedValue(ok(dashboard(BANK, at)));
    renderAt();
    const line = await screen.findByText(/^Updated$/);
    const iso = new Date(at).toISOString();
    expect(line.textContent).toBe(`Updated ${formatLagosTime(iso)}`);
    expect(line.querySelector("time")?.getAttribute("datetime")).toBe(iso);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();

    const figures = screen.getByRole("region", { name: "At a glance" });
    expect(within(figures).getByRole("link", { name: /^Units available\s*70\D/ }).getAttribute("href")).toBe("/units?state=AVAILABLE");
    expect(within(figures).getByRole("link", { name: /^Pending requests\s*4\D/ }).getAttribute("href")).toBe("/requests?state=PENDING");
    expect(within(figures).getByRole("link", { name: /^Requests on hold\s*2\s*Next hold ends in 1m$/ }).getAttribute("href")).toBe(
      "/requests?state=APPROVED",
    );
    expect(within(figures).getByText("Expiring soon")).toBeTruthy();
    expect(within(figures).queryByRole("link", { name: /Expiring soon/ })).toBeNull();
  });

  it("shows the date, never 'days ago', once the figures are older than a day", async () => {
    mocks.api.getDashboard.mockResolvedValue(ok(dashboard(BANK, Date.now() - 3 * 24 * 60 * MINUTE)));
    renderAt();
    const line = await screen.findByText(/^Updated$/);
    expect(line.textContent).toMatch(/^Updated \d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}$/);
  });

  it("refreshes the figures and the pending list together", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(await screen.findByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(mocks.api.getDashboard).toHaveBeenCalledTimes(2));
    expect(mocks.api.listRequests).toHaveBeenCalledTimes(2);
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
    expect(await screen.findByRole("heading", { name: "Stock by group" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Pending requests\s*-2147483648/ })).toBeTruthy();
    // The hold has passed, so no countdown.
    expect(screen.getByRole("link", { name: /^Requests on hold\s*-2147483648\s*No holds end/ })).toBeTruthy();
    expect(screen.getByText("Unit string: string (string).")).toBeTruthy();
  });

  it("shows the first-use state, with Record unit for bank staff", async () => {
    mocks.api.getDashboard.mockResolvedValue(ok(simulateDashboard("EMPTY", Date.now(), BANK)));
    renderAt();
    expect(await screen.findByRole("heading", { name: "No units recorded yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Record unit" }).getAttribute("href")).toBe("/units/new");
    expect(screen.queryByRole("heading", { name: "Stock by group" })).toBeNull();
  });

  it("shows each empty list on its own when the others have data, and no strip", async () => {
    mocks.api.getDashboard.mockResolvedValue(ok({ ...dashboard(BANK), recentActivity: [] }));
    renderAt();
    expect(await screen.findByText("No activity yet.")).toBeTruthy();
    expect(screen.getByText("Nothing waiting. New requests appear here.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Stock by group" })).toBeTruthy();
    expect(emergencyHeading()).toBeNull();
  });

  it("lists the latest five activity entries as sentences, timed in Lagos", async () => {
    const data = dashboard(BANK);
    mocks.api.getDashboard.mockResolvedValue(ok(data));
    renderAt();
    const activity = await screen.findByRole("region", { name: "Recent activity" });
    const items = within(activity).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toBe(`${formatLagosTime(data.recentActivity[0].at)}Unit LCB-2026-04112: recorded (Adaeze Okafor).`);
    expect(items[1].textContent).toContain("Request REQ-2026-000321: approved, units reserved (Tunde Bakare).");
  });

  it("marks low groups in words, and only those", async () => {
    renderAt();
    const stock = await screen.findByRole("region", { name: "Stock by group" });
    expect(within(stock).getByText(/Low is under 5\./)).toBeTruthy();
    const cells = within(stock).getAllByRole("listitem");
    expect(cells).toHaveLength(8);
    const cellFor = (group: string) => cells.find((c) => c.querySelector("span")?.textContent === group)!;
    expect(cellFor("A−").textContent).toBe("A−3availablelow");
    expect(cellFor("B−").textContent).toContain("low");
    expect(cellFor("O+").textContent).toBe("O+22available");
  });

  describe("emergency strip", () => {
    it("is hidden when nothing pending is an emergency", async () => {
      mocks.api.listRequests.mockResolvedValue(pageOf([pendingRequest(1, { minutesAgo: 5, urgency: "URGENT" })]));
      renderAt();
      await screen.findByRole("region", { name: "Waiting for you" });
      expect(emergencyHeading()).toBeNull();
      expect(screen.getByRole("link", { name: /^Pending requests\s*4\s*Waiting for a decision/ })).toBeTruthy();
    });

    it("names the hospital, units and group, with this bank's stock and a link to review", async () => {
      const emergency = pendingRequest(1, { minutesAgo: 12, urgency: "EMERGENCY", bloodGroup: "O", rhesus: "NEGATIVE", quantity: 2 });
      mocks.api.listRequests.mockResolvedValue(pageOf([pendingRequest(2, { minutesAgo: 90 }), emergency]));
      renderAt();
      const heading = await screen.findByRole("heading", { name: /^Emergency:/ });
      expect(heading.textContent).toBe("Emergency: Yaba General Hospital needs 2 units of O−");
      const strip = screen.getByRole("region", { name: heading.textContent! });
      expect(within(strip).getByText(/^Received/).textContent).toBe("Received 12 min ago. You have 7 O− available.");
      expect(within(strip).getByRole("link", { name: "Review request" }).getAttribute("href")).toBe(`/requests/${emergency.id}`);
      expect(within(strip).queryByText(/more emergenc/)).toBeNull();

      // Waiting for you: the emergency first, though it is newer.
      const rows = within(screen.getByRole("region", { name: "Waiting for you" })).getAllByRole("link", { name: /Yaba/ });
      expect(rows[0].getAttribute("href")).toBe(`/requests/${emergency.id}`);
      expect(within(rows[0]).getByText("Emergency")).toBeTruthy();
      expect(within(rows[1]).getByText("Routine")).toBeTruthy();
    });

    it("shows the oldest of several, and how many more", async () => {
      const newer = pendingRequest(1, { minutesAgo: 5, urgency: "EMERGENCY", quantity: 1 });
      const oldest = pendingRequest(2, { minutesAgo: 40, urgency: "EMERGENCY", quantity: 3 });
      const third = pendingRequest(3, { minutesAgo: 20, urgency: "EMERGENCY", quantity: 1 });
      mocks.api.listRequests.mockResolvedValue(pageOf([newer, oldest, third]));
      renderAt();
      const heading = await screen.findByRole("heading", { name: /^Emergency:/ });
      expect(heading.textContent).toContain("needs 3 units");
      expect(screen.getByRole("link", { name: "+2 more emergencies" }).getAttribute("href")).toBe("/requests?state=PENDING");
      expect(screen.getByRole("link", { name: /^Pending requests\s*4\s*3 emergencies/ })).toBeTruthy();
    });

    it("names the bank when the administrator views all banks", async () => {
      mocks.role.current = "ADMIN";
      mocks.api.listRequests.mockResolvedValue(
        pageOf([pendingRequest(1, { minutesAgo: 12, urgency: "EMERGENCY", bloodGroup: "O", rhesus: "NEGATIVE", bank: OTHER_BANK })]),
      );
      renderAt();
      const heading = await screen.findByRole("heading", { name: /^Emergency:/ });
      expect(heading.textContent).toBe("Emergency: Yaba General Hospital needs 2 units of O− from Surulere Blood Centre");
      expect(screen.getByText(/^Received/).textContent).toContain("All banks together have 7 O− available.");
    });

    it("says it couldn't check, with Check again, when the pending list fails", async () => {
      mocks.api.listRequests.mockRejectedValueOnce(
        new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Something went wrong on our side.", requestId: "ref-req" }),
      );
      mocks.api.listRequests.mockResolvedValueOnce(pageOf([pendingRequest(1, { minutesAgo: 12, urgency: "EMERGENCY" })]));
      const user = userEvent.setup();
      renderAt();
      expect(await screen.findByText("We couldn't check for emergency requests.")).toBeTruthy();
      expect(screen.getAllByText("Reference: ref-req").length).toBeGreaterThan(0);
      // The figures still show.
      expect(screen.getByRole("heading", { name: "Stock by group" })).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Check again" }));
      expect(await screen.findByRole("heading", { name: /^Emergency:/ })).toBeTruthy();
      expect(screen.queryByText("We couldn't check for emergency requests.")).toBeNull();
    });
  });

  it("reads every page of pending requests", async () => {
    const first = Array.from({ length: 100 }, (_, i) => pendingRequest(i, { minutesAgo: 10 + i }));
    const emergency = pendingRequest(101, { minutesAgo: 5, urgency: "EMERGENCY" });
    mocks.api.listRequests.mockResolvedValueOnce(pageOf(first, 101)).mockResolvedValueOnce(pageOf([emergency], 101));
    renderAt();
    expect(await screen.findByRole("heading", { name: /^Emergency:/ })).toBeTruthy();
    expect(mocks.api.listRequests.mock.calls.map((call) => call[0].page)).toEqual([0, 1]);
    // Five rows at most.
    expect(within(screen.getByRole("region", { name: "Waiting for you" })).getAllByRole("listitem")).toHaveLength(5);
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
    expect(await screen.findByRole("heading", { name: "Stock by group" })).toBeTruthy();
    expect(mocks.api.getDashboard).toHaveBeenCalledTimes(2);
  });
});
