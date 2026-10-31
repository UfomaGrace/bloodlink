// @vitest-environment jsdom
// BeforeYouDonate: on phones it collapses (starts open) from a toggle named by the heading, so the
// heading's words exist once; from sm the toggle is hidden and the list always shows.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BeforeYouDonate } from "./BeforeYouDonate";

afterEach(cleanup);

describe("BeforeYouDonate", () => {
  it("starts open; the toggle hides the list below sm only, and back", () => {
    render(<BeforeYouDonate />);
    expect(screen.getByRole("heading", { level: 2, name: "Before you donate" })).toBeTruthy();
    expect(screen.getAllByText("Before you donate")).toHaveLength(1);

    const toggle = screen.getByRole("button", { name: "Before you donate" });
    expect(toggle.className).toContain("sm:hidden");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const list = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(list.className).not.toContain("max-sm:hidden");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(list.className).toContain("max-sm:hidden");
    expect(list.className).not.toMatch(/(^| )hidden/);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});
