import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { measuresOf, emptyTotals, type ClarityTotals } from "@/convex/utils/clarityRows";
import ClarityOverviewPage from "./[siteId]/page";
import ClarityPagesPage from "./[siteId]/pages/page";
import ClarityPageScreen from "./[siteId]/pages/page/page";
import ClarityErrorsPage from "./[siteId]/errors/page";
import ClarityRecordingsPage from "./[siteId]/recordings/page";
import ClarityConnectionPage from "./[siteId]/connection/page";

/**
 * Microsoft Clarity's screens hold to the looks drawn on "Hakken — Microsoft
 * Clarity" (docs/plans/active/agents-and-clarity-plan.md, Part 4; the boards
 * in docs/plans/assets/agents-and-clarity/) and, for Connection, the board
 * approved on 2026-10-11 (docs/plans/assets/insights-analyst/): each rendered
 * with sample figures in English, read as the outline saved beside its board.
 * Recordings was not drawn: its outline is the standard list screen's.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/clarity/site_1", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "agents-and-clarity";
const CONNECTED = { host: "ronins.co.uk", owned: true, ownSites: [{ siteId: "site_1", host: "ronins.co.uk" }], connection: { status: "CONNECTED", projectName: "Ronins", projectId: "proj1", origin: "https://www.ronins.co.uk", problem: null, newestDay: "2026-10-15", oldestDay: "2026-09-16", lastCollectedAt: Date.parse("2026-10-16T04:50:00Z"), asksToday: 7 } };
const PERIOD = { now: { from: "2026-09-16", to: "2026-10-15", days: 30 }, before: { from: "2026-08-17", to: "2026-09-15", days: 30 }, firstDay: "2026-08-17", countedFrom: null, pages: null, cutDays: 0 };
const m = (visits: number, scroll: number, extra: Partial<ClarityTotals> = {}) => measuresOf({ ...emptyTotals(), visits, scrollSum: Math.round(scroll * 10 * visits), activeSum: visits * 60, pagesSum: visits * 260, ...extra });
const line = (page: string, title: string, visits: number, scroll: number, before: number, extra: Partial<ClarityTotals> = {}) => ({ page, title, kind: "SERVICE", kindName: "Service", now: m(visits, scroll, extra), scrollBefore: before, visitsBefore: visits });
const LINES = [
  line("/", "Creative Digital Agency", 76, 19.2, 22.4, { quickBack: 5 }),
  line("/ai-agency/", "AI Agency | London", 43, 21.3, 27.9, { quickBack: 4, errors: 3, errorClicks: 2 }),
  line("/hub/kapferer-brand-identity-prism/", "The Kapferer Prism", 23, 58.4, 55.1),
  line("/about-us/", "About Us", 7, 41, 39.6),
];
const DAYS = ["2026-10-13", "2026-10-14", "2026-10-15"].map((day, at) => ({ day, visits: 8 + at, scroll: 30 + at, errors: at === 1 ? 1 : 0, errorClicks: 0 }));
const RECORDING = { kind: "ERRORS" as const, link: "https://clarity.microsoft.com/player/proj1/u/s1", day: "2026-10-15", startedAt: Date.parse("2026-10-15T10:00:00Z"), activeSeconds: 48, totalSeconds: 60, pages: 2, clicks: 3, page: "/ai-agency/", title: "AI Agency | London", visited: ["/ai-agency/", "/contact/"], referrer: "google.com" };
const split = (name: string, visits: number, scroll: number, extra: Partial<ClarityTotals> = {}) => ({ name, now: m(visits, scroll, extra), scrollBefore: scroll + 2 });

const OVERVIEW = {
  period: PERIOD,
  now: m(251, 31.4, { bots: 38, quickBack: 10, errors: 5, errorClicks: 3 }),
  before: m(216, 34, { quickBack: 7, errors: 2 }),
  byDay: DAYS,
  beforeByDay: DAYS.map((day) => ({ ...day, day: day.day.replace("-10-", "-09-") })),
  pages: { count: 39, low: 13, few: 33, top: LINES, worst: LINES[1] },
  groups: [{ kind: "SERVICE", name: "Service", now: m(75, 24.1), scrollBefore: 28.3 }, { kind: "INFO", name: "Content hub", now: m(55, 53.8), scrollBefore: 51.2 }],
  devices: [split("PC", 221, 33.1), split("Mobile", 26, 20.7, { quickBack: 2 })],
  sources: { days: 30, rows: [split("google", 171, 30.2), split("Direct", 41, 36.8)] },
  errors: { pages: [{ line: LINES[1], mostly: { browser: "Safari", device: "Mobile" }, recording: RECORDING.link }], pageCount: 2 },
  stuck: { quickBackPage: { page: "/ai-agency/", visits: 4 } },
  recordings: { total: 12, top: [RECORDING] },
};
const PAGES = { rows: LINES, total: 4, page: 1, pages: 1, size: 25, cut: null, preparing: false, period: PERIOD, website: m(251, 31.4), count: 4, low: 2, few: 1, lowest: ["/", "/ai-agency/"], furthest: LINES[2], worst: LINES[0], busiest: LINES };
const PAGE = {
  period: PERIOD, title: "AI Agency | London", kind: "SERVICE", kindName: "Service",
  now: m(43, 21.3, { quickBack: 4, errors: 3, errorClicks: 2 }), before: m(64, 27.9), website: m(251, 31.4), group: m(32, 24.1),
  byDay: DAYS.map((day) => ({ day: day.day, page: day.scroll - 8, website: day.scroll, visits: 3 })),
  errors: [split("Safari|Mobile", 7, 13, { errors: 2, errorClicks: 2 })], browsersDays: 30,
  devices: [split("PC", 33, 23.6), split("Mobile", 9, 13.9, { quickBack: 4 })],
  sources: { days: 30, rows: [split("google", 31, 19.8)], cutDays: 0 },
  recordings: [RECORDING],
};
const ERRORS = {
  period: PERIOD, now: m(251, 31.4, { errors: 5, errorClicks: 3 }), before: m(216, 34, { errors: 2 }), byDay: DAYS,
  browsers: { days: 30, rows: [split("Safari", 31, 25, { errors: 2 }), split("Chrome", 178, 33, { errors: 3 })], cutDays: 0 },
  pages: [{ line: LINES[1], mostly: { browser: "Safari", device: "Mobile" }, recording: RECORDING.link }],
  pagesWithVisits: 39,
};

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries({ "pageKinds:pageKindChoices": [], ...queries }));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn()) as never);
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
  nav.search = "";
});
afterEach(cleanup);

describe("Microsoft Clarity's looks, as drawn", () => {
  it("Overview", async () => {
    nav.pathname = "/app/clarity/site_1";
    answer({ "clarity:clarityStatus": CONNECTED, "clarityScreens:clarityOverview": OVERVIEW });
    const { container } = render(<ClarityOverviewPage />);
    await screen.findByText("Errors visitors hit");
    await expectApprovedLook(container, PLAN, "ClarityOverview", "Microsoft Clarity → Overview");
  });

  it("Pages", async () => {
    nav.pathname = "/app/clarity/site_1/pages";
    answer({ "clarity:clarityStatus": CONNECTED, "clarityScreens:clarityPagesList": PAGES });
    const { container } = render(<ClarityPagesPage />);
    await screen.findAllByText("/hub/kapferer-brand-identity-prism/");
    await expectApprovedLook(container, PLAN, "ClarityPages", "Microsoft Clarity → Pages");
  });

  it("a page", async () => {
    nav.pathname = "/app/clarity/site_1/pages/page";
    nav.search = "path=/ai-agency/";
    answer({ "clarity:clarityStatus": CONNECTED, "clarityScreens:clarityPage": PAGE });
    const { container } = render(<ClarityPageScreen />);
    await screen.findByText("Errors on this page");
    await expectApprovedLook(container, PLAN, "ClarityPage", "Microsoft Clarity → a page");
  });

  it("Errors", async () => {
    nav.pathname = "/app/clarity/site_1/errors";
    answer({ "clarity:clarityStatus": CONNECTED, "clarityScreens:clarityErrors": ERRORS });
    const { container } = render(<ClarityErrorsPage />);
    await screen.findByText("Errors by browser");
    await expectApprovedLook(container, PLAN, "ClarityErrors", "Microsoft Clarity → Errors");
  });

  it("Recordings", async () => {
    nav.pathname = "/app/clarity/site_1/recordings";
    answer({ "clarity:clarityStatus": CONNECTED, "clarityScreens:clarityRecordingsList": { period: PERIOD, recordings: [RECORDING] } });
    const { container } = render(<ClarityRecordingsPage />);
    await screen.findAllByText("Visit that hit a JavaScript error on /ai-agency/");
    await expectApprovedLook(container, PLAN, "ClarityRecordings", "Microsoft Clarity → Recordings");
  });

  it("Connection", async () => {
    nav.pathname = "/app/clarity/site_1/connection";
    answer({ "clarity:clarityStatus": { ...CONNECTED, connection: null } });
    const { container } = render(<ClarityConnectionPage />);
    await screen.findByText("Connect Clarity");
    await expectApprovedLook(container, "insights-analyst", "ClarityConnection", "Microsoft Clarity → Connection");
  });
});
