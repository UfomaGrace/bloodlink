// navItems: each role's links in order, groups, and the top bar's page title.
import { describe, expect, it } from "vitest";
import type { Role } from "../../api/types";
import { navGroupsFor, navItemsFor, pageTitleFor } from "./navItems";

const labels = (role: Role) => navItemsFor(role).map((item) => item.label);

describe("navItemsFor", () => {
  it("gives each role its links, in order", () => {
    expect(labels("BANK_STAFF")).toEqual(["Dashboard", "Requests", "Units", "Record unit", "Donation slots", "New slot"]);
    expect(labels("ADMIN")).toEqual(["Dashboard", "Find blood", "Requests", "Units", "Donation slots"]);
    expect(labels("HOSPITAL_STAFF")).toEqual(["Find blood", "Requests"]);
    expect(labels("DONOR")).toEqual(["Donation slots", "My bookings"]);
  });
});

describe("navGroupsFor", () => {
  it("groups the links without reordering them", () => {
    const groups = navGroupsFor("BANK_STAFF").map(({ group, items }) => [group, items.map((item) => item.label)]);
    expect(groups).toEqual([
      ["Overview", ["Dashboard"]],
      ["Requests", ["Requests"]],
      ["Inventory", ["Units", "Record unit"]],
      ["Donations", ["Donation slots", "New slot"]],
    ]);
  });
});

describe("pageTitleFor", () => {
  it("uses the nav label on a nav route", () => {
    expect(pageTitleFor("/units", "BANK_STAFF")).toEqual({ label: "Units" });
    expect(pageTitleFor("/units/new", "BANK_STAFF")).toEqual({ label: "Record unit" });
  });

  it("gives a sub-route its parent and page name", () => {
    const title = pageTitleFor("/requests/abc", "ADMIN");
    expect(title?.label).toBe("Request details");
    expect(title?.parent?.to).toBe("/requests");
    expect(pageTitleFor("/slots/abc", "BANK_STAFF")?.parent?.label).toBe("Donation slots");
  });

  it("has nothing for an unknown path", () => {
    expect(pageTitleFor("/nowhere", "BANK_STAFF")).toBeNull();
  });
});
