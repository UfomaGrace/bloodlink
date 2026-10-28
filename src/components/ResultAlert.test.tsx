// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { ResultAlert } from "./ResultAlert";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const conflict = new ApiError({
  status: 409,
  code: "REQUEST_NOT_PENDING",
  message: "This request was already decided.",
  requestId: "ref-123",
});

describe("ResultAlert", () => {
  it("shows a success as a polite status, not an alert", () => {
    render(<ResultAlert notice={{ tone: "success", message: "Request declined." }} />);
    expect(screen.getByRole("status")).toHaveProperty("textContent", "Request declined.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows info (an unconfirmed outcome) as a polite status", () => {
    render(<ResultAlert notice={{ tone: "info", message: "We couldn't confirm. The request now shows as Fulfilled." }} />);
    expect(screen.getByRole("status").textContent).toBe("We couldn't confirm. The request now shows as Fulfilled.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an error as an alert with the service's message and the reference", () => {
    render(<ResultAlert notice={{ tone: "error", error: conflict }} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("This request was already decided.");
    expect(alert.textContent).toContain("Reference: ref-123");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("takes focus after a tick, for success and for errors", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ResultAlert notice={{ tone: "success", message: "Approved." }} />);
    act(() => vi.runAllTimers());
    expect(document.activeElement).toBe(screen.getByRole("status"));

    rerender(<ResultAlert notice={{ tone: "error", error: conflict }} />);
    act(() => vi.runAllTimers());
    expect(document.activeElement).toBe(screen.getByRole("alert"));
  });
});
