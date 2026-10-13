import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { ROW, STATUS, list, statusWith, top } from "@/src/test/googleAnalyticsFixtures";
import { eventSees, eventsSees } from "@/convex/utils/sees/analyticsEvents";
import { campaignsSees } from "@/convex/utils/sees/analyticsCampaigns";
import { visitorsSees } from "@/convex/utils/sees/analyticsVisitors";
import { productsSees } from "@/convex/utils/sees/analyticsProducts";
import { liveSees } from "@/convex/utils/sees/analyticsLive";
import { pageSees } from "@/convex/utils/sees/analytics";
import AnalyticsEventsPage from "./[siteId]/events/page";
import AnalyticsEventScreen from "./[siteId]/events/event/page";
import AnalyticsCampaignsPage from "./[siteId]/campaigns/page";
import AnalyticsVisitorsPage from "./[siteId]/visitors/page";
import AnalyticsProductsPage from "./[siteId]/products/page";
import AnalyticsPageScreen from "./[siteId]/all-pages/page/page";
import AnalyticsLivePage from "./[siteId]/live/page";
import { AnalyticsFilters } from "./_components/AnalyticsFilters";

/**
 * The second round's screens hold to the looks drawn and agreed on
 * 2026-10-11 (docs/plans/active/google-analytics-plan.md §18.2; a picture of
 * each in docs/plans/assets/google-analytics/round-2/): Live, Campaigns,
 * a page's own screen, Events and an event's own screen, Visitors and
 * Products. Each screen, rendered with sample figures in English, reads as
 * the outline saved in docs/plans/assets/google-analytics/look/, as the first
 * round's do (`googleAnalyticsLook.test.tsx`).
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

function answer(queries: Record<string, unknown>, action: () => Promise<unknown> = () => new Promise(() => undefined)) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(action)) as never);
}

function at(path: string, search = "") {
  nav.pathname = path;
  nav.search = search;
}

const FLAGS = { folded: false, thresholded: false, cut: false };
const DAYS = ["2026-10-06", "2026-10-07", "2026-10-08"];

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Google Analytics' second-round looks", () => {
  it("14 · Live", async () => {
    at("/app/analytics/site_1/live");
    const live = {
      ok: true, askedAt: Date.parse("2026-10-11T10:42:06Z"), now: 4, people: 11, views: 27,
      conversions: { count: 1, eventName: "form_submission", minutesAgo: 12 },
      minutes: Array.from({ length: 30 }, (_, at) => at % 5),
      places: [{ name: "London", people: 5, views: 0, times: 0 }, { name: "Guildford", people: 2, views: 0, times: 0 }],
      countries: [{ name: "GB", people: 9, views: 0, times: 0 }, { name: "DE", people: 2, views: 0, times: 0 }],
      rows: [{ name: "AI Agency | Agent Automation Company", people: 3, views: 9, times: 0 }],
      seen: liveSees({ now: 4, people: 11, topPage: { title: "AI Agency | Agent Automation Company", people: 3 }, conversion: { eventName: "form_submission", minutesAgo: 12 } }),
    };
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS }, async () => live);
    const { container } = render(<AnalyticsLivePage />);
    await screen.findByText("AI Agency | Agent Automation Company");
    await screen.findByText(/4 people are on the website now/);
    // Every country counts: no country named on the figures (Anthony, 2026-10-13).
    await screen.findByText("In the last 5 minutes");
    await expectApprovedLook(container, PLAN, "Live", "Google Analytics → Live");
  });

  it("14 · Live offers no country: it counts every country, as Google's own Realtime does", () => {
    answer({});
    at("/app/analytics/site_1/live");
    const { unmount } = render(<AnalyticsFilters />);
    expect(screen.queryByLabelText("Country")).toBeNull();
    unmount();
    at("/app/analytics/site_1");
    render(<AnalyticsFilters />);
    expect(screen.getByLabelText("Country")).toBeTruthy();
  });

  it("17 · Campaigns", async () => {
    at("/app/analytics/site_1/campaigns");
    const campaign = { ...ROW, key: "ai-agents-launch\u001flinkedin.com / social", label: "ai-agents-launch", source: "linkedin.com / social", visits: 7, conversions: 0, value: 0, people: 6, newPeople: 5, bounceRate: 0.4, pagesPerVisit: 2, lengthPerVisit: 90 };
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsReads:analyticsListPage": { ...list([campaign], { seen: campaignsSees([campaign], 792) }), untagged: 792 },
      "googleAnalyticsReads:analyticsTopList": top([campaign]),
      "googleAnalyticsChartReads:analyticsCampaignChart": { live: false, points: DAYS.map((day) => ({ day, visits: 1 })) },
    });
    const { container } = render(<AnalyticsCampaignsPage />);
    await screen.findAllByText("ai-agents-launch");
    await screen.findByText(/Only 7 of the 799 visits came from a link you tagged/);
    await expectApprovedLook(container, PLAN, "Campaigns", "Google Analytics → Campaigns");
  });

  it("21 · a page's own screen, with its story (analytics-page-screen-plan.md, approved 2026-10-13)", async () => {
    at("/app/analytics/site_1/all-pages/page", "key=~0");
    const before = [
      { kind: "site" as const, key: "google.com", label: "Google", hosts: ["google.com", "google.es"], views: 118, share: 0.35 },
      { kind: "page" as const, key: "~1", label: "https://www.acme-shop.test/", title: "Digital Growth Agency", views: 74, share: 0.22 },
      { kind: "none" as const, key: "none", label: "", views: 41, share: 0.12 },
    ];
    const who = (rows: Array<{ key: string; readers: number; share: number; websiteShare: number; conversions: number }>) => ({ rows, readersPlaced: 38, readers: 457, conversionsPlaced: 0, conversions: 1 });
    const story = {
      live: false, thresholded: true,
      started: { visits: 593, visitsBefore: 480, websiteVisits: 4494, conversions: 1, value: 2000, visitsPerConversion: 593, websiteVisitsPerConversion: 27, countedPages: 3.5, websiteCountedPages: 5.2, fewVisits: false },
      differentPages: 1.2, viewsPerVisit: 3.4, read: 0.18, groupRead: 0.31, group: "Content hub",
      sources: [
        { key: "g", channel: "Organic Search", source: "Google", name: "Google", visits: 452, pages: 1.1, time: 38, read: 0.14, back: 0.05, conversions: 0, value: 0, fewVisits: false },
        { key: "d", channel: "Direct", source: "(direct)", name: null, visits: 70, pages: 2.4, time: 112, read: 0.41, back: 0.38, conversions: 1, value: 2000, fewVisits: true },
      ],
      next: [
        { kind: "again" as const, key: null, address: "", views: 1262, share: 0.62 },
        { kind: "left" as const, key: null, address: "", views: 641, share: 0.32 },
        { kind: "page" as const, key: "~12", address: "https://www.acme-shop.test/web-design-insights/", views: 46, share: 0.02 },
      ],
      returning: { first: 444, back: 110, unknown: 39, websiteBack: 0.244 },
      devices: [{ device: "mobile", share: 0.56, websiteShare: 0.3 }, { device: "desktop", share: 0.41, websiteShare: 0.68 }],
      countries: [{ code: "GB", people: 457 }, { code: "US", people: 298 }],
      ages: who([{ key: "18-24", readers: 26, share: 0.68, websiteShare: 0.42, conversions: 0 }, { key: "25-34", readers: 12, share: 0.32, websiteShare: 0.26, conversions: 0 }]),
      genders: who([{ key: "female", readers: 18, share: 0.46, websiteShare: 0.38, conversions: 0 }, { key: "male", readers: 21, share: 0.54, websiteShare: 0.62, conversions: 0 }]),
      weekdays: ["1", "2", "3", "4", "5", "6", "0"].map((day, at) => ({ day, views: 100 + at * 10 })),
      clicks: [{ kind: "click" as const, url: "https://en.wikipedia.org/wiki/Brand", clicks: 14 }],
      league: [
        { key: "~0", address: "https://www.acme-shop.test/ai-agency/", title: "AI Agency | Agent Automation Company", visits: 593, conversions: 1, isThis: true },
        { key: "~31", address: "https://www.acme-shop.test/hub/brand-bible-guidelines/", title: "Brand Bible", visits: 35, conversions: 3, isThis: false },
      ],
    };
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsPageReads:analyticsPage": {
        address: "https://www.acme-shop.test/ai-agency/", title: "AI Agency | Agent Automation Company", path: "/ai-agency/", group: "Service",
        row: { ...ROW, people: 241, newPeople: 200, bounceRate: 0.3, pagesPerVisit: 2.1, lengthPerVisit: 95 }, viewsBefore: 320, live: false,
        points: DAYS.map((day) => ({ day, visits: 9, engaged: 5, views: 12, conversions: 0, value: 0 })),
        before,
        story,
        seen: pageSees(before.map((row) => ({ kind: row.kind, key: row.key, name: row.label, views: row.views })), "site_1", () => false, "~0", {
          started: { visits: 593, websiteVisits: 4494, conversions: 1, madeHere: 0 },
          biggest: { name: "Google", visits: 452, conversions: 0 },
          converter: { name: "(direct)", conversions: 1 },
          viewsPerVisit: 2.7,
          pages: { different: 1.2, counted: 3.5 },
          nearest: { page: "~31", visits: 35, conversions: 3 },
        }),
      },
    });
    const { container } = render(<AnalyticsPageScreen />);
    await screen.findByText("Digital Growth Agency");
    await screen.findByText("Typed in, a bookmark or an app");
    await screen.findByText("Typed in or a bookmark");
    await screen.findByText(/593 visits started on this page/);
    await expectApprovedLook(container, "analytics-page-screen", "Page", "Google Analytics → a page's own screen, with its story");
  });

  it("22 · Events", async () => {
    at("/app/analytics/site_1/events");
    const rows = [
      { eventName: "page_view", kind: "automatic" as const, counted: false, times: 2431, people: 671, visits: 808, timesBefore: 2232 },
      { eventName: "scroll", kind: "measured" as const, counted: false, times: 512, people: 318, visits: 300, timesBefore: 482 },
      { eventName: "form_submission", kind: "conversion" as const, counted: true, times: 12, people: 12, visits: 12, timesBefore: 17 },
      { eventName: "live_chat_event", kind: "conversion" as const, counted: true, times: 0, people: 0, visits: 0, timesBefore: 0 },
    ];
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsEventReads:analyticsEvents": {
        preparing: false, live: false, rows, points: DAYS.map((day) => ({ day, scroll: 17, click: 2 })), flags: FLAGS, seen: eventsSees(rows, 808),
      },
    });
    const { container } = render(<AnalyticsEventsPage />);
    await screen.findByText("Scrolled to the bottom");
    await screen.findByText(/“Live chat started” counts as a conversion but never happened/);
    await expectApprovedLook(container, PLAN, "Events", "Google Analytics → Events");
  });

  it("23 · an event's own screen", async () => {
    at("/app/analytics/site_1/events/event", "key=click");
    const about = [{ key: "https://www.linkedin.com/company/ronins", label: "linkedin.com/company/ronins", times: 18, people: 14, change: 0.125 }];
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsEventReads:analyticsEvent": {
        eventName: "click", kind: "measured", counted: false, detail: "linkUrl",
        figures: { times: 64, timesBefore: 73, people: 41, peopleShare: 0.061, visits: 52, visitsShare: 0.064 },
        points: DAYS.map((day) => ({ day, times: 2 })), live: false, about, pages: [], counting: true, after: { did: 41, converted: 0 },
        seen: eventSees({ eventName: "click", detail: "linkUrl", times: 64, timesBefore: 73, people: 41, pageViews: 2431, about, after: { did: 41, converted: 0 } }),
      },
    });
    const { container } = render(<AnalyticsEventScreen />);
    await screen.findAllByText("linkedin.com/company/ronins");
    await screen.findByText("of the 41 people who did it");
    await expectApprovedLook(container, PLAN, "AnEvent", "Google Analytics → an event's own screen");
  });

  it("15 · Visitors", async () => {
    at("/app/analytics/site_1/visitors");
    const browser = { ...ROW, key: "Chrome", label: "Chrome", visits: 498, people: 412, newPeople: 380, bounceRate: 0.48, pagesPerVisit: 2, lengthPerVisit: 90, conversions: 8 };
    const facts = {
      people: 671, visits: 808, engaged: 418, newPeople: 589, newVisitors: { visits: 700, conversions: 7 }, returning: { visits: 108, conversions: 5 },
      browsers: [{ label: "Chrome", visits: 498, engaged: 261 }], signals: "off" as const, thresholded: false,
    };
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsVisitorReads:analyticsVisitors": {
        preparing: false, missing: [], figures: { people: 671, peopleBefore: 615, visits: 808, visitsBefore: 744, newPeople: 589, returningPeople: 82 },
        points: DAYS.map((day) => ({ day, new: 20, returning: 3 })), signals: "off", thresholded: false, seen: visitorsSees(facts),
      },
      "googleAnalyticsReads:analyticsListPage": list([browser]),
      "googleAnalyticsReads:analyticsTopList": top([browser]),
    });
    const { container } = render(<AnalyticsVisitorsPage />);
    await screen.findAllByText("Chrome");
    await screen.findByText(/Google signals is switched on/);
    await expectApprovedLook(container, PLAN, "Visitors", "Google Analytics → Visitors");
  });

  it("25 · Products, for a shop", async () => {
    at("/app/analytics/site_1/products");
    const product = { key: "Brass lever handle\u001fHandles", name: "Brass lever handle", category: "Handles", looks: 612, basket: 88, bought: 22, revenue: 286_000, change: 0.12 };
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({ shop: true }),
      "googleAnalyticsProductReads:analyticsProducts": {
        shop: true, preparing: false, missing: [],
        steps: { looked: 4210, basket: 612, checkout: 241, bought: 118, revenue: 724_800 }, before: { looked: 3968, basket: 594, checkout: 248, bought: 112, revenue: 690_000 },
        points: DAYS.map((day) => ({ day, bought: 4 })), categories: ["Handles"],
        seen: productsSees({ looked: 4210, basket: 612, checkout: 241, bought: 118 }, [{ name: product.name, looks: 612, bought: 22, revenue: 286_000 }]),
      },
      "googleAnalyticsProductReads:analyticsProductList": { rows: [product], total: 1, page: 1, pages: 1, size: 25, cut: null, live: false, preparing: false },
    });
    const { container } = render(<AnalyticsProductsPage />);
    await screen.findByText("Brass lever handle");
    await screen.findByText(/Shoppers looked at products 4,210 times/);
    await expectApprovedLook(container, PLAN, "Products", "Google Analytics → Products");
  });
});
