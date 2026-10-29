// Validation: Yup pieces that match the rules in contract/openapi.yaml.
// Build a form's schema from these so every form checks the same thing the same way.
//
//   Yup.object({
//     reference: unitReference(),
//     collectionDate: dateNotInFuture("collection date"),
//     expiryDate: dateAfter("expiry date", "collectionDate", "collection date"),
//   })
//
// - Messages are plain English and say what to do ("Choose the blood group.").
// - Dates are "YYYY-MM-DD" strings (what <input type="date"> gives and the contract
//   expects). Strings in that format compare correctly as text, so "after" is just ">".
// - Date-times are typed into <input type="datetime-local">, which gives local time with no
//   offset ("2026-10-26T14:00"). localDateTimeToIso turns that into the contract's ISO instant.

import * as Yup from "yup";
import { BLOOD_GROUP_LABELS, COMPONENT_LABELS, keysOf, RHESUS_LABELS, URGENCY_LABELS } from "./labels";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export const MAX_REQUEST_QUANTITY = 20;
export const DECLINE_REASON_MIN = 3;
export const DECLINE_REASON_MAX = 500;
// Cancellation.reason in the contract: 3–500 characters.
export const CANCEL_REASON_MIN = 3;
export const CANCEL_REASON_MAX = 500;

/** The given day (default today, in the user's time zone) as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The given moment (default now) as "YYYY-MM-DDTHH:mm" local time, for a datetime-local's min. */
export function localDateTimeInput(now: Date = new Date()): string {
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${todayIso(now)}T${hours}:${minutes}`;
}

/** A datetime-local value ("2026-10-26T14:00", local time) as an ISO instant, or null if it isn't one. */
export function localDateTimeToIso(value: string): string | null {
  if (!LOCAL_DATE_TIME.test(value)) return null;
  // No offset in the string, so Date reads it as local time.
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const bloodGroup = () =>
  Yup.string().required("Choose the blood group.").oneOf(keysOf(BLOOD_GROUP_LABELS), "Choose the blood group.");

export const rhesus = () =>
  Yup.string().required("Choose the rhesus type.").oneOf(keysOf(RHESUS_LABELS), "Choose the rhesus type.");

export const component = () =>
  Yup.string().required("Choose the component.").oneOf(keysOf(COMPONENT_LABELS), "Choose the component.");

export const urgency = () =>
  Yup.string().required("Choose how urgent this is.").oneOf(keysOf(URGENCY_LABELS), "Choose how urgent this is.");

/** A whole number of units, 1–20. An empty number input ("") counts as missing. */
export const quantity = () =>
  Yup.number()
    .transform((value: number, original: unknown) => (original === "" ? undefined : value))
    .typeError("Enter the number of units as a whole number.")
    .required("Enter how many units you need.")
    .integer("Enter a whole number of units.")
    .min(1, "Request at least 1 unit.")
    .max(MAX_REQUEST_QUANTITY, `You can request at most ${MAX_REQUEST_QUANTITY} units at a time.`);

/**
 * A required datetime-local value later than now. `now` is only there for tests.
 * The service checks again on arrival, so a time that passes while the form is open is still caught.
 */
export const neededByFuture = (now: () => number = Date.now) =>
  Yup.string()
    .required("Enter when the blood is needed.")
    .test("date-time", "Enter a full date and time.", (value) => !value || localDateTimeToIso(value) !== null)
    .test("future", "Choose a time later than now.", (value) => {
      const iso = value ? localDateTimeToIso(value) : null;
      return iso === null || Date.parse(iso) > now();
    });

/** 1–40 letters, numbers and hyphens. Unique within the bank (only the server can check that: 409). */
export const unitReference = () =>
  Yup.string()
    .trim()
    .required("Enter the unit reference.")
    .max(40, "The reference can be at most 40 characters.")
    .matches(/^[A-Za-z0-9-]+$/, "Use only letters, numbers and hyphens, like LCB-2026-00042.");

/** A required "YYYY-MM-DD" date. `label` is lower case, e.g. "collection date". */
export const isoDate = (label: string) =>
  Yup.string().required(`Enter the ${label}.`).matches(ISO_DATE, `Enter the ${label} as a full date.`);

/** A required date that is today or earlier. */
export const dateNotInFuture = (label: string) =>
  isoDate(label).test("not-in-future", `The ${label} can't be in the future.`, (value) => !value || value <= todayIso());

/**
 * A required date strictly after another date field in the same object.
 * dateAfter("expiry date", "collectionDate", "collection date")
 *   → "Expiry date must be after the collection date."
 * Passes while the other field is empty; that field reports its own error.
 */
export const dateAfter = (label: string, otherField: string, otherLabel: string) =>
  isoDate(label).test("after", `${capitalise(label)} must be after the ${otherLabel}.`, function (value) {
    const other: unknown = this.parent?.[otherField];
    if (!value || typeof other !== "string" || !other) return true;
    return value > other;
  });

/** Why the bank declines a request: 3–500 characters, counted after trimming spaces. */
export const declineReason = () =>
  Yup.string()
    .trim()
    .required("Enter a reason for declining.")
    .min(DECLINE_REASON_MIN, `Write at least ${DECLINE_REASON_MIN} characters.`)
    .max(DECLINE_REASON_MAX, `The reason can be at most ${DECLINE_REASON_MAX} characters.`);

/** Why the hospital cancels its request: 3–500 characters after trimming (contract Cancellation). */
export const cancelReason = () =>
  Yup.string()
    .trim()
    .required("Enter a reason for cancelling.")
    .min(CANCEL_REASON_MIN, `Write at least ${CANCEL_REASON_MIN} characters.`)
    .max(CANCEL_REASON_MAX, `The reason can be at most ${CANCEL_REASON_MAX} characters.`);
