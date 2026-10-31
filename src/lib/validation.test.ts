import { describe, expect, it } from "vitest";
import * as Yup from "yup";
import {
  bloodGroup,
  cancelReason,
  dateAfter,
  dateNotInFuture,
  declineReason,
  isoDate,
  localDateTimeInput,
  localDateTimeToIso,
  neededByFuture,
  quantity,
  reversalReason,
  slotCapacity,
  slotDate,
  slotEndTime,
  slotStartTime,
  todayIso,
  unitReference,
  urgency,
} from "./validation";
import { isWithinDateBounds } from "./dateBounds";

/** The first error message, or null when valid. */
function errorOf(schema: Yup.Schema, value: unknown): string | null {
  try {
    schema.validateSync(value);
    return null;
  } catch (e) {
    return e instanceof Yup.ValidationError ? e.message : String(e);
  }
}

describe("todayIso", () => {
  it("pads month and day", () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("unitReference", () => {
  it("accepts letters, numbers and hyphens up to 40", () => {
    expect(errorOf(unitReference(), "LCB-2026-00042")).toBeNull();
    expect(errorOf(unitReference(), "A".repeat(40))).toBeNull();
  });

  it("rejects empty, too long and other characters", () => {
    expect(errorOf(unitReference(), "")).toBe("Enter the unit reference.");
    expect(errorOf(unitReference(), "A".repeat(41))).toBe("The reference can be at most 40 characters.");
    expect(errorOf(unitReference(), "LCB 01!")).toMatch(/letters, numbers and hyphens/);
  });
});

describe("bloodGroup", () => {
  it("needs one of the contract's groups", () => {
    expect(errorOf(bloodGroup(), "AB")).toBeNull();
    expect(errorOf(bloodGroup(), "")).toBe("Choose the blood group.");
    expect(errorOf(bloodGroup(), "Z")).toBe("Choose the blood group.");
  });
});

describe("dateNotInFuture", () => {
  it("allows today and rejects tomorrow", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(errorOf(dateNotInFuture("collection date"), todayIso())).toBeNull();
    expect(errorOf(dateNotInFuture("collection date"), todayIso(tomorrow))).toBe(
      "The collection date can't be in the future.",
    );
  });

  it("collection date: from 1 Jan 2000 (contract UnitCreate)", () => {
    expect(errorOf(dateNotInFuture("collection date"), "2000-01-01")).toBeNull();
    expect(errorOf(dateNotInFuture("collection date"), "1999-12-31")).toBe(
      "The collection date can't be before 1 Jan 2000.",
    );
  });
});

describe("date bounds (every date sent is from 2000-01-01 to 2100-12-31)", () => {
  it("isoDate accepts both edge days and refuses the days just outside", () => {
    expect(errorOf(isoDate("date"), "2000-01-01")).toBeNull();
    expect(errorOf(isoDate("date"), "2100-12-31")).toBeNull();
    expect(errorOf(isoDate("date"), "1999-12-31")).toBe("The date can't be before 1 Jan 2000.");
    expect(errorOf(isoDate("date"), "2101-01-01")).toBe("The date can't be after 31 Dec 2100.");
  });

  it("dateBounds agrees with the form checks", () => {
    expect(isWithinDateBounds("2000-01-01")).toBe(true);
    expect(isWithinDateBounds("2100-12-31")).toBe(true);
    expect(isWithinDateBounds("1999-12-31")).toBe(false);
    expect(isWithinDateBounds("2101-01-01")).toBe(false);
  });
});

describe("dateAfter", () => {
  const schema = Yup.object({
    collectionDate: Yup.string(),
    expiryDate: dateAfter("expiry date", "collectionDate", "collection date"),
  });

  it("needs a date strictly after the other field", () => {
    expect(errorOf(schema, { collectionDate: "2026-10-20", expiryDate: "2026-11-30" })).toBeNull();
    expect(errorOf(schema, { collectionDate: "2026-10-20", expiryDate: "2026-10-20" })).toBe(
      "Expiry date must be after the collection date.",
    );
  });

  it("waits for the other field before comparing", () => {
    expect(errorOf(schema, { collectionDate: "", expiryDate: "2026-11-30" })).toBeNull();
  });

  it("expiry date: up to 31 Dec 2100 (contract UnitCreate)", () => {
    expect(errorOf(schema, { collectionDate: "2026-10-20", expiryDate: "2100-12-31" })).toBeNull();
    expect(errorOf(schema, { collectionDate: "2026-10-20", expiryDate: "2101-01-01" })).toBe(
      "The expiry date can't be after 31 Dec 2100.",
    );
  });
});

describe("quantity", () => {
  it("accepts whole numbers from 1 to 20", () => {
    expect(errorOf(quantity(), 1)).toBeNull();
    expect(errorOf(quantity(), 20)).toBeNull();
  });

  it("rejects empty, out of range and fractions", () => {
    expect(errorOf(quantity(), "")).toBe("Enter how many units you need.");
    expect(errorOf(quantity(), 0)).toBe("Request at least 1 unit.");
    expect(errorOf(quantity(), 21)).toBe("You can request at most 20 units at a time.");
    expect(errorOf(quantity(), 1.5)).toBe("Enter a whole number of units.");
    expect(errorOf(quantity(), "lots")).toBe("Enter the number of units as a whole number.");
  });
});

describe("urgency", () => {
  it("needs one of the contract's urgencies", () => {
    expect(errorOf(urgency(), "EMERGENCY")).toBeNull();
    expect(errorOf(urgency(), "")).toBe("Choose how urgent this is.");
    expect(errorOf(urgency(), "ASAP")).toBe("Choose how urgent this is.");
  });
});

describe("localDateTimeInput", () => {
  it("pads every part", () => {
    expect(localDateTimeInput(new Date(2026, 0, 5, 7, 3))).toBe("2026-01-05T07:03");
  });
});

describe("localDateTimeToIso", () => {
  it("reads the value as local time", () => {
    // Built in local time, so the test passes in any time zone.
    expect(localDateTimeToIso("2026-10-26T14:00")).toBe(new Date(2026, 9, 26, 14, 0).toISOString());
  });

  it("returns null for anything else", () => {
    expect(localDateTimeToIso("")).toBeNull();
    expect(localDateTimeToIso("2026-10-26")).toBeNull();
    expect(localDateTimeToIso("2026-13-45T10:00")).toBeNull();
  });
});

describe("neededByFuture", () => {
  const now = () => new Date(2026, 9, 26, 12, 0).getTime();

  it("accepts a time after now", () => {
    expect(errorOf(neededByFuture(now), "2026-10-26T12:01")).toBeNull();
  });

  it("rejects now, the past, empty and partial values", () => {
    expect(errorOf(neededByFuture(now), "2026-10-26T12:00")).toBe("Choose a time later than now.");
    expect(errorOf(neededByFuture(now), "2026-10-25T18:00")).toBe("Choose a time later than now.");
    expect(errorOf(neededByFuture(now), "")).toBe("Enter when the blood is needed.");
    expect(errorOf(neededByFuture(now), "2026-10-26")).toBe("Enter a full date and time.");
  });

  it("no later than 31 Dec 2100 (contract BloodRequestCreate)", () => {
    // Midday, so the instant stays on the same date in any test time zone.
    expect(errorOf(neededByFuture(now), "2100-12-31T12:00")).toBeNull();
    expect(errorOf(neededByFuture(now), "2101-01-01T12:00")).toBe("Choose a time no later than 31 Dec 2100.");
  });
});

describe("declineReason", () => {
  it("accepts 3 to 500 characters", () => {
    expect(errorOf(declineReason(), "Out")).toBeNull();
    expect(errorOf(declineReason(), "A".repeat(500))).toBeNull();
  });

  it("rejects empty, blank, too short and too long", () => {
    expect(errorOf(declineReason(), "")).toBe("Enter a reason for declining.");
    expect(errorOf(declineReason(), "   ")).toBe("Enter a reason for declining.");
    expect(errorOf(declineReason(), "  no  ")).toBe("Write at least 3 characters.");
    expect(errorOf(declineReason(), "A".repeat(501))).toBe("The reason can be at most 500 characters.");
  });
});

describe("cancelReason", () => {
  it("accepts 3 to 500 characters", () => {
    expect(errorOf(cancelReason(), "Gone")).toBeNull();
    expect(errorOf(cancelReason(), "A".repeat(500))).toBeNull();
  });

  it("rejects empty, blank, too short and too long", () => {
    expect(errorOf(cancelReason(), "")).toBe("Enter a reason for cancelling.");
    expect(errorOf(cancelReason(), "   ")).toBe("Enter a reason for cancelling.");
    expect(errorOf(cancelReason(), "  no  ")).toBe("Write at least 3 characters.");
    expect(errorOf(cancelReason(), "A".repeat(501))).toBe("The reason can be at most 500 characters.");
  });
});

describe("reversalReason", () => {
  it("accepts 3 to 500 characters", () => {
    expect(errorOf(reversalReason(), "Err")).toBeNull();
    expect(errorOf(reversalReason(), "A".repeat(500))).toBeNull();
  });

  it("rejects empty, blank, too short and too long", () => {
    expect(errorOf(reversalReason(), "")).toBe("Enter a reason for reversing the issue.");
    expect(errorOf(reversalReason(), "   ")).toBe("Enter a reason for reversing the issue.");
    expect(errorOf(reversalReason(), "  no  ")).toBe("Write at least 3 characters.");
    expect(errorOf(reversalReason(), "A".repeat(501))).toBe("The reason can be at most 500 characters.");
  });
});

describe("donation slot fields (DonationSlotCreate)", () => {
  // 10:00 UTC = 11:00 in Lagos on 29 Oct.
  const NOW = () => Date.parse("2026-10-29T10:00:00Z");
  const schema = Yup.object({
    date: slotDate(NOW),
    startTime: slotStartTime(NOW),
    endTime: slotEndTime(),
    capacity: slotCapacity(),
  });
  const valid = { date: "2026-10-30", startTime: "09:00", endTime: "11:00", capacity: "10" };
  const check = (changes: Partial<typeof valid>) => errorOf(schema, { ...valid, ...changes });

  it("accepts a slot tomorrow", () => {
    expect(check({})).toBeNull();
  });

  it("date: today in Lagos or later", () => {
    expect(check({ date: "" })).toBe("Enter the date.");
    expect(errorOf(slotDate(NOW), "2026-10-28")).toBe("Choose today or a later date.");
    expect(errorOf(slotDate(NOW), "2026-10-29")).toBeNull();
    expect(errorOf(slotDate(() => Date.parse("2026-10-29T23:30:00Z")), "2026-10-29")).toBe("Choose today or a later date.");
  });

  it("date: no later than 31 Dec 2100", () => {
    expect(errorOf(slotDate(NOW), "2100-12-31")).toBeNull();
    expect(errorOf(slotDate(NOW), "2101-01-01")).toBe("The date can't be after 31 Dec 2100.");
  });

  it("start: later than now, read as Lagos time", () => {
    expect(check({ date: "2026-10-29", startTime: "10:59", endTime: "12:00" })).toBe("Choose a start time later than now.");
    expect(check({ date: "2026-10-29", startTime: "11:01", endTime: "12:00" })).toBeNull();
    expect(check({ startTime: "" })).toBe("Enter the start time.");
    expect(check({ startTime: "9am" })).toBe("Enter the start time as hours and minutes, like 09:00.");
  });

  it("end: after the start", () => {
    expect(check({ endTime: "09:00" })).toBe("The end time must be after the start time.");
    expect(check({ endTime: "08:30" })).toBe("The end time must be after the start time.");
  });

  it("end: at most 8 hours after the start (the contract's rule)", () => {
    expect(check({ endTime: "17:00" })).toBeNull();
    expect(check({ endTime: "17:01" })).toBe("A slot can be at most 8 hours long.");
  });

  it("capacity: a whole number, 1 to 50", () => {
    expect(check({ capacity: "" })).toBe("Enter how many donors can book.");
    expect(check({ capacity: "0" })).toBe("A slot needs at least 1 place.");
    expect(check({ capacity: "1" })).toBeNull();
    expect(check({ capacity: "50" })).toBeNull();
    expect(check({ capacity: "51" })).toBe("A slot can have at most 50 places.");
    expect(check({ capacity: "2.5" })).toBe("Enter a whole number of places.");
    expect(check({ capacity: "ten" })).toBe("Enter the number of places as a whole number.");
  });
});
