// Date bounds: every date or time the interface sends falls between 2000-01-01 and 2100-12-31
// (contract info). Outside that, the service answers a body field with 422 and a query value with 400,
// so the forms and the URL filters stop such dates first.
//
// - Dates are "YYYY-MM-DD" strings, which compare correctly as text.
// - Its own module because both lib/validation and lib/donations use it (validation imports donations).

export const EARLIEST_DATE = "2000-01-01";
export const LATEST_DATE = "2100-12-31";
export const EARLIEST_DATE_LABEL = "1 Jan 2000";
export const LATEST_DATE_LABEL = "31 Dec 2100";

/** True for a "YYYY-MM-DD" date from 2000-01-01 to 2100-12-31, both included. */
export function isWithinDateBounds(date: string): boolean {
  return date >= EARLIEST_DATE && date <= LATEST_DATE;
}
