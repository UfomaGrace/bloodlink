// @vitest-environment jsdom
// useServiceStatus: checking → ready (then hidden after 3 s), checking → failed, nothing in mock mode.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ health: vi.fn() }));
vi.mock("../api/endpoints", () => ({ api: mocks }));

// IS_MOCK is read from VITE_MOCK when api/client loads, so stub it and import a fresh copy.
async function load(mock: "true" | "false") {
  vi.stubEnv("VITE_MOCK", mock);
  vi.resetModules();
  const { useServiceStatus } = await import("./useServiceStatus");
  return renderHook(() => useServiceStatus());
}

beforeEach(() => {
  mocks.health.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("useServiceStatus", () => {
  it("goes from checking to ready, then hides after 3 s", async () => {
    let answer!: () => void;
    mocks.health.mockReturnValue(new Promise<void>((resolve) => (answer = resolve)));
    const { result } = await load("false");
    expect(result.current).toBe("checking");

    vi.useFakeTimers();
    await act(async () => answer());
    expect(result.current).toBe("ready");

    act(() => vi.advanceTimersByTime(2_999));
    expect(result.current).toBe("ready");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBeNull();
  });

  it("goes from checking to failed when the health check fails", async () => {
    let fail!: (e: unknown) => void;
    mocks.health.mockReturnValue(new Promise<void>((_, reject) => (fail = reject)));
    const { result } = await load("false");
    expect(result.current).toBe("checking");

    await act(async () => fail(new Error("timeout")));
    expect(result.current).toBe("failed");
  });

  it("does nothing against the mock server", async () => {
    const { result } = await load("true");
    expect(result.current).toBeNull();
    expect(mocks.health).not.toHaveBeenCalled();
  });
});
