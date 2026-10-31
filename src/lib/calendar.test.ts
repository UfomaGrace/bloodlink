// calendar: a booking as .ics text: UTC times, the bank as LOCATION, escaping, CRLF and folding.
import { describe, expect, it } from "vitest";
import type { Booking } from "../api/types";
import { bookingIcs, bookingIcsFileName, icsText, icsUtc } from "./calendar";

const BOOKING: Booking = {
  id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c07",
  slot: {
    id: "s1",
    bank: { id: "b1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" },
    startsAt: "2026-10-31T09:00:00Z",
    endsAt: "2026-10-31T11:00:00Z",
    capacity: 10,
    booked: 7,
    placesLeft: 3,
  },
  donor: { id: "d1", displayName: "Ngozi" },
  status: "BOOKED",
  createdAt: "2026-10-20T08:00:00Z",
};

const NOW = Date.parse("2026-10-30T15:04:05.678Z");

describe("bookingIcs", () => {
  it("is one event with UTC times and the bank and area as its location", () => {
    expect(bookingIcs(BOOKING, NOW).split("\r\n")).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//BloodLink//Donation booking//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c07@bloodlink",
      "DTSTAMP:20261030T150405Z",
      "DTSTART:20261031T090000Z",
      "DTEND:20261031T110000Z",
      "SUMMARY:Blood donation",
      "LOCATION:Lagos Central Blood Bank\\, Ikeja",
      // Folded at 75 octets: the continuation starts with a space.
      "DESCRIPTION:Your BloodLink booking. Eat a proper meal and drink water first",
      " \\, and bring a photo ID.",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]);
  });

  it("folds every line at 75 octets, counting multi-byte characters", () => {
    const long = { ...BOOKING, slot: { ...BOOKING.slot, bank: { ...BOOKING.slot.bank, name: "Ọ̀yọ́ ".repeat(30) } } };
    for (const line of bookingIcs(long, NOW).split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("names the file for the slot's Lagos date", () => {
    const lateNight = { ...BOOKING, slot: { ...BOOKING.slot, startsAt: "2026-10-31T23:30:00Z" } };
    expect(bookingIcsFileName(BOOKING)).toBe("bloodlink-donation-2026-10-31.ics");
    expect(bookingIcsFileName(lateNight)).toBe("bloodlink-donation-2026-11-01.ics");
  });
});

describe("helpers", () => {
  it("icsUtc drops separators and milliseconds", () => {
    expect(icsUtc("2026-10-31T09:00:00.000Z")).toBe("20261031T090000Z");
  });

  it("icsText escapes backslash, semicolon, comma and newlines", () => {
    expect(icsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });
});
