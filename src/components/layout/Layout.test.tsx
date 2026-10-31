// @vitest-environment jsdom
// Layout: staff shell for bank staff and the administrator (full-width top bar with the organisation
// chip and compact status, collapsible nav sidebar), the old top bar for hospital staff and donors,
// aria-current on the active route, skip link first.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

const { default: Layout, SIDEBAR_COLLAPSED_KEY } = await import("./Layout");

function tree(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<h1>Page</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function renderAt(path: string, role: Role) {
  mocks.role.current = role;
  return render(tree(path));
}

const sidebar = () => screen.getByTestId("staff-sidebar");
const sidebarNav = () => within(sidebar()).getByRole("navigation", { name: "Main" });
const sidebarLinks = () => within(sidebarNav()).getAllByRole("link");
const linkNames = () => sidebarLinks().map((link) => link.getAttribute("aria-label") ?? link.textContent);
const topBar = () => screen.getAllByRole("banner").find((el) => el.className.includes("lg:flex"))!;
const chip = () => within(topBar()).getByTestId("organisation-chip");
const toggle = () => within(topBar()).getByRole("button", { name: /sidebar$/ });
const current = (value: string) =>
  sidebarLinks()
    .filter((link) => link.getAttribute("aria-current") === value)
    .map((link) => link.getAttribute("aria-label") ?? link.textContent);

const BANK_LINKS = ["Dashboard", "Requests", "Units", "Record unit", "Donation slots", "New slot"];

beforeEach(() => {
  mocks.status.current = null;
  mocks.useServiceStatus.mockReset().mockImplementation(() => mocks.status.current);
  mocks.signOut.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Layout: staff shell top bar", () => {
  it("bank staff see their bank and area in the chip, themselves, Record unit and Sign out", () => {
    renderAt("/dashboard", "BANK_STAFF");

    expect(within(chip()).getByText("Lagos Central Blood Bank · Ikeja")).toBeTruthy();
    expect(within(topBar()).getByRole("link", { name: "Record unit" }).getAttribute("href")).toBe("/units/new");
    expect(within(topBar()).getByText("AO").getAttribute("aria-hidden")).toBe("true");
    expect(within(topBar()).getByText("Ada Obi")).toBeTruthy();
    expect(within(topBar()).getByText("Blood bank staff")).toBeTruthy();
    expect(within(topBar()).getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("the administrator sees all banks in the chip and no Record unit", () => {
    renderAt("/dashboard", "ADMIN");

    expect(within(chip()).getByText("Administration · All banks")).toBeTruthy();
    expect(within(topBar()).getByText("Administrator")).toBeTruthy();
    expect(within(topBar()).queryByRole("link", { name: "Record unit" })).toBeNull();
  });

  it("has the logo and no page title or breadcrumb", () => {
    renderAt("/requests/3c1d", "ADMIN");
    expect(within(topBar()).getByRole("link", { name: "BloodLink" })).toBeTruthy();
    expect(within(topBar()).queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(within(topBar()).queryByText("Request details")).toBeNull();
  });

  it("signs out from the top bar", () => {
    renderAt("/dashboard", "BANK_STAFF");
    fireEvent.click(within(topBar()).getByRole("button", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalled();
  });
});

describe("Layout: compact service status in the chip", () => {
  it("checks the service and keeps the status region mounted while there is nothing to say", () => {
    renderAt("/dashboard", "BANK_STAFF");
    expect(mocks.useServiceStatus).toHaveBeenCalled();
    expect(within(chip()).getByRole("status").textContent).toBe("");
  });

  it.each([
    ["checking", "Waking the service…"],
    ["failed", "Service unreachable"],
    ["ready", "Connected"],
  ] as const)("%s reads %s, without the pill", (status, text) => {
    mocks.status.current = status;
    renderAt("/dashboard", "ADMIN");
    const region = within(chip()).getByRole("status");
    expect(region.textContent).toBe(text);
    expect(region.firstElementChild?.className).not.toContain("rounded-full");
  });

  it("keeps saying Connected after the hook stops reporting ready", () => {
    mocks.status.current = "ready";
    const view = renderAt("/dashboard", "BANK_STAFF");
    expect(within(chip()).getByRole("status").textContent).toBe("Connected");

    mocks.status.current = null;
    view.rerender(tree("/dashboard"));
    expect(within(chip()).getByRole("status").textContent).toBe("Connected");
  });
});

describe("Layout: staff sidebar", () => {
  it("bank staff see only the nav, in groups, the first one unlabelled", () => {
    renderAt("/dashboard", "BANK_STAFF");

    expect(linkNames()).toEqual(BANK_LINKS);
    expect(within(sidebar()).queryByRole("button")).toBeNull();
    expect(within(sidebar()).queryByText("Lagos Central Blood Bank")).toBeNull();
    expect(within(sidebar()).queryByText("Ada Obi")).toBeNull();
    for (const group of ["Inventory", "Donations"]) {
      expect(within(sidebar()).getByRole("list", { name: group })).toBeTruthy();
    }
    expect(within(sidebar()).queryByText("Overview")).toBeNull();
    const [first] = within(sidebar()).getAllByRole("list");
    expect(within(first).getAllByRole("link").map((link) => link.textContent)).toEqual(["Dashboard", "Requests"]);
  });

  it("the administrator sees their own links", () => {
    renderAt("/dashboard", "ADMIN");
    expect(linkNames()).toEqual(["Dashboard", "Find blood", "Requests", "Units", "Donation slots"]);
  });

  it("marks only the exact route with aria-current=page", () => {
    renderAt("/units", "BANK_STAFF");
    expect(current("page")).toEqual(["Units"]);
    expect(current("true")).toEqual([]);
    cleanup();

    renderAt("/units/new", "BANK_STAFF");
    expect(current("page")).toEqual(["Record unit"]);
    expect(current("true")).toEqual([]);
  });

  it.each([
    ["/requests/3c1d", "Requests"],
    ["/units/9a2b", "Units"],
    ["/slots/7f0e", "Donation slots"],
  ])("on %s gives %s the active look with aria-current=true, not page", (path, parent) => {
    renderAt(path, "BANK_STAFF");
    expect(current("page")).toEqual([]);
    expect(current("true")).toEqual([parent]);
    const link = within(sidebarNav()).getByRole("link", { name: parent });
    expect(link.className).toContain("bg-(--color-secondary-hover)");
    expect(link.className).toContain("font-medium");
    const other = within(sidebarNav()).getByRole("link", { name: "Dashboard" });
    expect(other.className).not.toContain("font-medium");
  });
});

describe("Layout: collapsible sidebar", () => {
  it("starts expanded, and the toggle controls the sidebar", () => {
    renderAt("/dashboard", "BANK_STAFF");
    expect(toggle().getAttribute("aria-label")).toBe("Collapse sidebar");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(toggle().getAttribute("aria-controls")).toBe(sidebar().id);
    expect(sidebar().className).toContain("w-60");
  });

  it("collapses and expands, switching its label, and remembers the choice", () => {
    renderAt("/dashboard", "BANK_STAFF");
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-label")).toBe("Expand sidebar");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(sidebar().className).toContain("w-17");
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("true");
    cleanup();

    renderAt("/units", "BANK_STAFF");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-label")).toBe("Collapse sidebar");
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("false");
  });

  it("falls back to expanded when storage throws, and still toggles", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderAt("/dashboard", "BANK_STAFF");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("collapsed links keep their names, and tooltips are aria-hidden", () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "true");
    renderAt("/units", "BANK_STAFF");

    expect(sidebarLinks().map((link) => link.getAttribute("aria-label"))).toEqual(BANK_LINKS);
    for (const label of BANK_LINKS) {
      expect(within(sidebarNav()).getByRole("link", { name: label })).toBeTruthy();
    }
    const tips = Array.from(sidebar().querySelectorAll("[data-tooltip]"));
    expect(tips.map((tip) => tip.textContent)).toEqual(BANK_LINKS);
    for (const tip of tips) expect(tip.getAttribute("aria-hidden")).toBe("true");
    expect(current("page")).toEqual(["Units"]);
    // Group labels turn into dividers, but the lists keep their names.
    expect(within(sidebar()).getByRole("list", { name: "Inventory" })).toBeTruthy();
  });

  it("Escape hides the tooltip of the focused or hovered link until it is left", () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "true");
    renderAt("/dashboard", "BANK_STAFF");
    const link = (name: string) => within(sidebarNav()).getByRole("link", { name });
    const tipHidden = (name: string) => link(name).querySelector("[data-tooltip]")!.classList.contains("hidden");

    act(() => link("Units").focus());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(tipHidden("Units")).toBe(true);
    expect(tipHidden("Requests")).toBe(false);

    act(() => link("Units").blur());
    expect(tipHidden("Units")).toBe(false);

    fireEvent.mouseEnter(link("Donation slots"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(tipHidden("Donation slots")).toBe(true);
    fireEvent.mouseLeave(link("Donation slots"));
    expect(tipHidden("Donation slots")).toBe(false);
  });
});

describe("Layout: staff shell order", () => {
  it("follows the DOM order: skip link, top bar, sidebar, main", () => {
    renderAt("/requests/3c1d", "BANK_STAFF");
    const narrow = screen.getAllByRole("banner").find((el) => el.className.includes("lg:hidden"))!;
    // The narrow-screen header is display:none from lg up; jsdom has no CSS, so leave it out here.
    const order = Array.from(document.querySelectorAll<HTMLElement>("a[href], button, main"))
      .filter((el) => !narrow.contains(el))
      .map((el) => (el.tagName === "MAIN" ? "main" : (el.getAttribute("aria-label") ?? el.textContent)));
    expect(order).toEqual([
      "Skip to main content",
      "Collapse sidebar",
      "BloodLink",
      "Record unit",
      "Sign out",
      ...BANK_LINKS,
      "main",
    ]);
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
    expect(screen.queryByRole("button", { name: /sidebar$/ })).toBeNull();
    expect(mocks.useServiceStatus).not.toHaveBeenCalled();
  });

  it("marks the active route with aria-current", () => {
    renderAt("/slots", "DONOR");
    expect(screen.getByRole("link", { name: "Donation slots" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "My bookings" }).hasAttribute("aria-current")).toBe(false);
  });
});
