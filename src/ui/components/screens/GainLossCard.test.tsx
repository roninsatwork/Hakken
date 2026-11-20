import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { GainLossCard } from "./GainLossCard";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const STEPS = [
  { day: "2026-10-01", lastDay: "2026-10-01", label: "1 Oct", counts: { new: 240, up: 0, down: 0, lost: 120 } },
  { day: "2026-10-02", lastDay: "2026-10-02", label: "2 Oct", counts: { new: 260, up: 0, down: 0, lost: 300 } },
];
const SERIES = [
  { key: "new" as const, name: "Gained", colour: "#f59e0b" },
  { key: "lost" as const, name: "Lost", colour: "#3b82f6" },
];
const card = (over: Partial<Parameters<typeof GainLossCard>[0]> = {}) => render(
  <GainLossCard
    title="Keywords gained and lost"
    hint="Keywords Google started showing you for, and stopped."
    exportName="acme-new-and-lost"
    csv={() => "day,gained,lost"}
    host="acme-shop.test"
    from="2026-10-01"
    to="2026-10-02"
    step="day"
    steps={STEPS}
    series={SERIES}
    netLabel="Gained minus lost"
    startLegend="Gained"
    {...over}
  />,
);

/** The shared gain-and-loss card (search-console-new-and-lost-audit-2026-11-19.md). */
describe("GainLossCard", () => {
  it("says its title and hint, and offers the chart to download", () => {
    card();
    expect(screen.getByText("Keywords gained and lost")).toBeTruthy();
    expect(screen.getByText("Keywords Google started showing you for, and stopped.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /download/i })).toBeTruthy();
  });

  it("with ticks, has a tick box for each series, and one always stays ticked", () => {
    card({ ticks: true });
    const gained = screen.getByRole("checkbox", { name: "Gained" });
    const lost = screen.getByRole("checkbox", { name: "Lost" });
    expect(gained).toBeChecked();
    fireEvent.click(gained);
    expect(gained).not.toBeChecked();
    // The last one ticked can't be unticked: the card never draws an empty chart.
    fireEvent.click(lost);
    expect(lost).toBeChecked();
  });

  it("has no tick boxes without ticks", () => {
    card();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("waits while the figures are on their way, and says why when there's nothing to draw", () => {
    const { container, unmount } = card({ loading: true });
    expect(container.querySelector('[data-part="gain-loss-waiting"]')).toBeTruthy();
    unmount();
    card({ empty: "Nothing in these dates." });
    expect(screen.getByText("Nothing in these dates.")).toBeTruthy();
    expect(document.querySelector('[data-part="gain-loss-waiting"]')).toBeNull();
  });
});
