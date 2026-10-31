// @vitest-environment jsdom
// Layout: staff shell for bank staff and the administrator (sidebar, top bar, status pill),
// the old top bar for hospital staff and donors, aria-current on the active route, skip link first.
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Organisation, Role, Session } from "../../api/types";
import type { ServiceStatus } from "../../hooks/useServiceStatus";

const BANK: Organisation = {
  id: "0d1f6a3e-2b4c-4e5f-8a9b-1c2d3e4f5a6b",
  name: "Lagos Central Blood Bank",
  type: "BLOOD_BANK",
  area: "Ikeja",
};
const HOSPITAL: Organisation = {
  id: "2f3b8c5a-4d6e-4a7b-8c9d-3e4f5a6b7c8d",
  name: "Ikeja General Hospital",
  type: "HOSPITAL",
  area: "Ikeja",
};

const ORG_BY_ROLE: Record<Role, Organisation | null> = {
  BANK_STAFF: BANK,
  HOSPITAL_STAFF: HOSPITAL,
  ADMIN: null,
  DONOR: null,
};

const mocks = vi.hoisted(() => ({
  role: { current: "BANK_STAFF" as Role },
  status: { current: null as ServiceStatus | null },
  useServiceStatus: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../../hooks/useServiceStatus", () => ({ useServiceStatus: mocks.useServiceStatus }));
vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({
    session: {
      user: {
        id: "u1",
        displayName: "Ada Obi",
        email: "ada@example.org",
        role: mocks.role.current,
        organisation: ORG_BY_ROLE[mocks.role.current],
      },
    } as Session,
    role: mocks.role.current,
    signOut: mocks.signOut,
  }),
}));

const { default: Layout } = await import("./Layout");

function renderAt(path: string, role: Role) {
  mocks.role.current = role;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<h1>Page</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const sidebar = () => screen.getByTestId("staff-sidebar");
const sidebarLinks = () => within(within(sidebar()).getByRole("navigation", { name: "Main" })).getAllByRole("link");
const topBar = () => screen.getAllByRole("banner").find((el) => el.className.includes("lg:grid"))!;

beforeEach(() => {
  mocks.status.current = null;
  mocks.useServiceStatus.mockReset().mockImplementation(() => mocks.status.current);
});

afterEach(cleanup);

describe("Layout: staff shell", () => {
  it("bank staff see their bank, their links in groups, and Record unit in the top bar", () => {
    renderAt("/dashboard", "BANK_STAFF");

    expect(within(sidebar()).getByText("Lagos Central Blood Bank")).toBeTruthy();
    expect(within(sidebar()).getByText("Ikeja")).toBeTruthy();
    expect(sidebarLinks().map((link) => link.textContent)).toEqual([
      "Dashboard",
      "Requests",
      "Units",
      "Record unit",
      "Donation slots",
      "New slot",
    ]);
    for (const group of ["Overview", "Requests", "Inventory", "Donations"]) {
      expect(within(sidebar()).getByRole("list", { name: group })).toBeTruthy();
    }
    expect(within(topBar()).getByRole("link", { name: "Record unit" }).getAttribute("href")).toBe("/units/new");
    expect(within(sidebar()).getByText("Ada Obi")).toBeTruthy();
    expect(within(sidebar()).getByText("Blood bank staff")).toBeTruthy();
    expect(within(sidebar()).getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("the administrator sees all banks, its own links, and no Record unit", () => {
    renderAt("/dashboard", "ADMIN");

    expect(within(sidebar()).getByText("Administration · All banks")).toBeTruthy();
    expect(sidebarLinks().map((link) => link.textContent)).toEqual([
      "Dashboard",
      "Find blood",
      "Requests",
      "Units",
      "Donation slots",
    ]);
    expect(within(topBar()).queryByRole("link", { name: "Record unit" })).toBeNull();
  });

  it("marks only the active route with aria-current", () => {
    renderAt("/units", "BANK_STAFF");
    expect(sidebarLinks().filter((link) => link.getAttribute("aria-current") === "page").map((l) => l.textContent)).toEqual([
      "Units",
    ]);
    cleanup();

    renderAt("/units/new", "BANK_STAFF");
    expect(sidebarLinks().filter((link) => link.getAttribute("aria-current") === "page").map((l) => l.textContent)).toEqual([
      "Record unit",
    ]);
  });

  it("shows the page title, or a breadcrumb on a sub-route", () => {
    renderAt("/units", "ADMIN");
    expect(within(topBar()).getByText("Units")).toBeTruthy();
    cleanup();

    renderAt("/requests/3c1d", "ADMIN");
    const crumb = within(topBar()).getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumb).getByRole("link", { name: "Requests" }).getAttribute("href")).toBe("/requests");
    expect(within(crumb).getByText("Request details").getAttribute("aria-current")).toBe("page");
    expect(sidebarLinks().some((link) => link.hasAttribute("aria-current"))).toBe(false);
  });

  it("checks the service and shows the dark pill in the top bar", () => {
    mocks.status.current = "failed";
    renderAt("/dashboard", "BANK_STAFF");
    expect(mocks.useServiceStatus).toHaveBeenCalled();
    expect(within(topBar()).getByRole("status").textContent).toBe("Service unreachable");
  });

  it("keeps the old top bar for narrow screens, and the skip link first", () => {
    renderAt("/dashboard", "BANK_STAFF");
    const narrow = screen.getAllByRole("banner").find((el) => el.className.includes("lg:hidden"));
    expect(narrow).toBeTruthy();

    const focusable = document.querySelectorAll("a[href], button");
    expect(focusable[0].textContent).toBe("Skip to main content");
    expect(screen.getByRole("main").id).toBe("main");
  });
});

describe("Layout: hospital staff and donors keep the old top bar", () => {
  it.each([
    ["HOSPITAL_STAFF", ["Find blood", "Requests"]],
    ["DONOR", ["Donation slots", "My bookings"]],
  ] as const)("%s", (role, links) => {
    renderAt("/requests", role);

    expect(screen.queryByTestId("staff-sidebar")).toBeNull();
    const banners = screen.getAllByRole("banner");
    expect(banners).toHaveLength(1);
    expect(banners[0].className).not.toContain("lg:hidden");

    const nav = within(banners[0]).getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(links);
    expect(screen.queryByRole("status")).toBeNull();
    expect(mocks.useServiceStatus).not.toHaveBeenCalled();
  });

  it("marks the active route with aria-current", () => {
    renderAt("/slots", "DONOR");
    expect(screen.getByRole("link", { name: "Donation slots" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "My bookings" }).hasAttribute("aria-current")).toBe(false);
  });
});
