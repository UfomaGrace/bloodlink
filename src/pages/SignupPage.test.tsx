// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { Session } from "../api/types";
import SignupPage from "./SignupPage";

const mocks = vi.hoisted(() => ({
  createDonor: vi.fn(),
  createSession: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("../api/endpoints", () => ({ api: mocks }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ session: null, signIn: mocks.signIn }),
}));

const session: Session = {
  accessToken: "test-token",
  tokenType: "Bearer",
  expiresAt: "2099-01-01T00:00:00Z",
  user: {
    id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    displayName: "Adaeze Okafor",
    email: "adaeze@example.org",
    role: "DONOR",
    organisation: null,
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/signup"]}>
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/slots" element={<p>Slots destination</p>} />
        <Route path="/login" element={<p>Login destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText(/Display name/), "Adaeze Okafor");
  await userEvent.type(screen.getByLabelText(/Email/), "adaeze@example.org");
  await userEvent.type(screen.getByLabelText(/^Password/), "A-good-password-1");
}

beforeEach(() => {
  mocks.createDonor.mockReset();
  mocks.createSession.mockReset();
  mocks.signIn.mockReset();
});

afterEach(cleanup);

describe("SignupPage", () => {
  it("creates the donor session, signs in, and navigates to slots", async () => {
    mocks.createDonor.mockResolvedValue({ data: session });
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Slots destination")).toBeTruthy();
    expect(mocks.createDonor).toHaveBeenCalledWith({
      displayName: "Adaeze Okafor",
      email: "adaeze@example.org",
      password: "A-good-password-1",
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.signIn).toHaveBeenCalledWith(session);
  });

  it("offers sign-in with the email when the address is already registered", async () => {
    mocks.createDonor.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "EMAIL_ALREADY_REGISTERED",
        message: "Duplicate",
        requestId: "ref-409",
      }),
    );
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("An account with this email already exists")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      "/login?email=adaeze%40example.org",
    );
    expect(screen.getByText("Reference: ref-409")).toBeTruthy();
  });

  it("tries signing in after a timeout and treats a successful sign-in as account creation", async () => {
    mocks.createDonor.mockRejectedValue(
      new ApiError({
        status: 0,
        code: "TIMEOUT",
        message: "Timed out",
        requestId: "ref-timeout",
      }),
    );
    mocks.createSession.mockResolvedValue({ data: session });
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Slots destination")).toBeTruthy();
    expect(mocks.createDonor).toHaveBeenCalledTimes(1);
    expect(mocks.createSession).toHaveBeenCalledWith({
      email: "adaeze@example.org",
      password: "A-good-password-1",
    });
    expect(mocks.signIn).toHaveBeenCalledWith(session);
  });

  it("shows field validation errors and focuses the first invalid field without submitting", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter your display name.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Display name/)));
    expect(mocks.createDonor).not.toHaveBeenCalled();
  });

  it("maps service validation details onto their fields", async () => {
    mocks.createDonor.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Invalid donor details",
        requestId: "ref-422",
        details: [{ field: "displayName", issue: "That name is not allowed." }],
      }),
    );
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("That name is not allowed.")).toBeTruthy();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
