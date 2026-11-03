import { cleanup, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { ROW, STATUS, list, statusWith, top } from "@/src/test/googleAnalyticsFixtures";
import { eventSees } from "@/convex/utils/sees/analyticsEvents";
import { campaignsSees } from "@/convex/utils/sees/analyticsCampaigns";
import { visitorsSees } from "@/convex/utils/sees/analyticsVisitors";
import { productsSees } from "@/convex/utils/sees/analyticsProducts";
import { liveSees } from "@/convex/utils/sees/analyticsLive";
import AnalyticsEventScreen from "./[siteId]/events/event/page";
import AnalyticsCampaignsPage from "./[siteId]/campaigns/page";
import AnalyticsVisitorsPage from "./[siteId]/visitors/page";
import AnalyticsProductsPage from "./[siteId]/products/page";
import AnalyticsPageScreen from "./[siteId]/all-pages/page/page";
import AnalyticsLivePage from "./[siteId]/live/page";
import { AnalyticsFilters } from "./_components/AnalyticsFilters";
import { openHakkenSees } from "@/src/test/openHakkenSees";

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

const DAYS = ["2026-10-06", "2026-10-07", "2026-10-08"];

beforeEach(() => {
  // A fixed day, the one after the fixtures' newest: the screens' calendar periods count from today (AGENTS.md, "A test whose rows carry fixed days runs on a fixed day").
  useScreenDay("2026-10-09");
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
    await openHakkenSees();
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
    await openHakkenSees();
    await screen.findByText(/Only 7 of the 799 visits came from a link you tagged/);
    await expectApprovedLook(container, PLAN, "Campaigns", "Google Analytics → Campaigns");
  });

  /** A page's own screen's figures, as `analyticsPage`, `analyticsPageChannelExplorer` and `analyticsPageBoxes` answer. */
  function pageScreenAnswers(boxes: unknown) {
    const who = (rows: Array<{ key: string; readers: number; share: number; websiteShare: number; conversions: number }>, conversionsPlaced = 0) => ({ rows, readersPlaced: 38, readers: 457, conversionsPlaced, conversions: 1 });
    const story = {
      live: false, thresholded: true,
      started: { visits: 593, visitsBefore: 480, websiteVisits: 4494, conversions: 1, value: 2000, visitsPerConversion: 593, websiteVisitsPerConversion: 27, countedPages: 3.5, websiteCountedPages: 5.2, fewVisits: false },
      differentPages: 1.2, viewsPerVisit: 3.4, read: 0.18, groupRead: 0.31, group: "Content hub",
      sources: [
        { key: "g", channel: "Organic Search", source: "Google", name: "Google", visits: 452, pages: 1.1, time: 38, read: 0.14, back: 0.05, conversions: 0, value: 0, fewVisits: false },
        { key: "d", channel: "Direct", source: "(direct)", name: null, visits: 70, pages: 2.4, time: 112, read: 0.41, back: 0.38, conversions: 3, value: 2000, fewVisits: true },
      ],
      next: [
        { kind: "again" as const, key: null, address: "", views: 1262, share: 0.62 },
        { kind: "left" as const, key: null, address: "", views: 641, share: 0.32 },
      ],
      returning: { first: 444, back: 110, unknown: 39, websiteBack: 0.244 },
      devices: [{ device: "mobile", share: 0.56, websiteShare: 0.3 }, { device: "desktop", share: 0.41, websiteShare: 0.68 }],
      countries: [{ code: "GB", people: 457 }, { code: "US", people: 298 }],
      ages: who([{ key: "45-54", readers: 26, share: 0.68, websiteShare: 0.42, conversions: 2 }, { key: "25-34", readers: 12, share: 0.32, websiteShare: 0.26, conversions: 0 }], 2),
      genders: who([{ key: "female", readers: 18, share: 0.46, websiteShare: 0.38, conversions: 0 }, { key: "male", readers: 21, share: 0.54, websiteShare: 0.62, conversions: 0 }]),
      weekdays: ["1", "2", "3", "4", "5", "6", "0"].map((day, at) => ({ day, views: 100 + at * 10 })),
      clicks: [{ kind: "click" as const, url: "https://en.wikipedia.org/wiki/Brand", clicks: 14 }],
      league: [],
    };
    return {
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsPageChannels:analyticsPageChannelExplorer": {
        heldFrom: "2024-10-01", everyDevice: false, events: ["generate_lead"], channels: ["Organic Search", "Direct"], from: "2026-09-09", to: "2026-10-08",
        now: DAYS.map((day, at) => ({ day, lastDay: day, rows: [{ channel: "Organic Search", visits: 20, counts: [at === 1 ? 1 : 0] }, { channel: "Direct", visits: 5, counts: [0] }] })),
        before: DAYS.map((day) => ({ day, lastDay: day, rows: [{ channel: "Organic Search", visits: 18, counts: [1] }] })),
        year: [],
      },
      "googleAnalyticsPageBoxes:analyticsPageBoxes": boxes,
      "googleAnalyticsPageReads:analyticsPage": {
        address: "https://www.acme-shop.test/ai-agency/", title: "AI Agency | Agent Automation Company", path: "/ai-agency/", group: "Service",
        row: { ...ROW, views: 300, people: 241, newPeople: 200, bounceRate: 0.3, pagesPerVisit: 2.1, lengthPerVisit: 95 }, viewsBefore: 320, live: false,
        points: DAYS.map((day) => ({ day, visits: 9, engaged: 5, views: 12, conversions: 0, value: 0 })),
        before: [{ kind: "site" as const, key: "google.com", label: "Google", hosts: ["google.com"], views: 118, share: 0.35 }],
      },
      "googleAnalyticsPageReads:analyticsPageStory": { story, seen: { says: [], steps: [] } },
    };
  }

  it("21 · a page's own screen, redone (page-screen-redo-plan-2026-11-03.md, approved 2026-11-03)", async () => {
    at("/app/analytics/site_1/all-pages/page", "key=~0");
    answer(pageScreenAnswers({ product: null, sale: { eventName: "generate_lead", shop: false, visits: 12, startedVisits: 593, websiteVisits: 4494, websiteEventVisits: 90 } }));
    const { container } = render(<AnalyticsPageScreen />);
    // Its address as the title, at the smaller size, "Open the page" on its own line, and no line of words under it.
    const title = await screen.findByRole("heading", { level: 1, name: /\/ai-agency\// });
    expect(title.className).toContain("text-xl");
    screen.getByRole("link", { name: /Open the page/ });
    expect(screen.queryByText(/Every figure here is for views of this page/)).toBeNull();
    // Four boxes on any other page, never money, people or time (Anthony, 2026-11-03: "we should only have 4 max").
    const boxes = [...container.querySelectorAll("[data-part='figure'] [data-part-title]")].map((label) => label.textContent);
    expect(boxes).toEqual(["Views", "Started on this page", "Visitors who converted", "Scrolled to the bottom"]);
    await screen.findByText("2.0% of them");
    screen.getByText("Whole website: 2.0%");
    screen.getByText("Similar pages: 31.0%");
    expect(screen.queryByText(/£/)).toBeNull();
    expect(screen.queryByText("Google held back some small groups in these figures to protect people's privacy.")).toBeNull();
    // Visitors each day, opening on Visits (Anthony, 2026-11-03: "can we default this to visits please").
    const cardOf = (title: string) => screen.getByText(title).closest("[data-part='chart-card']")!.parentElement as HTMLElement;
    const explorer = within(cardOf("Visitors each day"));
    expect((explorer.getByRole("combobox", { name: "Show" }) as HTMLSelectElement).value).toBe("visits");
    explorer.getByText("One line for each place they came from, like Google or Facebook.");
    expect(within(explorer.getByRole("combobox", { name: "Compare with" })).getAllByRole("option").map((option) => option.textContent)).toEqual(["Nothing", "The period before"]);
    // The websites that sent visitors, opening on Source; Channel is the line chart's above.
    const visitors = within(cardOf("Websites that sent visitors"));
    expect(within(visitors.getByRole("combobox", { name: "By" })).getAllByRole("option").map((option) => option.textContent)).toEqual(["Source", "New or returning", "Page before", "Page next"]);
    // Who looks at this page: one chart in place of four, approved by Anthony on 3 November.
    const who = within(cardOf("Who looks at this page, by device"));
    who.getByText(/Did people look at this page on mobile, desktop or tablet\?/);
    fireEvent.change(who.getByRole("combobox", { name: "By" }), { target: { value: "age" } });
    within(cardOf("Who looks at this page, by age")).getByText(/Google only knows the age of 38 of the 457 people\. All 2 conversions it knows about came from people aged 45–54\./);
    fireEvent.change(within(cardOf("Who looks at this page, by age")).getByRole("combobox", { name: "By" }), { target: { value: "country" } });
    expect(within(cardOf("Who looks at this page, by country")).queryByRole("combobox", { name: "Compare with" })).toBeNull();
    screen.getByText("Busiest days of the week");
    screen.getByText("Where visitors came from");
    // Gone, at Anthony's word: the squares, the page before and the links clicked.
    const titles = [...document.querySelectorAll("[data-part-title]")].map((one) => one.textContent);
    for (const gone of ["Conversions by channel", "Conversions by channel, device or country", "Where visitors were just before", "What its readers clicked", "Phone or computer", "Their age", "Their gender", "When they read"]) {
      expect(titles).not.toContain(gone);
    }
    await expectApprovedLook(container, "page-screen-redo", "Page", "Google Analytics → a page's own screen, redone");
  });

  it("21 · a product's own page: its items added and bought, the box the eye lands on first", async () => {
    at("/app/analytics/site_1/all-pages/page", "key=~0");
    answer(pageScreenAnswers({
      product: { products: 3, itemsAdded: 400, itemsBought: 100, itemsAddedBefore: 380, itemsBoughtBefore: 90, websiteItemsBought: 700 },
      sale: { eventName: "purchase", shop: true, visits: 12, startedVisits: 593, websiteVisits: 4494, websiteEventVisits: 90 },
    }));
    const { container } = render(<AnalyticsPageScreen />);
    await screen.findByText("1 in 4 were bought");
    const boxes = [...container.querySelectorAll("[data-part='figure'] [data-part-title]")].map((label) => label.textContent);
    expect(boxes).toEqual(["Views", "Added to basket", "Bought", "Started on this page"]);
    screen.getByText("All 3 sizes and finishes");
    screen.getByText("About 1 in 7 of everything you sold");
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

  // Redrawn and approved 2026-10-14 (ga-conversions-visitors-plan.md CV7): where each kind of visitor lands.
  it("15 · Visitors", async () => {
    at("/app/analytics/site_1/visitors");
    const group = { ...ROW, key: "new", label: "new", visits: 700, people: 589, newPeople: 589, bounceRate: 0.48, pagesPerVisit: 2, lengthPerVisit: 90, conversions: 7, landsMost: { kind: "svc", name: "Services", share: 0.42 } };
    const facts = {
      people: 671, visits: 808, engaged: 418, newPeople: 589, newVisitors: { visits: 700, conversions: 7 }, returning: { visits: 108, conversions: 5 },
      browsers: [{ label: "Chrome", visits: 498, engaged: 261 }], signals: "off" as const, thresholded: false,
    };
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsVisitorReads:analyticsVisitors": {
        preparing: false, missing: [], figures: { people: 671, peopleBefore: 615, visits: 808, visitsBefore: 744, newPeople: 589, returningPeople: 82 },
        points: DAYS.map((day, at) => ({ day, new: 20, returning: 3, newConversions: at === 1 ? 1 : 0, returningConversions: 0 })), signals: "off", thresholded: false, seen: visitorsSees(facts),
      },
      "googleAnalyticsConversionReads:analyticsVisitorMap": {
        collecting: false, thresholded: false, conversions: true,
        kinds: [{ kind: "svc", name: "Services" }, { kind: "NOT_SORTED", name: null }],
        rows: [
          { key: "new", visits: 700, cells: [{ visits: 294, conversions: 5 }, { visits: 406, conversions: 2 }], lands: { kind: "NOT_SORTED", share: 0.58 } },
          { key: "returning", visits: 108, cells: [{ visits: 60, conversions: 5 }, { visits: 48, conversions: 0 }], lands: { kind: "svc", share: 0.56 } },
        ],
      },
      "googleAnalyticsReads:analyticsListPage": list([group]),
    });
    const { container } = render(<AnalyticsVisitorsPage />);
    await screen.findAllByText("New");
    await screen.findByText("Where each kind of visitor lands, by page classification");
    await screen.findByText(/Google signals is switched on/);
    await expectApprovedLook(container, "ga-conversions-visitors", "Visitors", "Google Analytics → Visitors");
  });

  it("25 · Products, for a shop", async () => {
    at("/app/analytics/site_1/products");
    // Screen 4 of the canvas "Products page, three ways" (products-screen-4-plan-2026-11-02.md): items, never money.
    const product = { key: "Brass lever handle\u001fHandles", name: "Brass lever handle", category: "Handles", itemsBought: 22, itemsAdded: 88, itemsLeft: 66, itemsBoughtBefore: 18, share: 0.4 };
    const event = (eventName: string, visits: number, visitsBefore: number) => ({ eventName, visits, visitsBefore });
    const journey = { steps: [event("add_to_cart", 412, 398), event("begin_checkout", 201, 205)], sale: event("purchase", 118, 112) };
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({ shop: true }),
      "googleAnalyticsProductReads:analyticsProducts": {
        shop: true, preparing: false, missing: [],
        events: [event("view_item", 1980, 1870), ...journey.steps, journey.sale],
        choice: { steps: ["add_to_cart", "begin_checkout"], sale: "purchase", saved: false },
        journey,
        neverBought: { count: 3, of: 9, countBefore: 4 },
        categories: ["Handles"],
        seen: productsSees(journey, [product]),
      },
      "googleAnalyticsProductReads:analyticsProductChart": { left: [product], sold: [product], more: [product], less: [], compared: true },
      "googleAnalyticsProductReads:analyticsProductList": { rows: [product], total: 1, page: 1, pages: 1, size: 25, cut: null, live: false, preparing: false },
    });
    const { container } = render(<AnalyticsProductsPage />);
    await screen.findAllByText("Brass lever handle");
    await openHakkenSees();
    await screen.findByText(/of the 412 visits that added to the basket left without buying/);
    // The baskets left behind, of the visits that added something, in points on the period before; no money anywhere.
    await screen.findByText("Baskets left behind");
    await screen.findByText(/71.4% of visits that added something didn't buy/);
    expect(container.textContent ?? "").not.toMatch(/£/);
    await expectApprovedLook(container, "products-screen-4", "Products", "Google Analytics → Products");
  });
});
