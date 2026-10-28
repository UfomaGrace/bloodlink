// Expiry: whether a blood unit has passed its expiry date.
//
// - The contract (UnitCreate.expiryDate) says the unit "may be used up to and including this
//   date". So a unit is expired only once expiryDate < today: on its expiry date it is still usable.
// - "Today" is the calendar date in Africa/Lagos, where the banks are, not the browser's date.
//   Lagos is UTC+1 all year, so 23:30 UTC on 30 November is already 1 December there.
// - Dates are "YYYY-MM-DD" strings, which compare correctly as text.
// - `now` is passed in (milliseconds), so the helpers stay pure and easy to test.

const LAGOS_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar date in Lagos at `now`, as "YYYY-MM-DD". */
export function lagosToday(now: number): string {
  const parts = LAGOS_DATE.formatToParts(new Date(now));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** True once the Lagos date at `now` is after `expiryDate`. Usable on the expiry date itself. */
export function isUnitExpired(expiryDate: string, now: number): boolean {
  return expiryDate < lagosToday(now);
}
