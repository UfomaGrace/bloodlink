import { describe, expect, it } from "vitest";
import { daysUntilExpiry, isUnitExpired, lagosToday } from "./expiry";

const at = (iso: string) => Date.parse(iso);

describe("lagosToday", () => {
  it("is the Lagos date, an hour ahead of UTC", () => {
    expect(lagosToday(at("2026-11-30T12:00:00Z"))).toBe("2026-11-30");
    expect(lagosToday(at("2026-11-30T22:59:59Z"))).toBe("2026-11-30");
    // Midnight in Lagos is 23:00 UTC the day before.
    expect(lagosToday(at("2026-11-30T23:00:00Z"))).toBe("2026-12-01");
    expect(lagosToday(at("2026-11-30T23:30:00Z"))).toBe("2026-12-01");
  });

  it("crosses a year end", () => {
    expect(lagosToday(at("2026-12-31T23:15:00Z"))).toBe("2027-01-01");
  });
});

describe("isUnitExpired", () => {
  const expiry = "2026-11-30";

  it("is usable the day before its expiry date", () => {
    expect(isUnitExpired(expiry, at("2026-11-29T12:00:00Z"))).toBe(false);
  });

  it("is usable on its expiry date, to the end of that day in Lagos", () => {
    expect(isUnitExpired(expiry, at("2026-11-30T00:00:00Z"))).toBe(false);
    expect(isUnitExpired(expiry, at("2026-11-30T22:59:59Z"))).toBe(false);
  });

  it("is expired the day after", () => {
    expect(isUnitExpired(expiry, at("2026-12-01T12:00:00Z"))).toBe(true);
  });

  it("is expired from Lagos midnight, while it is still the expiry date in UTC", () => {
    expect(isUnitExpired(expiry, at("2026-11-30T23:00:00Z"))).toBe(true);
  });

  it("is still usable just after UTC midnight before the expiry date, when Lagos is on the same day", () => {
    // 29 Nov 23:30 UTC is 30 Nov 00:30 in Lagos: the expiry date, so still usable.
    expect(isUnitExpired(expiry, at("2026-11-29T23:30:00Z"))).toBe(false);
  });
});

describe("daysUntilExpiry", () => {
  const now = at("2026-10-29T12:00:00Z"); // 13:00 in Lagos

  it("counts Lagos calendar days", () => {
    expect(daysUntilExpiry("2026-10-29", now)).toBe(0);
    expect(daysUntilExpiry("2026-11-01", now)).toBe(3);
    expect(daysUntilExpiry("2026-10-28", now)).toBe(-1);
    // 23:30 UTC on 31 Oct is already 1 Nov in Lagos.
    expect(daysUntilExpiry("2026-11-01", at("2026-10-31T23:30:00Z"))).toBe(0);
  });

  it("is NaN for something that is not a date", () => {
    expect(daysUntilExpiry("soon", now)).toBeNaN();
  });
});
