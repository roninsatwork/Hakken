import { cleanup, fireEvent, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { CHART, CONVERSIONS, DAYS_BEFORE, EVENT_LIST, NOTHING_COUNTED, OVERVIEW, OVERVIEW_PANELS, ROW, STATUS, list, statusWith } from "@/src/test/googleAnalyticsFixtures";
import { allPagesSees, landingSees } from "@/convex/utils/sees/analytics";
import GoogleAnalyticsPage from "./page";
import AnalyticsOverviewPage from "./[siteId]/page";
import AnalyticsLandingPagesPage from "./[siteId]/funnel/page";
import AnalyticsAllPagesPage from "./[siteId]/all-pages/page";
import AnalyticsConversionsPage from "./[siteId]/conversions/page";
import AnalyticsTrackingHealthPage from "./[siteId]/tracking-health/page";
import AnalyticsTrackingCheckPage from "./[siteId]/tracking-health/check/page";
import AnalyticsConnectionPage from "./[siteId]/connection/page";

/**
 * Google Analytics' screens hold to the looks Anthony agreed and locked on
 * 2026-10-09 (docs/plans/active/google-analytics-plan.md §11; a picture of
 * each in docs/plans/assets/google-analytics/), as changed by the review
 * canvas he signed off on 2026-10-10 (§15): What Hakken sees under every
 * title with figures, Overview's visits a day, Landing pages' one line a row, All pages' conversions with their value, and
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
      "googleAnalyticsOverviewReads:analyticsOverviewPanels": OVERVIEW_PANELS,
    });
    const { container } = render(<AnalyticsOverviewPage />);
    await screen.findByText("2,412");
    await screen.findByText(/Visits rose 8\.4%, and conversions with them, from 19 to 23\./);
    await screen.findByText("AI agency");
    // Option 4 of the Overview canvas, "Every figure" (ga-overview-plan.md, built 2026-10-15).
    await expectApprovedLook(container, "ga-overview", "Overview", "Google Analytics → Overview");
  });

  it("5 · Funnel (was Landing pages): how visits moved, then each landing page's own funnel (landing-pages-flow-plan.md, approved 2026-10-14)", async () => {
    at("/app/analytics/site_1/funnel");
    const flowRow = { ...ROW, onward: 46, next: { key: "~1", page: "https://www.acme-shop.test/about-us/", share: 0.93 } };
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsReads:analyticsListPage": list([flowRow], { seen: landingSees([{ ...ROW, label: "/ai-agency/" }], { groups: false, device: "", everyDevice: null }) }),
      "googleAnalyticsFlowReads:analyticsLandingFlow": {
        held: true, from: "2026-09-09", to: "2026-10-08", counting: true,
        columns: [{ visits: 155, left: 109, conversions: 1 }, { visits: 43, left: 23, conversions: 0 }, { visits: 6, left: 6, conversions: 1 }],
        nodes: [
          { id: "0:~0", column: 0, page: "~0", path: "/ai-agency/", more: 0, visits: 155, left: 109, conversions: 1 },
          { id: "1:~1", column: 1, page: "~1", path: "/about-us/", more: 0, visits: 43, left: 23, conversions: 0 },
          { id: "2:~2", column: 2, page: "~2", path: "/ai-consultancy/", more: 0, visits: 6, left: 6, conversions: 1 },
        ],
        bands: [
          { from: "0:~0", to: "1:~1", visits: 43, conversions: 0, landings: ["~0"] },
          { from: "1:~1", to: "2:~2", visits: 6, conversions: 1, landings: ["~0"] },
        ],
      },
      "pageKinds:pageKindChoices": [{ id: "group_1", name: "AI services", type: "SERVICE" }],
    });
    const { container } = render(<AnalyticsLandingPagesPage />);
    await screen.findAllByText("/ai-agency/");
    await screen.findByText("155 visits · ▼ 109 left · ● 1");
    await expectApprovedLook(container, "landing-pages-flow", "LandingPages", "Google Analytics → Funnel");
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

  // Conversions with Events merged in (ga-conversions-visitors-plan.md CV2, drawn and approved 2026-10-14), and the
  // visits needed for one conversion under Conversions by page classification (Anthony, 2026-10-20: "go").
  it("7 · Conversions, with every event", async () => {
    at("/app/analytics/site_1/conversions");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      // A key event not counted, as the drawing shows: the fourth figure says so.
      "googleAnalyticsReads:analyticsConversions": { ...CONVERSIONS, fired: [{ eventName: "sign_up", count: 5 }] },
      "googleAnalyticsChartReads:analyticsChart": CHART,
      "googleAnalyticsChartReads:analyticsPeriodBeforeChart": DAYS_BEFORE,
      "googleAnalyticsEventReads:analyticsEvents": EVENT_LIST,
    });
    const { container } = render(<AnalyticsConversionsPage />);
    await screen.findAllByText("Contact form sent");
    await screen.findByText("Key events not counted");
    await screen.findByText("Not counted");
    // Visits needed for one conversion (Anthony, 2026-10-20): the same figures as the top, now and the 30 days before.
    await screen.findByText("Visits needed for one conversion");
    screen.getByText("Last 30 days: 105 visits for each conversion (2,412 visits, 23 conversions). The 30 days before: 117 (2,225 visits, 19 conversions). Fewer is better. A day with no conversion has no figure, so the line skips it.");
    await expectApprovedLook(container, "ga-conversions-visitors", "Conversions", "Google Analytics → Conversions");
  });

  it("7 · visits needed for one conversion: a tick box for each kind, the line and figures counting only those ticked", async () => {
    at("/app/analytics/site_1/conversions");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsReads:analyticsConversions": CONVERSIONS,
      "googleAnalyticsChartReads:analyticsChart": CHART,
      "googleAnalyticsChartReads:analyticsPeriodBeforeChart": DAYS_BEFORE,
      "googleAnalyticsEventReads:analyticsEvents": EVENT_LIST,
    });
    render(<AnalyticsConversionsPage />);
    const card = (await screen.findByText("Visits needed for one conversion")).closest("[data-part='chart-card']") as HTMLElement;
    // Anthony, 2026-10-20: "filters the conversion type such as click to apply now". Only the contact form, now and last year.
    fireEvent.click(within(card).getByLabelText("Phone number clicked"));
    fireEvent.click(within(card).getByLabelText("Email address clicked"));
    await within(card).findByText(/^Last 30 days, counting “Contact form sent”: 172 visits for each one \(2,412 visits, 14 conversions\)\. The 30 days before: 202 \(2,225 visits, 11 conversions\)\./);
    // The last box stays ticked: a chart with nothing ticked says nothing.
    fireEvent.click(within(card).getByLabelText("Contact form sent"));
    expect((within(card).getByLabelText("Contact form sent") as HTMLInputElement).checked).toBe(true);
  });

  it("7 · visits needed for one conversion over 90 days: no line for the days before, and the words say why", async () => {
    at("/app/analytics/site_1/conversions", "period=90");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsReads:analyticsConversions": CONVERSIONS,
      "googleAnalyticsChartReads:analyticsChart": CHART,
      "googleAnalyticsChartReads:analyticsPeriodBeforeChart": DAYS_BEFORE,
      "googleAnalyticsEventReads:analyticsEvents": EVENT_LIST,
    });
    render(<AnalyticsConversionsPage />);
    // Anthony, 2026-10-20: "only keep the second line for another 30 days or below". Past 90 days no day is kept.
    await screen.findByText(/^Last 90 days: 105 visits for each conversion .* The 90 days before: 117 .* The line for the days before is drawn for 7 and 30 days only, where every day is kept\.$/);
    const asks = vi.mocked(useQuery).mock.calls.filter(([reference]) => convexPath(reference).endsWith("analyticsPeriodBeforeChart"));
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.every(([, args]) => args === "skip")).toBe(true);
  });

  it("18 · nothing counted yet", async () => {
    at("/app/analytics/site_1/conversions");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({ events: [] }), "googleAnalyticsReads:analyticsConversions": NOTHING_COUNTED, "googleAnalyticsEventReads:analyticsEvents": EVENT_LIST });
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
    // Option 1 of its canvas, "The checklist" (ga-tracking-health-plan.md TH1, chosen 2026-10-15).
    await expectApprovedLook(container, "ga-tracking-health", "Checklist", "Google Analytics → Tracking health");
  });

  it("9 · a tracking health check's own screen: what it found, why, the steps, and the conversions it names (TH2)", async () => {
    at("/app/analytics/site_1/tracking-health/check", "key=NEVER_HAPPENS");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({
        health: { checkedAt: Date.parse("2026-10-15T02:22:00Z"), checks: [{ check: "NEVER_HAPPENS", passing: false, names: ["click_tel", "click_email"], count: 90 }] },
      }),
    });
    const { container } = render(<AnalyticsTrackingCheckPage />);
    await screen.findByText(/In Google Analytics, open Reports, then Realtime, and check each one arrives\./);
    await expectApprovedLook(container, "ga-tracking-health", "Check", "Google Analytics → a tracking health check");
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
    // One line a check, those that need a look first, the costliest first.
    expect(screen.getAllByRole("row").slice(1).map((row) => row.querySelector("td")?.textContent)).toEqual([
      "Each conversion is what it says", "Every enquiry is counted", "Every conversion happens", "Only this website is in the property",
    ]);
    screen.getByText("Form sent is really Clicked a link to another website.");
    screen.getByText("Contact isn't counted.");
    // Its own screen says how to fix it, with the button to do it: a key event already, so it is only to be chosen.
    cleanup();
    at("/app/analytics/site_1/tracking-health/check", "key=ENQUIRY_UNCOUNTED");
    render(<AnalyticsTrackingCheckPage />);
    await screen.findByText(/Choose “Contact” on the Connection page: they are then counted from Google.s own figures, for the whole year\./);
    screen.getByText(/happened 179 times in 12 months but isn.t counted/);
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

  it("13 · choose what counts: Google didn't answer when the events were read, said with when it asks again (ga-big-site-reliability-plan.md BR1)", async () => {
    at("/app/analytics/site_1/connection");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({
        status: "COUNTING",
        events: null,
        problem: "GOOGLE_BUSY",
        problemDetail: "BUSY 503: The service is currently unavailable.",
        readAgainAt: Date.parse("2026-10-15T10:22:00Z"),
      }),
    });
    render(<AnalyticsConnectionPage />);
    await screen.findByText(/^Google didn't answer when .* events were read, so they aren't listed yet\.$/);
    screen.getByText(/asks again by itself at .*\. There's nothing for you to do\.$/);
    screen.getByText("Google said: BUSY 503: The service is currently unavailable.");
    expect(screen.queryByText(/^Reading the property's key events/)).toBeNull();
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

  it("13 · choose what counts: an event that is really link clicks is warned against, ticked or not", async () => {
    // Ronins on 2026-10-13: "Form sent" still matched its link clicks, and Tracking health advised counting it.
    at("/app/analytics/site_1/connection");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({
        status: "COUNTING",
        events: [
          { eventName: "form_submission", counted: false, analyticsValue: null, hakkenValue: null, lastThirtyDays: 7, keyEvent: true, perVisit: false },
          { eventName: "contact", counted: true, analyticsValue: null, hakkenValue: 20, lastThirtyDays: 3, keyEvent: false, perVisit: false },
        ] as never,
        copies: [{ eventName: "form_submission", of: "click" }],
      }),
    });
    render(<AnalyticsConnectionPage />);
    await screen.findByText("Choose what counts as a conversion");
    expect(screen.getAllByText("Form sent counts the same as Clicked a link to another website, day for day: it isn't an enquiry, so don't count it.")).toHaveLength(1);
  });

  it("13 · choose what counts: a shop on its own address ticked, its sales beside Purchase; a copy left out (conversion-addresses-plan.md)", async () => {
    // National Extension College on 2026-10-19: every course is bought on store.nec.ac.uk, and Purchase read 0.
    at("/app/analytics/site_1/connection");
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({
        status: "COUNTING",
        events: [
          { eventName: "purchase", counted: true, analyticsValue: 140, hakkenValue: null, lastThirtyDays: 0, keyEvent: true, perVisit: false },
          { eventName: "contact", counted: false, analyticsValue: null, hakkenValue: null, lastThirtyDays: 157, keyEvent: false, perVisit: false },
        ] as never,
        otherAddresses: ["store.acme-shop.test", "staging.acme-shop.test", "www-acme--shop-test.translate.goog"],
        addressesRead: [
          { host: "store.acme-shop.test", kind: "SAME_DOMAIN", reached: true, events: [{ eventName: "purchase", year: 2400, month: 210 }], counted: true, hakken: true },
          { host: "staging.acme-shop.test", kind: "COPY", reached: false, events: [{ eventName: "purchase", year: 12, month: 1 }], counted: false, hakken: false },
        ],
      }),
    });
    const save = vi.fn(async () => null);
    vi.mocked(useMutation).mockImplementation((() => save) as never);
    render(<AnalyticsConnectionPage />);
    await screen.findByText("Where conversions count");
    screen.getByText("Part of acme-shop.test, on an address of its own, such as a shop.");
    screen.getByText("A copy of the website: a test or staging site, or Google Translate.");
    screen.getByText("Also left out, with no conversions or sales: www-acme--shop-test.translate.goog.");
    // Purchase reads the shop's sales; unticked, the shop's go, and Hakken says it would count it.
    screen.getByText(/· 210 in the last 30 days$/);
    fireEvent.click(screen.getByRole("checkbox", { name: "store.acme-shop.test" }));
    expect(screen.queryByText(/· 210 in the last 30 days$/)).toBeNull();
    screen.getByText("Hakken would count it: unticked, its conversions and sales are left out.");
    fireEvent.click(screen.getByRole("checkbox", { name: "store.acme-shop.test" }));
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      addresses: [{ host: "store.acme-shop.test", counted: true }, { host: "staging.acme-shop.test", counted: false }],
    })));
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
