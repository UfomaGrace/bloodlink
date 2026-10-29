// @vitest-environment jsdom
// UnitDetailPage: the details, newest-first history, and "Unit not found" for 404 and 403.
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResponse } from "../api/client";
import type { UnitDetail } from "../api/types";
import { lagosToday } from "../lib/expiry";

const DAY_MS = 24 * 60 * 60_000;
const BANK = { id: "bank-1", name: "Lagos Central Blood Bank", type: "BLOOD_BANK", area: "Ikeja" } as const;

const mocks = vi.hoisted(() => ({ getUnit: vi.fn() }));
vi.mock("../api/endpoints", () => ({ api: mocks }));

const { default: UnitDetailPage } = await import("./UnitDetailPage");

/** Expires in 10 days; history sent oldest first, as the contract says. */
function unitDetail(): UnitDetail {
  const now = Date.now();
  return {
    id: "unit-1",
    reference: "LCB-2026-00042",
    bloodGroup: "O",
    rhesus: "NEGATIVE",
    component: "RED_CELLS",
    collectionDate: lagosToday(now - 25 * DAY_MS),
    expiryDate: lagosToday(now + 10 * DAY_MS),
    state: "RESERVED",
    bank: BANK,
    recordedAt: "2026-10-04T09:15:00Z",
    history: [
      { at: "2026-10-04T09:15:00Z", event: "RECORDED", actor: "Adaeze Okafor, Lagos Central Blood Bank", note: null },
      { at: "2026-10-20T11:00:00Z", event: "ISSUED", actor: "Adaeze Okafor, Lagos Central Blood Bank", note: null },
      { at: "2026-10-21T08:30:00Z", event: "ISSUE_REVERSED", actor: "Tunde Bello, Lagos Central Blood Bank", note: "Wrong unit" },
    ],
  };
}

function ok<T>(data: T): ApiResponse<T> {
  return { data, status: 200, requestId: "ref-ok", headers: new Headers() };
}

function refused(status: 403 | 404) {
  return new ApiError({
    status,
    code: status === 403 ? "FORBIDDEN" : "NOT_FOUND",
    message: status === 403 ? "You can't see this unit." : "No such unit.",
    requestId: `ref-${status}`,
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/units/unit-1"]}>
      <Routes>
        <Route path="/units/:unitId" element={<UnitDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.getUnit.mockReset().mockImplementation(() => Promise.resolve(ok(unitDetail())));
});

afterEach(() => cleanup());

describe("UnitDetailPage", () => {
  it("shows the unit's details", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Unit LCB-2026-00042" })).toBeTruthy();
    expect(mocks.getUnit.mock.calls[0][0]).toBe("unit-1");

    const details = within(screen.getByRole("region", { name: "Details" }));
    expect(details.getByText("O−")).toBeTruthy();
    expect(details.getByText("Red cells")).toBeTruthy();
    expect(details.getByText("Lagos Central Blood Bank")).toBeTruthy();
    expect(details.getByText("Reserved")).toBeTruthy();
    expect(details.getByText("(in 10 days)", { exact: false })).toBeTruthy();
  });

  it("says expired once the expiry date has passed in Lagos", async () => {
    mocks.getUnit.mockImplementation(() =>
      Promise.resolve(ok({ ...unitDetail(), state: "EXPIRED", expiryDate: lagosToday(Date.now() - DAY_MS) })),
    );
    renderPage();
    const details = within(await screen.findByRole("region", { name: "Details" }));
    expect(details.getByText("(expired)", { exact: false })).toBeTruthy();
  });

  it("lists the history newest first", async () => {
    renderPage();
    const history = await screen.findByRole("region", { name: "History" });
    const events = within(history)
      .getAllByRole("listitem")
      .map((item) => item.querySelector("p")?.textContent);
    expect(events).toEqual(["Issue reversed", "Unit issued", "Recorded"]);
  });

  it.each([404, 403] as const)("shows Unit not found on %i, with a link back to Units", async (status) => {
    mocks.getUnit.mockRejectedValue(refused(status));
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Unit not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to units" }).getAttribute("href")).toBe("/units");
    expect(screen.queryByRole("button", { name: /Try again|Retry/ })).toBeNull();
  });

  it("offers Try again and the Reference when the load fails", async () => {
    mocks.getUnit.mockRejectedValueOnce(
      new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "Something went wrong on our side.", requestId: "ref-500" }),
    );
    renderPage();
    expect(await screen.findByText(/Reference: ref-500/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Unit LCB-2026-00042" })).toBeTruthy();
    expect(mocks.getUnit).toHaveBeenCalledTimes(2);
  });
});
