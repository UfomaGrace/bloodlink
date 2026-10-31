import { describe, expect, it, vi } from "vitest";
import type { BloodRequest, Dashboard, GroupCount, Organisation } from "../api/types";
import {
  activitySentence,
  availableFor,
  barPercent,
  dashboardScopeLabel,
  groupRows,
  holdClockEntries,
  isFirstUse,
  lagosDayLabel,
  lagosWhen,
  nextHoldLeft,
  PENDING_PAGE_LIMIT,
  PENDING_PAGE_SIZE,
  readPendingRequests,
  totalAvailable,
  unitsLabel,
  waitingRequests,
} from "./dashboard";
import { nextHoldEnd } from "./holds";
import { simulateDashboard, simulatePendingRequests } from "./mockSimulation";

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

describe("simulatePendingRequests (mock only)", () => {
  it("SAMPLE: as many as the sample's pending count, one an emergency; EMPTY: none", () => {
    const requests = simulatePendingRequests("SAMPLE", NOW, BANK);
    expect(requests).toHaveLength(simulateDashboard("SAMPLE", NOW, BANK).openRequests.pending);
    expect(requests.filter((r) => r.urgency === "EMERGENCY")).toHaveLength(1);
    expect(requests.every((r) => r.state === "PENDING" && r.bank.id === BANK.id)).toBe(true);
    expect(simulatePendingRequests("EMPTY", NOW, BANK)).toEqual([]);
  });
});

function pending(id: string, changes: Partial<BloodRequest>): BloodRequest {
  return { ...simulatePendingRequests("SAMPLE", NOW, BANK)[0], id, ...changes };
}

describe("waitingRequests", () => {
  const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

  it("puts emergencies first, then oldest first, and leaves other states out", () => {
    const items = [
      pending("routine-old", { urgency: "ROUTINE", createdAt: minutesAgo(300) }),
      pending("emergency-new", { urgency: "EMERGENCY", createdAt: minutesAgo(5) }),
      pending("urgent", { urgency: "URGENT", createdAt: minutesAgo(60) }),
      pending("emergency-old", { urgency: "EMERGENCY", createdAt: minutesAgo(30) }),
      pending("approved", { state: "APPROVED", createdAt: minutesAgo(900) }),
    ];
    expect(waitingRequests(items, undefined).map((r) => r.id)).toEqual([
      "emergency-old",
      "emergency-new",
      "routine-old",
      "urgent",
    ]);
  });

  it("keeps only the picked bank's requests, and sorts a bad date last", () => {
    const other = { ...BANK, id: "bank-2" };
    const items = [
      pending("bad-date", { createdAt: "not a date" }),
      pending("other-bank", { bank: other }),
      pending("ok", { createdAt: minutesAgo(1) }),
    ];
    expect(waitingRequests(items, BANK.id).map((r) => r.id)).toEqual(["ok", "bad-date"]);
  });
});

describe("readPendingRequests", () => {
  const page = (items: BloodRequest[], totalItems: number) =>
    Promise.resolve({ data: { items, page: 0, size: PENDING_PAGE_SIZE, totalItems }, status: 200, requestId: "r", headers: new Headers() });

  it("reads page after page until it has them all", async () => {
    const list = vi
      .fn()
      .mockReturnValueOnce(page(Array.from({ length: 100 }, (_, i) => pending(`a${i}`, {})), 150))
      .mockReturnValueOnce(page(Array.from({ length: 50 }, (_, i) => pending(`b${i}`, {})), 150));
    const result = await readPendingRequests(list);
    expect(result.items).toHaveLength(150);
    expect(result.truncatedAt).toBeNull();
    expect(list.mock.calls.map((call) => call[0])).toEqual([
      { state: "PENDING", page: 0, size: 100 },
      { state: "PENDING", page: 1, size: 100 },
    ]);
  });

  it("stops at the page limit and says how many it read (Prism makes up totalItems)", async () => {
    const list = vi.fn().mockImplementation(() => page([pending("same", {})], 2147483647));
    const result = await readPendingRequests(list);
    expect(list).toHaveBeenCalledTimes(PENDING_PAGE_LIMIT);
    expect(result.truncatedAt).toBe(PENDING_PAGE_LIMIT);
  });
});

describe("availableFor and unitsLabel", () => {
  it("finds the request's group, or null when it wasn't sent", () => {
    const d = simulateDashboard("SAMPLE", NOW, BANK);
    expect(availableFor(d, pending("x", { bloodGroup: "O", rhesus: "NEGATIVE" }))).toBe(7);
    expect(availableFor({ availableByGroup: [] }, pending("x", {}))).toBeNull();
    expect(unitsLabel(1)).toBe("1 unit");
    expect(unitsLabel(3)).toBe("3 units");
  });
});

describe("nextHoldLeft", () => {
  it("gives the time left on the next running hold, skipping lapsed ones", () => {
    const hold = (minutes: number) => ({ ...simulateDashboard("SAMPLE", NOW, BANK).holdsEndingSoon[0], holdExpiresAt: new Date(NOW + minutes * 60_000).toISOString() });
    expect(nextHoldLeft([hold(-1), hold(28)], NOW)).toBe("28m");
    expect(nextHoldLeft([hold(75)], NOW)).toBe("1h 15m");
    expect(nextHoldLeft([hold(0.5)], NOW)).toBe("less than a minute");
    expect(nextHoldLeft([hold(-1)], NOW)).toBeNull();
    expect(nextHoldLeft([], NOW)).toBeNull();
  });
});

describe("Lagos days and times", () => {
  // NOW is 13:00 on Thursday 29 October in Lagos.
  it("names the Lagos day, which can differ from the UTC one", () => {
    expect(lagosDayLabel(NOW)).toBe("Thursday 29 October");
    expect(lagosDayLabel(Date.parse("2026-10-29T23:30:00Z"))).toBe("Friday 30 October");
  });

  it("gives the time today, Yesterday before that, then the date; never 'ago'", () => {
    expect(lagosWhen("2026-10-29T07:12:00Z", NOW)).toBe("08:12");
    expect(lagosWhen("2026-10-28T22:59:00Z", NOW)).toBe("Yesterday 23:59");
    expect(lagosWhen("2026-10-28T23:30:00Z", NOW)).toBe("00:30");
    expect(lagosWhen("2026-10-26T07:12:00Z", NOW)).toBe("26 Oct 08:12");
    expect(lagosWhen("not a date", NOW)).toBe("not a date");
  });
});

describe("activitySentence", () => {
  it("builds one sentence from the entry's fields", () => {
    expect(
      activitySentence({ at: "", event: "APPROVED", subject: "REQUEST", reference: "REQ-1", actor: "Tunde Bakare", note: null }),
    ).toBe("Request REQ-1: approved, units reserved (Tunde Bakare).");
    expect(activitySentence({ at: "", event: "BOOKED", subject: "BOOKING", reference: "2026-11-01 10:00", actor: "Ngozi" })).toBe(
      "Booking 2026-11-01 10:00: booked (Ngozi).",
    );
  });
});
