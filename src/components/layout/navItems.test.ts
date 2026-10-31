// navItems: each role's links in order, and the staff sidebar's groups.
import { describe, expect, it } from "vitest";
import type { Role } from "../../api/types";
import { navGroupsFor, navItemsFor } from "./navItems";

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
  const groups = (role: Role) =>
    navGroupsFor(role).map(({ group, labelled, items }) => [group, labelled, items.map((item) => item.label)]);

  it("puts Overview and Requests in one unlabelled first group, without reordering", () => {
    expect(groups("BANK_STAFF")).toEqual([
      ["Overview", false, ["Dashboard", "Requests"]],
      ["Inventory", true, ["Units", "Record unit"]],
      ["Donations", true, ["Donation slots", "New slot"]],
    ]);
    expect(groups("ADMIN")).toEqual([
      ["Overview", false, ["Dashboard", "Find blood", "Requests"]],
      ["Inventory", true, ["Units"]],
      ["Donations", true, ["Donation slots"]],
    ]);
  });
});
