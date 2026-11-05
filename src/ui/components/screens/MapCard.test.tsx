import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { MapCard } from "./MapCard";

vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

/** A map in its card (docs/plans/active/campaigns-new-page-plan-2026-11-05.md, step 7): what's in it, for each state a screen hands it. */
const card = { title: "All your campaigns", hint: "Bigger boxes had more visits.", exportName: "map", csv: () => "a,b", host: "acme-shop.test" };

describe("MapCard", () => {
  it("holds its title and hint, its menus, the map and the line under it", () => {
    render(
      <MapCard {...card} controls={[{ kind: "select", key: "count", label: "Count", value: "visits", options: [{ value: "visits", label: "Visits" }], onChange: () => undefined }]} under={<p>This leaves out one.</p>}>
        <div>the boxes</div>
      </MapCard>,
    );
    expect(screen.getByText("All your campaigns")).toBeTruthy();
    expect(screen.getByLabelText("Count")).toBeTruthy();
    expect(screen.getByText("the boxes")).toBeTruthy();
    expect(screen.getByText("This leaves out one.")).toBeTruthy();
  });

  it("says its words in place of the map, with no line under them", () => {
    render(<MapCard {...card} message="Nothing to show in these dates." under={<p>This leaves out one.</p>}><div>the boxes</div></MapCard>);
    expect(screen.getByText("Nothing to show in these dates.")).toBeTruthy();
    expect(screen.queryByText("the boxes")).toBeNull();
    expect(screen.queryByText("This leaves out one.")).toBeNull();
  });

  it("shows only its title while the figures are on their way", () => {
    render(<MapCard {...card} loading message="Nothing to show."><div>the boxes</div></MapCard>);
    expect(screen.getByText("All your campaigns")).toBeTruthy();
    expect(screen.queryByText("the boxes")).toBeNull();
    expect(screen.queryByText("Nothing to show.")).toBeNull();
  });
});
