import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { LANDING_PAGE, STATUS } from "@/src/test/googleAnalyticsFixtures";
import AnalyticsHeroesPage from "./[siteId]/heroes/page";
import AnalyticsHeroPage from "./[siteId]/heroes/page/page";
import AnalyticsLandingPage from "./[siteId]/landing-pages/page/page";

/**
 * Heroes and attention, and a landing page's own screen, hold to the looks
 * Anthony signed off on 2026-10-10 (docs/plans/active/google-analytics-plan.md
 * §13, §15 screens 3 and 7; the boards saved in
 * docs/plans/assets/google-analytics/review/): each screen, rendered with
 * sample figures in English, reads as the outline saved beside them in
 * docs/plans/assets/google-analytics/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/analytics/site_1/heroes", search: "" }));

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

const STAGES = {
  shown: 264_403, position: 18.1, clicks: 367, clickRate: 0.00139, visits: 466, engaged: 248, conversions: 6, value: 12_000,
  websiteValue: 24_000, heroes: 4, heroesValue: 20_000, gainInGoogle: 37_300, gainOnPages: 6_200, marked: 1 as const,
};

const HEROES = {
  state: "READY" as const,
  currency: "GBP",
  consoleConnected: true,
  consoleTo: "2026-10-08",
  analyticsTo: "2026-10-09",
  stages: STAGES,
  totalGain: 43_500,
  tabs: [
    { tab: "all", count: 38 }, { tab: "hero", count: 4 }, { tab: "push", count: 33 }, { tab: "click", count: 1 },
    { tab: "convert", count: 1 }, { tab: "leave", count: 0 }, { tab: "fall", count: 1 },
  ],
  rows: [
    { page: "/hub/kapferer-brand-identity-prism/", main: "convert", hero: false, worth: 5_460, task: false, ref: "~1", console: "https://www.acme-shop.test/hub/kapferer-brand-identity-prism/" },
    { page: "/ai-agency/", main: "push", hero: true, worth: 2_410, task: true, ref: "~0", console: "https://www.acme-shop.test/ai-agency/" },
  ],
  total: 2,
  page: 1,
  pages: 1,
  size: 25,
  cut: null,
  preparing: false,
  seen: {
    says: [{ code: "mostInGoogle", a: 264_403, b: 0.00139, c: 43_500 }, { code: "heroes", a: 4, b: 20_000, c: 24_000 }],
    steps: [{ code: "pushOne", text: "/ai-agency/", a: 2_410, link: "pagesToPush", to: { segment: "heroes", filters: { tab: "push" } } }],
  },
};

const JOURNEY = {
  page: "/ai-agency/",
  address: "https://www.acme-shop.test/ai-agency/",
  consoleAddress: "https://www.acme-shop.test/ai-agency/",
  landingKey: "~0",
  google: { shown: 13_383, clicks: 62, position: 13.9 },
  googleBefore: { shown: 13_500, clicks: 75, position: 15.1 },
  visits: { visits: 84, engaged: 58, conversions: 3, value: 6_000 },
  visitsBefore: { visits: 87, engaged: 60, conversions: 4, value: 8_000 },
  hero: true,
  problems: [{ kind: "push", worth: 2_410, gain: 83 }],
  marked: 0 as const,
  website: { conversionRate: 0.0145, value: 24_000, clickRateAt: 0.0005 },
  task: false,
};

const HERO_PAGE = { state: "READY" as const, currency: "GBP", consoleConnected: true, consoleTo: "2026-10-08", analyticsTo: "2026-10-09", found: JOURNEY };

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

describe("Heroes and attention's approved looks", () => {
  it("3 · Heroes and attention", async () => {
    at("/app/analytics/site_1/heroes");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS, "googleAnalyticsHeroes:analyticsHeroes": HEROES });
    const { container } = render(<AnalyticsHeroesPage />);
    await screen.findByText("/hub/kapferer-brand-identity-prism/");
    await expectApprovedLook(container, PLAN, "HeroesAttention", "Google Analytics → Heroes and attention");
  });

  it("3 · a page of Heroes and attention", async () => {
    at("/app/analytics/site_1/heroes/page", "key=%2Fai-agency%2F&ref=~0");
    answer({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS, "googleAnalyticsHeroes:analyticsHeroPage": HERO_PAGE });
    const { container } = render(<AnalyticsHeroPage />);
    await screen.findByText("13,383");
    await expectApprovedLook(container, PLAN, "HeroesAttentionPage", "Google Analytics → a page of Heroes and attention");
  });

  it("7 · a landing page's own screen", async () => {
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
});
