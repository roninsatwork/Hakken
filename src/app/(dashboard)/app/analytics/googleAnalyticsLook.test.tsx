import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { CHANNEL, CHART, CONVERSIONS, LANDING_PAGE, OVERVIEW, ROW, STATUS, list, statusWith, top } from "@/src/test/googleAnalyticsFixtures";
import GoogleAnalyticsPage from "./page";
import AnalyticsOverviewPage from "./[siteId]/page";
import AnalyticsChannelsPage from "./[siteId]/channels/page";
import AnalyticsChannelPage from "./[siteId]/channels/channel/page";
import AnalyticsLandingPagesPage from "./[siteId]/landing-pages/page";
import AnalyticsLandingPage from "./[siteId]/landing-pages/page/page";
import AnalyticsAllPagesPage from "./[siteId]/all-pages/page";
import AnalyticsConversionsPage from "./[siteId]/conversions/page";
import AnalyticsTrackingHealthPage from "./[siteId]/tracking-health/page";
import AnalyticsConnectionPage from "./[siteId]/connection/page";

/**
 * Google Analytics' screens hold to the looks Anthony agreed and locked on
 * 2026-10-09 (docs/plans/active/google-analytics-plan.md §11; a picture of
 * each in docs/plans/assets/google-analytics/): each screen, rendered with
 * sample figures in English, reads as the outline saved beside its picture in
 * docs/plans/assets/google-analytics/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/analytics/site_1", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

const PLAN = "google-analytics";

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

function at(path: string, search = "") {
  nav.pathname = path;
  nav.search = search;
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Google Analytics' approved looks", () => {
  it("1 · your websites", async () => {
    at("/app/analytics");
    answer({
      "googleAnalyticsReads:analyticsSites": [{ siteId: "site_1", host: "ronins.co.uk", iconUrl: null, status: "CONNECTED", visits: 2412, conversions: 23, value: 440_000, currency: "GBP", lastCollectedAt: 1 }],
    });
    const { container } = render(<GoogleAnalyticsPage />);
    await screen.findByText("ronins.co.uk");
    await expectApprovedLook(container, PLAN, "Main", "Google Analytics → your websites");
  });

  it("2 · Overview", async () => {
    at("/app/analytics/site_1");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsReads:analyticsOverview": OVERVIEW,
      "googleAnalyticsReads:analyticsChart": CHART,
      "googleAnalyticsReads:analyticsTopList": top([CHANNEL]),
    });
    const { container } = render(<AnalyticsOverviewPage />);
    await screen.findByText("2,412");
    await expectApprovedLook(container, PLAN, "Overview", "Google Analytics → Overview");
  });

  it("3 · Channels", async () => {
    at("/app/analytics/site_1/channels");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS, "googleAnalyticsReads:analyticsListPage": list([CHANNEL]) });
    const { container } = render(<AnalyticsChannelsPage />);
    await screen.findByText("Organic Search");
    await expectApprovedLook(container, PLAN, "Channels", "Google Analytics → Channels");
  });

  it("16 · a channel's sources", async () => {
    at("/app/analytics/site_1/channels/channel", "key=Referral");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS, "googleAnalyticsReads:analyticsListPage": list([{ ...CHANNEL, key: "clutch.co", label: "clutch.co" }]) });
    const { container } = render(<AnalyticsChannelPage />);
    await screen.findByText("clutch.co");
    await expectApprovedLook(container, PLAN, "ChannelSources", "Google Analytics → a channel's sources");
  });

  it("5 · Landing pages", async () => {
    at("/app/analytics/site_1/landing-pages");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsReads:analyticsListPage": list([ROW]),
      "pageKinds:pageKindChoices": [{ id: "group_1", name: "AI services", type: "SERVICE" }],
    });
    const { container } = render(<AnalyticsLandingPagesPage />);
    await screen.findByText("/ai-agency/");
    await expectApprovedLook(container, PLAN, "LandingPages", "Google Analytics → Landing pages");
  });

  it("6 · All pages", async () => {
    at("/app/analytics/site_1/all-pages");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS, "googleAnalyticsReads:analyticsListPage": list([ROW]) });
    const { container } = render(<AnalyticsAllPagesPage />);
    await screen.findByText("/ai-agency/");
    await expectApprovedLook(container, PLAN, "AllPages", "Google Analytics → All pages");
  });

  it("15 · a landing page's own screen", async () => {
    at("/app/analytics/site_1/landing-pages/page", "key=~0");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS, "googleAnalyticsReads:analyticsLandingPage": LANDING_PAGE });
    const { container } = render(<AnalyticsLandingPage />);
    await screen.findByText("288");
    await expectApprovedLook(container, PLAN, "PageDetail", "Google Analytics → a landing page");
  });

  it("7 · Conversions", async () => {
    at("/app/analytics/site_1/conversions");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsReads:analyticsConversions": CONVERSIONS,
      "googleAnalyticsReads:analyticsChart": CHART,
      "googleAnalyticsReads:analyticsTopList": top([ROW]),
    });
    const { container } = render(<AnalyticsConversionsPage />);
    await screen.findAllByText("Contact form sent");
    await expectApprovedLook(container, PLAN, "Enquiries", "Google Analytics → Conversions");
  });

  it("18 · nothing counted yet", async () => {
    at("/app/analytics/site_1/conversions");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({ events: [] }) });
    const { container } = render(<AnalyticsConversionsPage />);
    await screen.findByText("Nothing counts as a conversion yet");
    await expectApprovedLook(container, PLAN, "NothingCounted", "Google Analytics → nothing counted yet");
  });

  it("9 · Tracking health", async () => {
    at("/app/analytics/site_1/tracking-health");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS });
    const { container } = render(<AnalyticsTrackingHealthPage />);
    await screen.findByText("Every conversion has a value");
    await expectApprovedLook(container, PLAN, "TrackingHealth", "Google Analytics → Tracking health");
  });

  it("11 · not connected yet", async () => {
    at("/app/analytics/site_1/connection");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": statusWith(null) });
    const { container } = render(<AnalyticsConnectionPage />);
    await screen.findAllByText("Add Google Analytics");
    await expectApprovedLook(container, PLAN, "Connect", "Google Analytics → not connected yet");
  });

  it("12 · choose the property: one match shown for a yes", async () => {
    at("/app/analytics/site_1/connection");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({
        status: "CHOOSING",
        choices: [
          { property: "properties/312456789", displayName: "Ronins", accountName: "Ronins Ltd", stream: "https://www.ronins.co.uk", checked: true, addresses: ["www.ronins.co.uk"], others: ["staging.ronins.co.uk", "localhost"] },
          { property: "properties/111", displayName: "Another client", accountName: "Ronins Ltd", stream: null, checked: true, addresses: [], others: [] },
          { property: "properties/222", displayName: "Old site", accountName: "Ronins Ltd", stream: null, checked: true, addresses: [], others: [] },
        ],
      }),
    });
    const { container } = render(<AnalyticsConnectionPage />);
    await screen.findByText("Use this property");
    await expectApprovedLook(container, PLAN, "ChooseProperty", "Google Analytics → choose the property");
  });

  it("13 · choose what counts", async () => {
    at("/app/analytics/site_1/connection");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({ status: "COUNTING" }) });
    const { container } = render(<AnalyticsConnectionPage />);
    await screen.findByText("Choose what counts as a conversion");
    await expectApprovedLook(container, PLAN, "ChooseEvents", "Google Analytics → choose what counts");
  });

  it("14 · Connection", async () => {
    at("/app/analytics/site_1/connection");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS });
    const { container } = render(<AnalyticsConnectionPage />);
    await screen.findByText("What counts");
    await expectApprovedLook(container, PLAN, "Connected", "Google Analytics → Connection");
  });

  it("17 · the first 90 days coming in", async () => {
    at("/app/analytics/site_1");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({ newestDay: null as unknown as string, historyDone: false, lastCollectedAt: null }) });
    const { container } = render(<AnalyticsOverviewPage />);
    await screen.findByText("Connected. Collecting the last 90 days now.");
    await expectApprovedLook(container, PLAN, "FirstCollect", "Google Analytics → the first 90 days coming in");
  });
});
