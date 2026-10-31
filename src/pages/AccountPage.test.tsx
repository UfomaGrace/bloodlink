// @vitest-environment jsdom
// AccountPage: each role's details from the session, the organisation row for staff only,
// the right contact line, and Sign out.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Organisation, Role, Session } from "../api/types";

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
  area: "Yaba",
};

const ORG_BY_ROLE: Record<Role, Organisation | null> = {
  BANK_STAFF: BANK,
  HOSPITAL_STAFF: HOSPITAL,
  ADMIN: null,
  DONOR: null,
};

const mocks = vi.hoisted(() => ({
  role: { current: "BANK_STAFF" as Role },
  signOut: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({
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

const { default: AccountPage } = await import("./AccountPage");

function renderAs(role: Role) {
  mocks.role.current = role;
  return render(
    <MemoryRouter initialEntries={["/account"]}>
      <AccountPage />
    </MemoryRouter>,
  );
}

/** The definition list as [term, value] pairs, in order. */
function details(): [string, string][] {
  const region = screen.getByRole("region", { name: "Account details" });
  return Array.from(region.querySelectorAll("dl dt")).map((dt) => [dt.textContent!, dt.nextElementSibling!.textContent!]);
}

beforeEach(() => {
  mocks.signOut.mockReset();
});

afterEach(cleanup);

describe("AccountPage", () => {
  it.each([
    [
      "BANK_STAFF",
      "Blood bank staff",
      "Lagos Central Blood Bank · Ikeja",
      "To update your details, contact your BloodLink administrator.",
    ],
    [
      "HOSPITAL_STAFF",
      "Hospital staff",
      "Ikeja General Hospital · Yaba",
      "To update your details, contact your BloodLink administrator.",
    ],
    ["ADMIN", "Administrator", "Administration · All banks", "Account changes are made by the BloodLink service team."],
  ] as const)("%s sees name, email, role and organisation, and the staff contact line", (role, label, org, line) => {
    renderAs(role);

    expect(screen.getByRole("heading", { level: 1, name: "Your account" })).toBeTruthy();
    expect(details()).toEqual([
      ["Name", "Ada Obi"],
      ["Email", "ada@example.org"],
      ["Role", label],
      ["Organisation", org],
    ]);
    expect(screen.getByText(line)).toBeTruthy();
  });

  it("donors see name, email and role, no organisation row, and the donor contact line", () => {
    renderAs("DONOR");

    expect(details()).toEqual([
      ["Name", "Ada Obi"],
      ["Email", "ada@example.org"],
      ["Role", "Donor"],
    ]);
    expect(screen.queryByText("Organisation")).toBeNull();
    expect(screen.getByText("To update your details, contact the blood bank where you donate.")).toBeTruthy();
    expect(screen.queryByText(/BloodLink administrator/)).toBeNull();
  });

  it("has no edit, password or preference controls: Sign out is the only button", () => {
    renderAs("HOSPITAL_STAFF");
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Sign out"]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("signs out with the same handler as the header", () => {
    renderAs("DONOR");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith();
  });
});
