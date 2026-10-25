import { describe, expect, it } from "vitest";
import {
  bloodTypeLabel,
  COMPONENT_LABELS,
  COMPONENT_OPTIONS,
  formatDate,
  formatDateTime,
  formatTime,
  historyEventLabel,
  isKeyOf,
  REQUEST_STATE_LABELS,
  REQUEST_STATE_OPTIONS,
  REQUEST_STATE_TONES,
  requestItemLabel,
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_TONES,
  timeAgo,
  UNIT_STATE_LABELS,
  URGENCY_OPTIONS,
} from "./labels";

describe("timeAgo", () => {
  const computedAt = "2026-10-26T10:02:11Z";
  const at = (iso: string) => Date.parse(iso);

  it("says just now under a minute, and for a time slightly ahead", () => {
    expect(timeAgo(computedAt, at("2026-10-26T10:02:11Z"))).toBe("just now");
    expect(timeAgo(computedAt, at("2026-10-26T10:03:10Z"))).toBe("just now");
    expect(timeAgo(computedAt, at("2026-10-26T10:01:00Z"))).toBe("just now");
  });

  it("counts minutes, hours and days", () => {
    expect(timeAgo(computedAt, at("2026-10-26T10:03:11Z"))).toBe("1 min ago");
    expect(timeAgo(computedAt, at("2026-10-26T10:04:30Z"))).toBe("2 min ago");
    expect(timeAgo(computedAt, at("2026-10-26T11:01:00Z"))).toBe("58 min ago");
    expect(timeAgo(computedAt, at("2026-10-26T11:02:11Z"))).toBe("1 hour ago");
    expect(timeAgo(computedAt, at("2026-10-26T15:30:00Z"))).toBe("5 hours ago");
    expect(timeAgo(computedAt, at("2026-10-27T10:02:11Z"))).toBe("1 day ago");
    expect(timeAgo(computedAt, at("2026-10-29T12:00:00Z"))).toBe("3 days ago");
  });

  it("returns an empty string for anything that isn't a date-time", () => {
    expect(timeAgo("soon", at(computedAt))).toBe("");
  });
});

describe("formatTime", () => {
  it("shows the local hour and minute", () => {
    // Built in local time, so the test passes in any time zone.
    const local = new Date(2026, 9, 26, 10, 2, 11).toISOString();
    expect(formatTime(local)).toBe("10:02");
  });

  it("returns anything else unchanged", () => {
    expect(formatTime("not a time")).toBe("not a time");
  });
});

describe("bloodTypeLabel", () => {
  it("joins group and rhesus sign", () => {
    expect(bloodTypeLabel("O", "NEGATIVE")).toBe("O−");
    expect(bloodTypeLabel("AB", "POSITIVE")).toBe("AB+");
  });
});

describe("formatDate", () => {
  it("formats a contract date", () => {
    expect(formatDate("2026-11-30")).toBe("30 Nov 2026");
    expect(formatDate("2026-01-05")).toBe("5 Jan 2026");
  });

  it("returns anything else unchanged", () => {
    expect(formatDate("not a date")).toBe("not a date");
    expect(formatDate("2026-13-01")).toBe("2026-13-01");
  });
});

describe("isKeyOf", () => {
  it("accepts known keys only", () => {
    expect(isKeyOf(UNIT_STATE_LABELS, "AVAILABLE")).toBe(true);
    expect(isKeyOf(UNIT_STATE_LABELS, "available")).toBe(false);
    expect(isKeyOf(UNIT_STATE_LABELS, "toString")).toBe(false);
    expect(isKeyOf(UNIT_STATE_LABELS, null)).toBe(false);
  });
});

describe("options", () => {
  it("lists every value with its readable label", () => {
    expect(COMPONENT_OPTIONS).toContainEqual({ value: "RED_CELLS", label: "Red cells" });
    expect(COMPONENT_OPTIONS).toHaveLength(Object.keys(COMPONENT_LABELS).length);
  });
});

describe("urgency", () => {
  it("lists the urgencies from least to most urgent", () => {
    expect(URGENCY_OPTIONS).toEqual([
      { value: "ROUTINE", label: "Routine" },
      { value: "URGENT", label: "Urgent" },
      { value: "EMERGENCY", label: "Emergency" },
    ]);
  });
});

describe("formatDateTime", () => {
  it("shows the local date and time", () => {
    const local = new Date(2026, 9, 26, 14, 0).toISOString();
    expect(formatDateTime(local)).toBe("26 Oct 2026, 14:00");
  });

  it("returns anything else unchanged", () => {
    expect(formatDateTime("soon")).toBe("soon");
  });
});

describe("request states", () => {
  it("gives every state a label and a tone, listed as options", () => {
    expect(REQUEST_STATE_LABELS.LAPSED).toBe("Hold lapsed");
    expect(Object.keys(REQUEST_STATE_TONES)).toEqual(Object.keys(REQUEST_STATE_LABELS));
    expect(REQUEST_STATE_OPTIONS).toContainEqual({ value: "PENDING", label: "Pending" });
    expect(REQUEST_STATE_OPTIONS).toHaveLength(7);
  });
});

describe("reservation statuses", () => {
  it("gives every status a label and a tone", () => {
    expect(RESERVATION_STATUS_LABELS.ACTIVE).toBe("On hold");
    expect(Object.keys(RESERVATION_STATUS_TONES)).toEqual(Object.keys(RESERVATION_STATUS_LABELS));
  });
});

describe("historyEventLabel", () => {
  it("uses the known wording", () => {
    expect(historyEventLabel("CREATED")).toBe("Request sent");
    expect(historyEventLabel("HOLD_LAPSED")).toBe("Hold lapsed, units released");
  });

  it("turns an unknown event into readable words", () => {
    expect(historyEventLabel("UNITS_RELEASED")).toBe("Units released");
    expect(historyEventLabel("toString")).toBe("Tostring");
    expect(historyEventLabel("")).toBe("");
  });
});

describe("requestItemLabel", () => {
  it("joins blood type, component and quantity", () => {
    expect(requestItemLabel("O", "NEGATIVE", "RED_CELLS", 2)).toBe("O− red cells × 2");
    expect(requestItemLabel("AB", "POSITIVE", "PLATELETS", 1)).toBe("AB+ platelets × 1");
  });
});
