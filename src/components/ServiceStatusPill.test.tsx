// @vitest-environment jsdom
// ServiceStatusPill: every state, the signed-in failed text, and the role="status" wrapper that always stays.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ServiceStatus } from "../hooks/useServiceStatus";
import { ServiceStatusPill } from "./ServiceStatusPill";

afterEach(cleanup);

const TEXT: Record<ServiceStatus, string> = {
  checking: "Waking the service…",
  ready: "Service ready",
  failed: "Service unreachable. Sign-in may fail.",
};

const TONE: Record<ServiceStatus, string> = {
  checking: "text-muted-foreground",
  ready: "text-success",
  failed: "text-warning",
};

const STATES: ServiceStatus[] = ["checking", "ready", "failed"];

describe("ServiceStatusPill", () => {
  it("keeps an empty status region when there is nothing to say", () => {
    render(<ServiceStatusPill status={null} />);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it.each(STATES)("%s shows its text in its state colour on white", (status) => {
    render(<ServiceStatusPill status={status} />);
    const pill = screen.getByText(TEXT[status]);
    expect(pill.closest('[role="status"]')).not.toBeNull();
    expect(pill.className).toContain("bg-surface");
    expect(pill.className).toContain(TONE[status]);
  });

  it("signedIn drops the sign-in hint from the failed text only", () => {
    render(<ServiceStatusPill status="failed" signedIn />);
    expect(screen.getByRole("status").textContent).toBe("Service unreachable");
    cleanup();

    render(<ServiceStatusPill status="ready" signedIn />);
    expect(screen.getByRole("status").textContent).toBe("Service ready");
  });
});

describe("ServiceStatusPill compact", () => {
  const COMPACT_TEXT: Record<ServiceStatus, string> = {
    checking: "Waking the service…",
    ready: "Connected",
    failed: "Service unreachable",
  };

  it("keeps an empty status region when there is nothing to say", () => {
    render(<ServiceStatusPill status={null} compact />);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it.each(STATES)("%s shows its short text in its state colour, without the pill", (status) => {
    render(<ServiceStatusPill status={status} compact />);
    expect(screen.getByRole("status").textContent).toBe(COMPACT_TEXT[status]);
    const text = screen.getByText(COMPACT_TEXT[status]);
    expect(text.className).toContain(TONE[status]);
    expect(text.className).not.toContain("bg-surface");
    expect(text.className).not.toContain("rounded-full");
  });

  it("shows a spinner only while checking, a dot otherwise", () => {
    render(<ServiceStatusPill status="checking" compact />);
    expect(screen.getByRole("status").querySelector(".animate-spin")).not.toBeNull();
    cleanup();

    render(<ServiceStatusPill status="ready" compact />);
    expect(screen.getByRole("status").querySelector(".animate-spin")).toBeNull();
    expect(screen.getByRole("status").querySelector(".bg-current")).not.toBeNull();
  });
});
