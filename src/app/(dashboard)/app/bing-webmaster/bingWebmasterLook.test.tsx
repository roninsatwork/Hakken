import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import BingWebmasterPage from "./page";
import BingPerformancePage from "./[siteId]/page";
import BingKeywordsPage from "./[siteId]/keywords/page";
import BingKeywordPage from "./[siteId]/keywords/keyword/page";
import BingPagesPage from "./[siteId]/pages/page";
import BingPageRecordPage from "./[siteId]/pages/page/page";
import BingVersusPage from "./[siteId]/against-google/page";
import BingCrawlingPage from "./[siteId]/crawling/page";
import BingConnectionPage from "./[siteId]/connection/page";

/**
 * Bing Webmaster's screens hold to the looks drawn on 2026-10-12 and built the
 * same day (docs/plans/active/bing-webmaster-plan.md §5; the boards in
 * docs/plans/assets/bing-webmaster/): each rendered with Ronins' figures in
 * English, read as the outline saved beside its board.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/bing-webmaster/site_1", search: "" }));

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

const PLAN = "bing-webmaster";
const AT = Date.parse("2026-10-12T06:00:14Z");

const CONNECTION = {
  status: "CONNECTED", signingIn: false, site: "https://www.ronins.co.uk/", choices: [], connectedAt: AT, disconnectedAt: null,
  newestDay: "2026-10-11", oldestDay: "2026-04-13", newestWeek: "2026-10-11", oldestWeek: "2026-04-19",
  clearing: false, collecting: false, lastCollectedAt: AT, problem: null, attempt: null,
};
const STATUS = {
  configured: true, owned: true, canManage: true, host: "ronins.co.uk", iconUrl: null,
  ownSites: [{ siteId: "site_1", host: "ronins.co.uk" }], counts: { keywords: 142, pages: 58 }, connection: CONNECTION,
};
const PERFORMANCE = {
  from: "2026-07-14", to: "2026-10-11",
  days: [{ day: "2026-10-09", clicks: 1, impressions: 210 }, { day: "2026-10-10", clicks: 0, impressions: 180 }, { day: "2026-10-11", clicks: 2, impressions: 240 }],
  totals: { clicks: 60, impressions: 19_600 },
  google: { clicks: 1_071, impressions: 962_071 },
  weeks: [{ week: "2026-09-28", bing: 7, google: 88 }, { week: "2026-10-05", bing: 5, google: 85 }],
};
const row = (key: string, ref: string, clicks: number, impressions: number, position: number, google: { clicks: number; impressions: number; position: number } | null, title: string | null = null) => ({
  key, ref, title, clicks, impressions, ctr: clicks / impressions, position,
  googleClicks: google?.clicks ?? null, googleImpressions: google?.impressions ?? null, googlePosition: google?.position ?? null,
});
const SUMMARY = {
  rows: 142, onBoth: 61, bingHigher: 38, googleHigher: 23, onlyBing: 81, clicks: 60, moreOnBing: 3,
  top: { key: "ronins", ref: "0", clicks: 5, position: 4.4, googlePosition: 6.7 },
  widestGoogle: { key: "ai agency", ref: "4", clicks: 2, position: 5.1, googlePosition: 2.5 },
};
const KEYWORDS = {
  rows: [
    row("ronins", "0", 5, 41, 4.4, { clicks: 45, impressions: 2_129, position: 6.7 }),
    row("internal and external stakeholders", "1", 2, 35, 9.0, null),
    row("what is a brand audit", "2", 2, 10, 4.4, { clicks: 1, impressions: 1_509, position: 10.5 }),
    row("ai agency", "4", 2, 10, 5.1, { clicks: 106, impressions: 3_848, position: 2.5 }),
  ],
  total: 142, page: 1, pages: 6, size: 25, cut: null, preparing: false, from: "2026-07-14", to: "2026-10-11", summary: SUMMARY, kinds: [],
};
const PAGES = {
  ...KEYWORDS,
  rows: [
    row("https://www.ronins.co.uk/", "~0", 14, 3_120, 6.8, { clicks: 66, impressions: 15_469, position: 32.8 }, "Creative Digital Agency"),
    row("https://www.ronins.co.uk/hub/brand-audit/", "~3", 5, 860, 6.2, { clicks: 2, impressions: 6_583, position: 19.6 }, "What Is A Brand Audit"),
  ],
  total: 58,
  pages: 3,
  kinds: [{ id: "class_services", name: "Services" }, { id: "class_guides", name: "Guides" }, { id: "NOT_SORTED", name: null }],
  summary: { ...SUMMARY, rows: 58, top: { key: "https://www.ronins.co.uk/", ref: "~0", clicks: 14, position: 6.8, googlePosition: 32.8 } },
};
const RECORD = {
  key: "what is a brand audit", title: null,
  weeks: [{ week: "2026-09-27", clicks: 1, impressions: 4, position: 4.6 }, { week: "2026-10-04", clicks: 0, impressions: 3, position: 4.4 }, { week: "2026-10-11", clicks: 1, impressions: 3, position: 4.2 }],
  figures: KEYWORDS.rows[2], from: "2026-07-14", to: "2026-10-11",
};
const PAGE_RECORD = {
  key: "https://www.ronins.co.uk/hub/brand-audit/", title: "What Is A Brand Audit",
  weeks: [{ week: "2026-10-04", clicks: 1, impressions: 70, position: 6.4 }, { week: "2026-10-11", clicks: 1, impressions: 66, position: 6.1 }],
  figures: PAGES.rows[1], from: "2026-07-14", to: "2026-10-11",
};
const LIVE_PAGES = [{ key: "https://www.ronins.co.uk/hub/brand-audit/", clicks: 2, impressions: 10, position: 4.4 }];
const LIVE_KEYWORDS = [
  { key: "what is a brand audit", clicks: 2, impressions: 10, position: 4.4 },
  { key: "brand audit", clicks: 1, impressions: 214, position: 7.8 },
];
const CRAWLING = {
  from: "2026-07-14", to: "2026-10-11",
  days: [{ day: "2026-10-10", crawled: 41, errors: 0, inIndex: 412, blocked: 0 }, { day: "2026-10-11", crawled: 38, errors: 1, inIndex: 412, blocked: 0 }],
  totals: { crawled: 3_912, errors: 18, blocked: 0 },
  pages: [
    { page: "/", title: "Creative Digital Agency", inIndex: true, lastRead: "2026-10-11", googleIndexed: true, googleLastRead: "2026-10-11" },
    { page: "/venture-studio/", title: "Venture Studio", inIndex: false, lastRead: null, googleIndexed: true, googleLastRead: "2026-09-19" },
  ],
  checkedAt: AT,
};
const SITES = [{ siteId: "site_1", host: "ronins.co.uk", iconUrl: null, status: "CONNECTED", clicks: 60, impressions: 19_600, googleClicks: 1_071, share: 60 / 1_131, from: "2026-07-14", to: "2026-10-11", lastCollectedAt: AT }];

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

function at(pathname: string, search = "") {
  nav.pathname = pathname;
  nav.search = search;
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Bing Webmaster's approved looks", () => {
  it("Your websites", async () => {
    at("/app/bing-webmaster");
    answer({ "bingWebmasterReads:bingSites": SITES });
    const { container } = render(<BingWebmasterPage />);
    await screen.findByText("ronins.co.uk");
    await expectApprovedLook(container, PLAN, "Main", "Bing Webmaster → Your websites");
  });

  it("Performance", async () => {
    at("/app/bing-webmaster/site_1");
    answer({ "bingWebmasterConnect:bingStatus": STATUS, "bingWebmasterReads:bingPerformance": PERFORMANCE });
    const { container } = render(<BingPerformancePage />);
    await screen.findByText("Bing's share of your search clicks");
    await expectApprovedLook(container, PLAN, "Performance", "Bing Webmaster → Performance");
  });

  it("Keywords", async () => {
    at("/app/bing-webmaster/site_1/keywords");
    answer({ "bingWebmasterConnect:bingStatus": STATUS, "bingWebmasterReads:bingPerformance": PERFORMANCE, "bingWebmasterReads:bingListPage": KEYWORDS });
    const { container } = render(<BingKeywordsPage />);
    await screen.findByText("internal and external stakeholders");
    await expectApprovedLook(container, PLAN, "Keywords", "Bing Webmaster → Keywords");
  });

  it("A keyword", async () => {
    at("/app/bing-webmaster/site_1/keywords/keyword", "ref=2");
    answer({ "bingWebmasterConnect:bingStatus": STATUS, "bingWebmasterReads:bingRecord": RECORD, "bingWebmasterReads:bingLiveRows": LIVE_PAGES });
    const { container } = render(<BingKeywordPage />);
    await screen.findByText("Pages Bing showed for it");
    await expectApprovedLook(container, PLAN, "Keyword", "Bing Webmaster → A keyword");
  });

  it("Pages", async () => {
    at("/app/bing-webmaster/site_1/pages");
    answer({ "bingWebmasterConnect:bingStatus": STATUS, "bingWebmasterReads:bingPerformance": PERFORMANCE, "bingWebmasterReads:bingListPage": PAGES });
    const { container } = render(<BingPagesPage />);
    await screen.findByText("What Is A Brand Audit");
    await expectApprovedLook(container, PLAN, "Pages", "Bing Webmaster → Pages");
  });

  it("A page", async () => {
    at("/app/bing-webmaster/site_1/pages/page", "ref=~3");
    answer({ "bingWebmasterConnect:bingStatus": STATUS, "bingWebmasterReads:bingRecord": PAGE_RECORD, "bingWebmasterReads:bingLiveRows": LIVE_KEYWORDS });
    const { container } = render(<BingPageRecordPage />);
    await screen.findByText("Keywords Bing showed it for");
    await expectApprovedLook(container, PLAN, "Page", "Bing Webmaster → A page");
  });

  it("Bing against Google", async () => {
    at("/app/bing-webmaster/site_1/against-google");
    answer({ "bingWebmasterConnect:bingStatus": STATUS, "bingWebmasterReads:bingPerformance": PERFORMANCE, "bingWebmasterReads:bingListPage": KEYWORDS });
    const { container } = render(<BingVersusPage />);
    await screen.findByText("Keywords Bing ranks higher");
    await expectApprovedLook(container, PLAN, "AgainstGoogle", "Bing Webmaster → Bing against Google");
  });

  it("Crawling and indexing", async () => {
    at("/app/bing-webmaster/site_1/crawling");
    answer({ "bingWebmasterConnect:bingStatus": STATUS, "bingWebmasterReads:bingCrawling": CRAWLING });
    const { container } = render(<BingCrawlingPage />);
    await screen.findByText("Venture Studio");
    await expectApprovedLook(container, PLAN, "Crawling", "Bing Webmaster → Crawling and indexing");
  });

  it("Connection", async () => {
    at("/app/bing-webmaster/site_1/connection");
    answer({ "bingWebmasterConnect:bingStatus": STATUS });
    const { container } = render(<BingConnectionPage />);
    await screen.findByText("Disconnect");
    await expectApprovedLook(container, PLAN, "Connection", "Bing Webmaster → Connection");
  });

  it("Connection, not connected yet", async () => {
    at("/app/bing-webmaster/site_1/connection");
    answer({ "bingWebmasterConnect:bingStatus": { ...STATUS, counts: { keywords: null, pages: null }, connection: null } });
    const { container } = render(<BingConnectionPage />);
    await screen.findByRole("button", { name: "Connect Bing Webmaster Tools" });
    await expectApprovedLook(container, PLAN, "NotConnected", "Bing Webmaster → Connection, not connected yet");
  });
});
