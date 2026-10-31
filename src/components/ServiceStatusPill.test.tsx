// @vitest-environment jsdom
// ServiceStatusPill: every state in both tones, and the role="status" wrapper that always stays.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ServiceStatus } from "../hooks/useServiceStatus";
import { ServiceStatusPill } from "./ServiceStatusPill";

afterEach(cleanup);

const LIGHT_TEXT: Record<ServiceStatus, string> = {
  checking: "Waking the service…",
  ready: "Service ready",
  failed: "Service unreachable. Sign-in may fail.",
};

const DARK_TEXT: Record<ServiceStatus, string> = {
  checking: "Waking the service…",
  ready: "Service ready",
  failed: "Service unreachable",
};

const STATES: ServiceStatus[] = ["checking", "ready", "failed"];

describe("ServiceStatusPill", () => {
  it("keeps an empty status region when there is nothing to say", () => {
    render(<ServiceStatusPill status={null} tone="onDark" />);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it.each(STATES)("light: %s shows its text in state colours on white", (status) => {
    render(<ServiceStatusPill status={status} />);
    const pill = screen.getByText(LIGHT_TEXT[status]);
    expect(pill.closest('[role="status"]')).not.toBeNull();
    expect(pill.className).toContain("bg-surface");
    expect(screen.queryByTestId("status-dot")).toBeNull();
  });

  it.each(STATES)("onDark: %s uses on-secondary text, with a dot unless checking", (status) => {
    render(<ServiceStatusPill status={status} tone="onDark" />);
    const pill = screen.getByText(DARK_TEXT[status]);
    expect(pill.closest('[role="status"]')).not.toBeNull();
    expect(pill.className).toContain("text-(--color-on-secondary)");
    expect(pill.className).not.toContain("bg-surface");

    const dot = screen.queryByTestId("status-dot");
    if (status === "checking") expect(dot).toBeNull();
    else expect(dot?.getAttribute("aria-hidden")).toBe("true");
  });
});
