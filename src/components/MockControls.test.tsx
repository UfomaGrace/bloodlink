// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// IS_MOCK is read from VITE_MOCK when api/client loads, so each test sets the variable and then
// imports fresh copies of the modules. .env.local may say VITE_MOCK=true; the stub overrides it.
async function load(mock: "true" | "false") {
  vi.stubEnv("VITE_MOCK", mock);
  vi.resetModules();
  const client = await import("../api/client");
  const { MockControls } = await import("./MockControls");
  return { client, MockControls };
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("MockControls", () => {
  it("renders nothing when IS_MOCK is false", async () => {
    const { client, MockControls } = await load("false");
    expect(client.IS_MOCK).toBe(false);
    const { container } = render(<MockControls simulation={{ value: "FULFILLED", onChange: () => {} }} />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByLabelText(/Simulate state/)).toBeNull();
    expect(screen.queryByLabelText(/Force response/)).toBeNull();
    expect(screen.queryByText(/Simulated:/)).toBeNull();
  });

  it("shows both selects and the simulated-state banner against the mock", async () => {
    const { MockControls } = await load("true");
    render(<MockControls simulation={{ value: "APPROVED_HOLD_RUNNING", onChange: () => {} }} />);
    expect(screen.getByLabelText(/Simulate state/)).toBeTruthy();
    expect(screen.getByLabelText(/Force response/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Simulated: Approved, hold running.");
  });

  it("reports the picked state, and clears it with the first option", async () => {
    const { MockControls } = await load("true");
    const onChange = vi.fn();
    render(<MockControls simulation={{ value: null, onChange }} />);
    const select = screen.getByLabelText(/Simulate state/);
    await userEvent.selectOptions(select, "Approved, unit expired");
    expect(onChange).toHaveBeenLastCalledWith("APPROVED_UNIT_EXPIRED");
    await userEvent.selectOptions(select, "As the mock sends it");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("forces the status code for writes, says so, and resets it when the screen closes", async () => {
    const { client, MockControls } = await load("true");
    const { unmount } = render(<MockControls />);
    await userEvent.selectOptions(screen.getByLabelText(/Force response/), "409");
    expect(client.getForcedMockCode()).toBe(409);
    expect(screen.getByRole("status").textContent).toBe("Every write gets 409 from the mock.");
    unmount();
    expect(client.getForcedMockCode()).toBeNull();
  });
});
