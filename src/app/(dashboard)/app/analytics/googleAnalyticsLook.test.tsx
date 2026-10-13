import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { CHANNEL, CHART, CONVERSIONS, LANDING_PAGE, NOTHING_COUNTED, OVERVIEW, ROW, STATUS, list, statusWith, top } from "@/src/test/googleAnalyticsFixtures";
import { allPagesSees, channelSees, channelsSees, landingSees } from "@/convex/utils/sees/analytics";
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
 * each in docs/plans/assets/google-analytics/), as changed by the review
 * canvas he signed off on 2026-10-10 (§15): What Hakken sees under every
 * title with figures, Overview's visits a day, a channel's own figures,
 * Landing pages' one line a row, All pages' conversions with their value, and
 * Conversions' What counts and Where they came from. Each screen, rendered
 * with sample figures in English, reads as the outline saved in
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

/** A landing page's four stages from Google to money, as `analyticsHeroPage` answers them: a hero with a page to push. */
const HERO_PAGE = {
  state: "READY" as const,
  currency: "GBP",
  consoleConnected: true,
  consoleTo: "2026-10-08",
  analyticsTo: "2026-10-09",
  found: {
    page: "/ai-agency/",
    address: "https://www.acme-shop.test/ai-agency/",
    consoleAddress: "https://www.acme-shop.test/ai-agency/",
    landingKey: "~0",
    google: { shown: 13_383, clicks: 62, position: 13.9 },
    googleBefore: { shown: 13_500, clicks: 75, position: 15.1 },
    visits: { visits: 84, engaged: 58, conversions: 3, value: 6_000 },
    visitsBefore: { visits: 87, engaged: 60, conversions: 4, value: 8_000 },
    hero: true,
    problems: [{ kind: "push" as const, worth: 2_410, gain: 83 }],
    marked: 0 as const,
    website: { conversionRate: 0.0145, value: 24_000, clickRateAt: 0.0005 },
    task: false,
  },
};

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
      "googleAnalyticsReads:analyticsSites": [{
        siteId: "site_1", host: "acme-shop.test", iconUrl: null, status: "CONNECTED", visits: 2412, conversions: 23, value: 440_000, currency: "GBP", lastCollectedAt: 1,
        visitsBefore: 2225, valueBefore: 350_000, counting: true, failing: 2, checks: 8, unknownShare: null,
      }],
    });
    const { container } = render(<GoogleAnalyticsPage />);
    await screen.findByText("acme-shop.test");
    await screen.findByText(/acme-shop\.test made £4,400 in the last 30 days, up from £3,500/);
    await expectApprovedLook(container, PLAN, "Main", "Google Analytics → your websites");
  });

  it("2 · Overview", async () => {
    at("/app/analytics/site_1");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsReads:analyticsOverview": OVERVIEW,
      "googleAnalyticsChartReads:analyticsChart": CHART,
    });
    const { container } = render(<AnalyticsOverviewPage />);
    await screen.findByText("2,412");
    await screen.findByText(/Visits rose 8\.4%, and conversions with them, from 19 to 23\./);
    await expectApprovedLook(container, PLAN, "Overview", "Google Analytics → Overview");
  });

  it("3 · Channels", async () => {
    at("/app/analytics/site_1/channels");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS, "googleAnalyticsReads:analyticsListPage": list([CHANNEL], { seen: channelsSees([CHANNEL]) }) });
    const { container } = render(<AnalyticsChannelsPage />);
    await screen.findByText("Organic Search");
    await screen.findByText(/Organic Search sends 1,104 of your 1,104 visits/);
    await expectApprovedLook(container, PLAN, "Channels", "Google Analytics → Channels");
  });

  it("16 · a channel's sources, with its own figures", async () => {
    at("/app/analytics/site_1/channels/channel", "key=Referral");
    const source = { ...CHANNEL, key: "clutch.co", label: "clutch.co" };
    const figures = { visits: 1104, visitsBefore: 843, engaged: 679, conversions: 11, conversionsBefore: 1, value: 220_000, valueBefore: 25_000, siteVisits: 2412, siteEngaged: 1289 };
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS, "googleAnalyticsReads:analyticsListPage": list([source], { seen: channelSees("Referral", [source], figures, "site_1"), figures }) });
    const { container } = render(<AnalyticsChannelPage />);
    await screen.findByText("clutch.co");
    await screen.findByText("53.4% for the whole website");
    await expectApprovedLook(container, PLAN, "ChannelSources", "Google Analytics → a channel's sources");
  });

  it("5 · Landing pages, one line a row", async () => {
    at("/app/analytics/site_1/landing-pages");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsReads:analyticsListPage": list([ROW], { seen: landingSees([{ ...ROW, label: "/ai-agency/" }], { groups: false, device: "", everyDevice: null }) }),
      "pageKinds:pageKindChoices": [{ id: "group_1", name: "AI services", type: "SERVICE" }],
    });
    const { container } = render(<AnalyticsLandingPagesPage />);
    await screen.findAllByText("/ai-agency/");
    await screen.findByText("· 1.0%");
    await expectApprovedLook(container, PLAN, "LandingPages", "Google Analytics → Landing pages");
  });

  it("6 · All pages: a short chart of the ticked pages over the table, its filters by the search box, no money (all-pages-rethink-plan.md)", async () => {
    at("/app/analytics/site_1/all-pages");
    const moves = { all: 162, gains: 33, dropped: 6, static: 20, none: 103 };
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsReads:analyticsListPage": list([ROW], {
        seen: allPagesSees([{ ...ROW, label: "/ai-agency/" }], true, { counts: moves, quiet: ["/web-design-surrey/"] }),
        moves,
      }),
      "googleAnalyticsChartReads:analyticsChart": CHART,
      "googleAnalyticsPageReads:analyticsPagesDaily": { pages: [{ ref: "~0", address: ROW.label, points: [{ day: "2026-10-07", views: 20 }, { day: "2026-10-08", views: 31 }] }], missing: [] },
    });
    const { container } = render(<AnalyticsAllPagesPage />);
    await screen.findAllByText("/ai-agency/");
    await screen.findByText("Gains 33");
    await screen.findByText("▲ 81");
    await expectApprovedLook(container, "all-pages-rethink", "AllPages", "Google Analytics → All pages");
  });

  it("15 · a landing page's own screen, with Search Console's stages (§15 screen 7)", async () => {
    at("/app/analytics/site_1/landing-pages/page", "key=~0");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsPageReads:analyticsLandingPage": LANDING_PAGE,
      "googleAnalyticsHeroes:analyticsHeroPage": HERO_PAGE,
    });
    const { container } = render(<AnalyticsLandingPage />);
    await screen.findByText("13,383");
    await expectApprovedLook(container, PLAN, "PageDetail", "Google Analytics → a landing page");
  });

  it("7 · Conversions", async () => {
    at("/app/analytics/site_1/conversions");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsReads:analyticsConversions": CONVERSIONS,
      "googleAnalyticsReads:analyticsTopList": top([ROW]),
    });
    const { container } = render(<AnalyticsConversionsPage />);
    await screen.findAllByText("Contact form sent");
    await screen.findByText("3 of 3");
    await expectApprovedLook(container, PLAN, "Enquiries", "Google Analytics → Conversions");
  });

  it("18 · nothing counted yet", async () => {
    at("/app/analytics/site_1/conversions");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({ events: [] }), "googleAnalyticsReads:analyticsConversions": NOTHING_COUNTED });
    const { container } = render(<AnalyticsConversionsPage />);
    await screen.findByText("Nothing counts as a conversion yet");
    await screen.findByText(/Your property does record “Newsletter sign-up”/);
    await expectApprovedLook(container, PLAN, "NothingCounted", "Google Analytics → nothing counted yet");
  });

  it("9 · Tracking health", async () => {
    at("/app/analytics/site_1/tracking-health");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS });
    const { container } = render(<AnalyticsTrackingHealthPage />);
    await screen.findByText("Every conversion has a value");
    await expectApprovedLook(container, PLAN, "TrackingHealth", "Google Analytics → Tracking health");
  });

  it("9 · Tracking health: what each conversion really is, as ronins.co.uk was before 2026-10-13", async () => {
    at("/app/analytics/site_1/tracking-health");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({
        // "contact" already a key event in Google Analytics, unticked here: it is only to be chosen (conversion-checks-plan.md CC3).
        events: [
          { eventName: "form_submission", counted: true, analyticsValue: null, hakkenValue: 20, lastThirtyDays: 7 },
          { eventName: "contact", counted: false, analyticsValue: null, hakkenValue: null, lastThirtyDays: 3 },
        ],
        health: {
          checkedAt: Date.parse("2026-10-13T04:00:00Z"),
          // Kept in the order the checks were added; listed the costliest first, as What Hakken sees names them.
          checks: [
            { check: "STRANGERS", passing: false, names: ["nclnet.org"], count: 39 },
            { check: "SOMETHING_ELSE", passing: false, names: ["form_submission"], others: ["click"], count: 7 },
            { check: "ENQUIRY_UNCOUNTED", passing: false, names: ["contact"], count: 179 },
            { check: "NEVER_HAPPENS", passing: false, names: ["live_chat_event", "phone_number_click"], count: 90 },
          ],
        },
      }),
    });
    render(<AnalyticsTrackingHealthPage />);
    await screen.findByText("Each conversion is what it says");
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "What Hakken sees", "Each conversion is what it says", "Every enquiry is counted", "Every conversion happens", "Only this website is in the property",
    ]);
    screen.getByText(/matches Clicked a link to another website on each of the last 7 days either happened, so it is counting that, not enquiries\./);
    screen.getByText(/happened 179 times in the last 12 months, but nothing counts it as a conversion\./);
    screen.getByText(/haven't happened once in the last 90 days\./);
    // A key event already: chosen here, with the button to do it.
    screen.getByText(/^choose it on the Connection page: Hakken counts it from Google.s own figures, for the whole year\.$/);
    expect(screen.getAllByRole("button", { name: "Choose what counts" })).toHaveLength(1);
  });

  it("11 · not connected yet, Search Console connected", async () => {
    at("/app/analytics/site_1/connection");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": { ...statusWith(null), searchConsole: { clicks: 367, impressions: 264_403 } } });
    const { container } = render(<AnalyticsConnectionPage />);
    await screen.findAllByText("Add Google Analytics");
    await screen.findByText(/Search Console shows Google sent acme-shop\.test 367 clicks/);
    await expectApprovedLook(container, PLAN, "Connect", "Google Analytics → not connected yet");
  });

  it("12 · choose the property: one match shown for a yes", async () => {
    at("/app/analytics/site_1/connection");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({
        status: "CHOOSING",
        choices: [
          { property: "properties/312456789", displayName: "Acme", accountName: "Acme Ltd", stream: "https://www.acme-shop.test", checked: true, addresses: ["www.acme-shop.test"], others: ["staging.acme-shop.test", "localhost"] },
          { property: "properties/111", displayName: "Another client", accountName: "Acme Ltd", stream: null, checked: true, addresses: [], others: [] },
          { property: "properties/222", displayName: "Old site", accountName: "Acme Ltd", stream: null, checked: true, addresses: [], others: [] },
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

  it("13 · choose what counts: an enquiry that is no key event, and a key event built from it (conversions-back-in-time-plan.md §6)", async () => {
    at("/app/analytics/site_1/connection");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({
        status: "COUNTING",
        events: [
          { eventName: "form_submission", counted: true, analyticsValue: null, hakkenValue: 20, lastThirtyDays: 7, keyEvent: true, perVisit: false },
          { eventName: "contact", counted: true, analyticsValue: null, hakkenValue: 20, lastThirtyDays: 3, keyEvent: false, perVisit: false },
        ] as never,
        copies: [{ eventName: "form_submission", of: "contact" }],
      }),
    });
    render(<AnalyticsConnectionPage />);
    await screen.findByText("Choose what counts as a conversion");
    screen.getByText("Not a key event in Google Analytics: Hakken counts it from Google's own figures, for the whole year.");
    // Both ticked: said once, on the second.
    expect(screen.getAllByText("“Form sent” is a copy of “Contact”: count one of them.".replace(/[“”]/g, ""))).toHaveLength(1);
    screen.getByText(/^What counts, and a value set in Hakken, apply to all history/);
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
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({ newestDay: null, historyDone: false, lastCollectedAt: null }) });
    const { container } = render(<AnalyticsOverviewPage />);
    await screen.findByText("Connected. Collecting the last 90 days now.");
    await expectApprovedLook(container, PLAN, "FirstCollect", "Google Analytics → the first 90 days coming in");
  });
});
