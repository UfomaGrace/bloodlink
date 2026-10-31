// @vitest-environment jsdom
// DayPicker on phones: the row scrolls sideways, and the chosen day is scrolled into view (only
// when the row overflows, so the grid on wider screens never scrolls). Keyboard and the group label stay.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeekDay } from "../../lib/donorWeek";
import { DayPicker } from "./DayPicker";

const DATES = ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
const WEEK: WeekDay[] = DATES.map((date) => ({ date, slots: [], bookable: 2, disabled: false, hasBooking: false }));

const scrollIntoView = vi.fn();

function setRowWidths(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
}

function Picker({ selected, onSelect = () => {} }: { selected: string; onSelect?: (date: string) => void }) {
  return (
    <>
      <h2 id="choose-day">Choose a day</h2>
      <DayPicker week={WEEK} selected={selected} labelledBy="choose-day" onSelect={onSelect} />
    </>
  );
}

beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DayPicker: phone row", () => {
  it("scrolls the selected day into view when the row overflows, and again when another is chosen", () => {
    setRowWidths(500, 328);
    const view = render(<Picker selected={DATES[5]} />);
    const selected = screen.getByRole("button", { pressed: true });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(selected);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });

    view.rerender(<Picker selected={DATES[2]} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView.mock.contexts[1]).toBe(screen.getByRole("button", { pressed: true }));
  });

  it("doesn't scroll when the row fits (the grid from sm)", () => {
    setRowWidths(700, 700);
    render(<Picker selected={DATES[5]} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("a row of 66px buttons that scrolls sideways with snap below sm, the grid from sm", () => {
    render(<Picker selected={DATES[0]} />);
    const group = screen.getByRole("group", { name: "Choose a day" });
    for (const cls of ["overflow-x-auto", "snap-x", "snap-mandatory", "-mx-4", "sm:grid", "sm:grid-cols-7", "sm:overflow-visible"]) {
      expect(group.classList.contains(cls)).toBe(true);
    }
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(7);
    for (const button of buttons) {
      expect(button.className).toContain("w-[66px]");
      expect(button.classList.contains("snap-start")).toBe(true);
      expect(button.classList.contains("sm:w-auto")).toBe(true);
    }
  });

  it("stays plain buttons: keyboard reachable, pressed state, choosing calls back", () => {
    const onSelect = vi.fn();
    render(<Picker selected={DATES[0]} onSelect={onSelect} />);
    const third = screen.getAllByRole("button")[2];
    third.focus();
    expect(document.activeElement).toBe(third);
    fireEvent.click(third);
    expect(onSelect).toHaveBeenCalledWith(DATES[2]);
    expect(screen.getAllByRole("button")[0].getAttribute("aria-pressed")).toBe("true");
  });
});
