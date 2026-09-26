import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { OverviewSections } from "./OverviewSections";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({ siteId: "site_1" }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

type Extras = Parameters<typeof OverviewSections>[0]["extras"];

/** ronins.co.uk's four competitors, as dev held them on 2026-09-26, most searches shared first. */
const extras = {
  homePageRank: null,
  aiOverviewPages: 0,
  aiOverviewCapped: false,
  assistants: [],
  pages: { total: 0, visits: 0, capped: false, kinds: [], visitBands: [] },
  competitors: {
    found: 13,
    you: { keywords: 807, visits: 1937 },
    rivals: [
      { siteId: "hold_chilli", host: "chilliapple.co.uk", keywords: 1898, visits: 3044, shared: 203, sharedVisits: 214 },
      { siteId: "hold_pixel", host: "pixelfield.co.uk", keywords: 1405, visits: 1145, shared: 201, sharedVisits: 180 },
      { siteId: "hold_plug", host: "plugandplaydesign.co.uk", keywords: 1099, visits: 619, shared: 181, sharedVisits: null },
      { siteId: "hold_light", host: "lightflows.co.uk", keywords: 754, visits: 2158, shared: 170, sharedVisits: 1178 },
    ],
  },
} as unknown as Extras;

const card = () => screen.getByRole("heading", { name: "sites.overview.competitors.title" }).closest("div.rounded-2xl") as HTMLElement;
const hosts = () => within(card()).getAllByRole("link").map((link) => link.textContent).filter((text) => text?.includes(".co.uk"));

/**
 * The Competitors card's two views (Anthony, 2026-09-26): Searches, as it
 * was, and Traffic — the visits each competitor gets from the searches both
 * rank for — with the words, the columns and the order following the view.
 */
describe("the Competitors card", () => {
  it("opens on Searches: most searches shared first", () => {
    vi.mocked(useQuery).mockReturnValue({ host: "ronins.co.uk" } as never);
    renderWithProviders(<OverviewSections latest={null} extras={extras} />);

    expect(within(card()).getByRole("tab", { name: "sites.overview.competitors.views.searches" })).toHaveAttribute("aria-selected", "true");
    expect(within(card()).getByText("sites.overview.competitors.hint")).toBeInTheDocument();
    expect(within(card()).getByText("sites.overview.competitors.columns.shared")).toBeInTheDocument();
    expect(hosts()).toEqual(["chilliapple.co.uk", "pixelfield.co.uk", "plugandplaydesign.co.uk", "lightflows.co.uk"]);
  });

  it("switches to Traffic: the words, the columns and the order follow", () => {
    vi.mocked(useQuery).mockReturnValue({ host: "ronins.co.uk" } as never);
    renderWithProviders(<OverviewSections latest={null} extras={extras} />);

    fireEvent.click(within(card()).getByRole("tab", { name: "sites.overview.competitors.views.traffic" }));

    expect(within(card()).getByRole("tab", { name: "sites.overview.competitors.views.traffic" })).toHaveAttribute("aria-selected", "true");
    expect(within(card()).getByText("sites.overview.competitors.hintTraffic")).toBeInTheDocument();
    expect(within(card()).getByText("sites.overview.competitors.columns.sharedVisits")).toBeInTheDocument();
    expect(within(card()).queryByText("sites.overview.competitors.columns.shared")).not.toBeInTheDocument();
    // The most visits taken on shared searches first; one not known, last.
    expect(hosts()).toEqual(["lightflows.co.uk", "chilliapple.co.uk", "pixelfield.co.uk", "plugandplaydesign.co.uk"]);
    expect(within(card()).getByText("sites.overview.competitors.sharedVisitsUnknown")).toBeInTheDocument();
  });
});
