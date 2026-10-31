// Calendar: a donor's booking as an .ics file, built in the browser (RFC 5545).
//
// - Times are written in UTC ("20261031T090000Z"), so every calendar shows them in its own zone.
// - LOCATION is the bank's name and area. Text is escaped (\\ ; , and newlines) and long lines are
//   folded at 75 octets, as the format requires.
// - bookingIcs is pure (`now` is passed in for DTSTAMP); downloadIcs hands the text to the browser.

import type { Booking } from "../api/types";
import { lagosToday } from "./expiry";

const CRLF = "\r\n";
const MAX_LINE_OCTETS = 75;

/** "2026-10-31T09:00:00.000Z" → "20261031T090000Z". */
export function icsUtc(time: number | string): string {
  return new Date(time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapes a TEXT value: backslash, semicolon, comma, newline. */
export function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 octets: CRLF and a space before each continuation. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, which counts towards their 75.
    const limit = chunks.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      chunks.push(chunk);
      chunk = "";
      octets = 0;
    }
    chunk += char;
    octets += size;
  }
  chunks.push(chunk);
  return chunks.join(`${CRLF} `);
}

/** The booking as a one-event calendar. */
export function bookingIcs(booking: Booking, now: number): string {
  const { slot } = booking;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BloodLink//Donation booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.id}@bloodlink`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(slot.startsAt)}`,
    `DTEND:${icsUtc(slot.endsAt)}`,
    `SUMMARY:${icsText("Blood donation")}`,
    `LOCATION:${icsText(`${slot.bank.name}, ${slot.bank.area}`)}`,
    `DESCRIPTION:${icsText("Your BloodLink booking. Eat a proper meal and drink water first, and bring a photo ID.")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}

/** "bloodlink-donation-2026-10-31.ics", named for the slot's Lagos date. */
export function bookingIcsFileName(booking: Booking): string {
  return `bloodlink-donation-${lagosToday(Date.parse(booking.slot.startsAt))}.ics`;
}

/** Saves `text` as `fileName` through a temporary link. */
export function downloadIcs(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers read the URL after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
