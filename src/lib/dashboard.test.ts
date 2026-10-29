import { describe, expect, it } from "vitest";
import type { Dashboard, GroupCount, Organisation } from "../api/types";
import {
  barPercent,
  dashboardScopeLabel,
  expiryLabel,
  groupRows,
  holdClockEntries,
  holdTimeLeft,
  isFirstUse,
  lowGroupsFewestFirst,
  totalAvailable,
} from "./dashboard";
import { nextHoldEnd } from "./holds";
import { simulateDashboard } from "./mockSimulation";

const BANK: Organisation = { id: "bank-1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" };
const NOW = Date.parse("2026-10-29T12:00:00Z"); // 13:00 in Lagos

function count(bloodGroup: GroupCount["bloodGroup"], rhesus: GroupCount["rhesus"], availableUnits: number): GroupCount {
  return { bloodGroup, rhesus, availableUnits };
}

describe("dashboardScopeLabel", () => {
  it("says All banks when the service summarised every bank", () => {
    expect(dashboardScopeLabel(null)).toBe("All banks");
    expect(dashboardScopeLabel(undefined)).toBe("All banks");
  });

  it("names the bank otherwise", () => {
    expect(dashboardScopeLabel(BANK)).toBe("Lagos Central Blood Bank");
  });
});

describe("groupRows", () => {
  it("orders A+, A−, B+ … O− and flags the low groups", () => {
    const rows = groupRows({
      availableByGroup: [count("O", "NEGATIVE", 7), count("A", "NEGATIVE", 3), count("AB", "POSITIVE", 6), count("A", "POSITIVE", 14)],
      lowGroups: [count("A", "NEGATIVE", 3)],
    });
    expect(rows.map((r) => r.label)).toEqual(["A+", "A−", "AB+", "O−"]);
    expect(rows.map((r) => r.low)).toEqual([false, true, false, false]);
    expect(rows[3].availableUnits).toBe(7);
  });

  it("adds no rows for groups the service left out", () => {
    expect(groupRows({ availableByGroup: [count("B", "POSITIVE", 0)], lowGroups: [] })).toHaveLength(1);
  });
});

describe("lowGroupsFewestFirst", () => {
  it("sorts by units, ties in group order, without changing the input", () => {
    const input = [count("O", "NEGATIVE", 2), count("B", "NEGATIVE", 1), count("A", "NEGATIVE", 2)];
    expect(lowGroupsFewestFirst(input).map((g) => `${g.bloodGroup}${g.rhesus}`)).toEqual([
      "BNEGATIVE",
      "ANEGATIVE",
      "ONEGATIVE",
    ]);
    expect(input[0].bloodGroup).toBe("O");
  });
});

describe("totalAvailable and barPercent", () => {
  it("adds up what was sent, negatives included", () => {
    expect(totalAvailable([count("A", "POSITIVE", 4), count("B", "POSITIVE", 6)])).toBe(10);
    expect(totalAvailable([count("A", "POSITIVE", -2147483648)])).toBe(-2147483648);
    expect(totalAvailable([])).toBe(0);
  });

  it("gives a 0–100 bar, and 0 for zero, negative or no maximum", () => {
    expect(barPercent(11, 22)).toBe(50);
    expect(barPercent(22, 22)).toBe(100);
    expect(barPercent(0, 22)).toBe(0);
    expect(barPercent(-5, 22)).toBe(0);
    expect(barPercent(5, 0)).toBe(0);
    expect(barPercent(Number.NaN, 10)).toBe(0);
  });
});

describe("holdTimeLeft", () => {
  it("counts down to the minute, then reads Lapsed", () => {
    const end = new Date(NOW + 4 * 60_000 + 30_000).toISOString();
    expect(holdTimeLeft(end, NOW)).toEqual({ lapsed: false, label: "4m left" });
    expect(holdTimeLeft(end, NOW + 4 * 60_000 + 10_000)).toEqual({ lapsed: false, label: "less than a minute left" });
    expect(holdTimeLeft(end, NOW + 5 * 60_000)).toEqual({ lapsed: true, label: "Lapsed" });
    expect(holdTimeLeft(new Date(NOW + 75 * 60_000).toISOString(), NOW).label).toBe("1h 15m left");
  });

  it("reads Lapsed exactly at the end, and empty for a bad date", () => {
    expect(holdTimeLeft(new Date(NOW).toISOString(), NOW).lapsed).toBe(true);
    expect(holdTimeLeft("not a date", NOW)).toEqual({ lapsed: false, label: "" });
  });
});

describe("holdClockEntries", () => {
  it("lets the hold clock find the next running hold end", () => {
    const soon = new Date(NOW + 60_000).toISOString();
    const past = new Date(NOW - 60_000).toISOString();
    const holds = [past, soon].map((holdExpiresAt) => ({
      requestId: "r",
      requestReference: "REQ-1",
      hospital: BANK,
      unit: { id: "u", reference: "U-1", expiryDate: "2026-11-30" },
      holdExpiresAt,
    }));
    expect(nextHoldEnd(holdClockEntries(holds), NOW)).toBe(NOW + 60_000);
  });
});

describe("expiryLabel", () => {
  it("labels today, tomorrow, later and past", () => {
    expect(expiryLabel("2026-10-29", NOW)).toBe("Expires today");
    expect(expiryLabel("2026-10-30", NOW)).toBe("Expires tomorrow");
    expect(expiryLabel("2026-11-04", NOW)).toBe("Expires in 6 days");
    expect(expiryLabel("2026-10-28", NOW)).toBe("Expired");
    expect(expiryLabel("soon", NOW)).toBe("");
  });
});

describe("isFirstUse", () => {
  it("is true for the empty simulation, false for the sample", () => {
    expect(isFirstUse(simulateDashboard("EMPTY", NOW, BANK))).toBe(true);
    expect(isFirstUse(simulateDashboard("SAMPLE", NOW, BANK))).toBe(false);
  });

  it("is false as soon as anything is recorded", () => {
    const empty: Dashboard = simulateDashboard("EMPTY", NOW, BANK);
    expect(isFirstUse({ ...empty, openRequests: { pending: 1, approved: 0 } })).toBe(false);
    expect(isFirstUse({ ...empty, availableByGroup: [count("O", "POSITIVE", 1)] })).toBe(false);
  });
});

describe("simulateDashboard (mock only)", () => {
  it("SAMPLE: all eight groups, two low, holds soonest first with one under 5 minutes", () => {
    const d = simulateDashboard("SAMPLE", NOW, BANK);
    expect(d.computedAt).toBe(new Date(NOW).toISOString());
    expect(d.bank).toEqual(BANK);
    expect(d.availableByGroup).toHaveLength(8);
    expect(d.lowGroups).toHaveLength(2);
    expect(d.lowGroups.every((g) => g.availableUnits < d.lowStockThreshold)).toBe(true);
    const ends = d.holdsEndingSoon.map((h) => Date.parse(h.holdExpiresAt));
    expect(ends[0] - NOW).toBeLessThan(5 * 60_000);
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
    expect(d.unitsExpiringSoon.length).toBeGreaterThanOrEqual(3);
    expect(d.recentActivity.length).toBeGreaterThanOrEqual(6);
  });

  it("SAMPLE with no bank reads as All banks", () => {
    expect(simulateDashboard("SAMPLE", NOW, null).bank).toBeNull();
  });
});
