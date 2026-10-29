import { describe, expect, it } from "vitest";
import * as Yup from "yup";
import {
  bloodGroup,
  cancelReason,
  dateAfter,
  dateNotInFuture,
  declineReason,
  localDateTimeInput,
  localDateTimeToIso,
  neededByFuture,
  quantity,
  reversalReason,
  todayIso,
  unitReference,
  urgency,
} from "./validation";

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
