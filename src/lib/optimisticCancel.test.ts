import { describe, expect, it } from "vitest";
import { ApiError, type ClientErrorCode } from "../api/client";
import type { BloodRequest, Reservation } from "../api/types";
import {
  asCancelled,
  cancelOutcome,
  cancelRefusalError,
  endCancel,
  NO_CANCELS,
  reloadsAfterRefusal,
  startCancel,
  withCancels,
} from "./optimisticCancel";

function reservation(id: string, status: Reservation["status"]): Reservation {
  return {
    id,
    unit: { id: `u-${id}`, reference: `U-${id}`, expiryDate: "2026-11-30" },
    status,
    holdExpiresAt: "2026-10-28T12:00:00Z",
    createdAt: "2026-10-28T09:00:00Z",
  };
}

const approved = {
  id: "req-1",
  state: "APPROVED",
  reservations: [reservation("1", "ACTIVE"), reservation("2", "LAPSED")],
  history: [{ at: "2026-10-28T09:00:00Z", event: "APPROVED", actor: "Bank", note: null }],
} as unknown as BloodRequest;

const other = { ...approved, id: "req-2" } as BloodRequest;

function apiError(status: number, code: ClientErrorCode): ApiError {
  return new ApiError({ status, code, message: "Refused.", requestId: "ref-1" });
}

describe("asCancelled", () => {
  it("reads CANCELLED, ends running holds, and leaves other reservations and history alone", () => {
    const result = asCancelled(approved);
    expect(result.state).toBe("CANCELLED");
    expect(result.reservations.map((r) => r.status)).toEqual(["RELEASED", "LAPSED"]);
    expect(result.history).toBe(approved.history);
  });

  it("never changes the request it was given", () => {
    const before = JSON.stringify(approved);
    asCancelled(approved);
    expect(JSON.stringify(approved)).toBe(before);
  });
});

describe("the overlay", () => {
  it("shows only the request being cancelled as CANCELLED", () => {
    const overlay = startCancel(NO_CANCELS, "req-1");
    expect(withCancels(approved, overlay).state).toBe("CANCELLED");
    expect(withCancels(other, overlay)).toBe(other);
  });

  it("rolls back to the very same request it showed before", () => {
    const overlay = endCancel(startCancel(NO_CANCELS, "req-1"), "req-1");
    expect(withCancels(approved, overlay)).toBe(approved);
  });

  it("rolls back to a newer copy if a reload came in meanwhile", () => {
    const overlay = startCancel(NO_CANCELS, "req-1");
    const reloaded = { ...approved, state: "PENDING" } as BloodRequest;
    expect(withCancels(reloaded, endCancel(overlay, "req-1"))).toBe(reloaded);
  });

  it("keeps other requests' cancels when one ends, and never changes the overlay it was given", () => {
    const both = startCancel(startCancel(NO_CANCELS, "req-1"), "req-2");
    const one = endCancel(both, "req-1");
    expect([...one]).toEqual(["req-2"]);
    expect([...both]).toEqual(["req-1", "req-2"]);
    expect(NO_CANCELS.size).toBe(0);
  });

  it("returns the same overlay when ending a cancel it doesn't hold", () => {
    const overlay = startCancel(NO_CANCELS, "req-1");
    expect(endCancel(overlay, "req-9")).toBe(overlay);
  });
});

describe("cancelOutcome", () => {
  it("confirms on success", () => {
    expect(cancelOutcome(null)).toBe("confirmed");
  });

  it("keeps CANCELLED on screen until a reload answers after a lost connection", () => {
    expect(cancelOutcome(apiError(0, "TIMEOUT"))).toBe("await-reload");
    expect(cancelOutcome(apiError(0, "NETWORK_ERROR"))).toBe("await-reload");
  });

  it("rolls back on any refusal", () => {
    expect(cancelOutcome(apiError(409, "REQUEST_CLOSED"))).toBe("rollback");
    expect(cancelOutcome(apiError(403, "FORBIDDEN"))).toBe("rollback");
    expect(cancelOutcome(apiError(404, "NOT_FOUND"))).toBe("rollback");
    expect(cancelOutcome(apiError(422, "VALIDATION_FAILED"))).toBe("rollback");
    expect(cancelOutcome(apiError(500, "INTERNAL_ERROR"))).toBe("rollback");
  });
});

describe("reloadsAfterRefusal", () => {
  it("reloads after 409, 403 and 404, not after 422 or 500", () => {
    expect(reloadsAfterRefusal(apiError(409, "REQUEST_CLOSED"))).toBe(true);
    expect(reloadsAfterRefusal(apiError(403, "FORBIDDEN"))).toBe(true);
    expect(reloadsAfterRefusal(apiError(404, "NOT_FOUND"))).toBe(true);
    expect(reloadsAfterRefusal(apiError(422, "VALIDATION_FAILED"))).toBe(false);
    expect(reloadsAfterRefusal(apiError(500, "INTERNAL_ERROR"))).toBe(false);
  });
});

describe("cancelRefusalError", () => {
  it("gives 409 REQUEST_CLOSED our own message, keeping the code and Reference", () => {
    const shown = cancelRefusalError(apiError(409, "REQUEST_CLOSED"));
    expect(shown.message).toBe(
      "This request is already closed, so it can't be cancelled. Nothing changed. Its current status is shown.",
    );
    expect(shown.code).toBe("REQUEST_CLOSED");
    expect(shown.status).toBe(409);
    expect(shown.requestId).toBe(apiError(409, "REQUEST_CLOSED").requestId);
  });

  it("leaves every other refusal as the service sent it", () => {
    for (const error of [apiError(403, "FORBIDDEN"), apiError(404, "NOT_FOUND"), apiError(500, "INTERNAL_ERROR")]) {
      expect(cancelRefusalError(error)).toBe(error);
    }
  });
});
