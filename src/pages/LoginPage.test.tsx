// @vitest-environment jsdom
// LoginPage: the "Try a demo" pills fill the form without submitting, clear the error box and
// move focus to Sign in; the audience columns replace the old list. Demo and status pills are
// hidden against the mock.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createSession: vi.fn(), health: vi.fn() }));
vi.mock("../api/endpoints", () => ({ api: mocks }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ session: null, signIn: vi.fn(), notice: null }),
}));

// IS_MOCK is read from VITE_MOCK when api/client loads, so each test sets the variable and then
// imports fresh copies of the modules. .env.local may say VITE_MOCK=true; the stub overrides it.
async function load(mock: "true" | "false") {
  vi.stubEnv("VITE_MOCK", mock);
  vi.resetModules();
  const client = await import("../api/client");
  const { default: LoginPage } = await import("./LoginPage");
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  return client;
}

// The first import transforms the whole page tree, which can outlast a test's 5s timeout on a
// cold run (and then render into the next test). Warm it once; load() re-imports from cache.
beforeAll(async () => {
  await import("./LoginPage");
}, 60_000);

beforeEach(() => {
  mocks.createSession.mockReset();
  mocks.health.mockReset().mockResolvedValue({ data: { status: "UP" } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("LoginPage demo accounts", () => {
  it("fills the bank staff login without submitting and focuses Sign in", async () => {
    await load("false");
    await userEvent.click(screen.getByRole("button", { name: "Bank staff (staff@lagos-central.bank.demo)" }));

    expect(screen.getByLabelText(/Email/)).toHaveProperty("value", "staff@lagos-central.bank.demo");
    expect(screen.getByLabelText(/^Password/)).toHaveProperty("value", "Demo-Password-1");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sign in" }));
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("fills the hospital staff login", async () => {
    await load("false");
    await userEvent.click(screen.getByRole("button", { name: "Hospital staff (staff@yaba.hospital.demo)" }));

    expect(screen.getByLabelText(/Email/)).toHaveProperty("value", "staff@yaba.hospital.demo");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("clears the error box from a failed sign-in", async () => {
    const { ApiError } = await load("false");
    mocks.createSession.mockRejectedValue(
      new ApiError({ status: 401, code: "INVALID_CREDENTIALS", message: "Email or password is incorrect.", requestId: "ref-401" }),
    );
    await userEvent.type(screen.getByLabelText(/Email/), "someone@example.com");
    await userEvent.type(screen.getByLabelText(/^Password/), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Email or password is incorrect.");

    await userEvent.click(screen.getByRole("button", { name: /^Bank staff \(/ }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
  });

  it("is not shown against the mock server, and neither is the service status", async () => {
    await load("true");
    expect(screen.queryByText("Try a demo:")).toBeNull();
    expect(screen.queryByRole("button", { name: /staff@/ })).toBeNull();
    expect(screen.queryByText(/Waking the service|Service ready|Service unreachable/)).toBeNull();
    expect(mocks.health).not.toHaveBeenCalled();
  });
});

describe("LoginPage panel", () => {
  it("lists the three audiences as columns, replacing the old list", async () => {
    await load("false");
    expect(screen.queryByText(/request units and track them until issued/)).toBeNull();
    expect(screen.queryByText("Manage blood stock and requests.")).toBeNull();

    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["HospitalsRequest units", "Blood banksManage stock", "DonorsBook a slot"]);
  });

  it("announces the service status in a role=\"status\" region", async () => {
    await load("false");
    expect((await screen.findByText("Service ready")).closest('[role="status"]')).not.toBeNull();
  });
});
