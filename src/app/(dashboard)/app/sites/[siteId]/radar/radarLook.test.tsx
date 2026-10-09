import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import BrandRadarPage from "./page";
import RadarSourcesPage from "./sources/page";

/**
 * Discovery's Brand radar screens hold to the looks Anthony approved on the
 * canvas "Discovery — local, reviews, AI apps and mentions" (docs/plans/
 * active/discovery-local-reputation-ai-plan.md, D18; design-drift-plan D4):
 * each screen, rendered with sample rows in English, reads as the outline
 * saved beside its board in docs/plans/assets/discovery-local-reputation-ai/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/radar", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "discovery-local-reputation-ai";
const SITE = { host: "ronins.co.uk", placeLabel: "United Kingdom", counts: {} };
const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
const many = <T,>(count: number, make: (at: number) => T) => Array.from({ length: count }, (_, at) => make(at));

const business = (websiteId: string, host: string, mentions: number, you = false) => ({
  websiteId, host, you, mentions, before: mentions - 4, asks: mentions * 60, pagesCited: Math.round(mentions / 6), series: MONTHS.map((_, at) => mentions - (5 - at) * 3),
});
const OVERVIEW = {
  month: "2026-10",
  perCheckUsd: 0.3,
  months: MONTHS,
  yourCitedAnswers: 7,
  businesses: [
    business("w1", "brightsidedigital.co.uk", 121),
    business("w0", "ronins.co.uk", 64, true),
    business("w2", "kestrelcreative.co.uk", 60),
    business("w3", "surreyweb.co", 46),
    business("w4", "northlane.studio", 43),
  ],
  questions: many(212, (at) => ({
    question: at === 0 ? "how much does a website cost in the uk" : `question ${at}`,
    volume: 2_900 - at,
    you: at % 3 === 0 ? null : 1 + (at % 3),
    rivals: ["brightsidedigital.co.uk"],
    yourPage: at % 3 === 0 ? null : "/web-design-surrey/",
    tracked: at % 4 === 0,
  })),
};

const SOURCES = {
  yourPages: 6,
  yourTimes: 11,
  websites: many(48, (at) => ({
    host: at === 0 ? "clutch.co" : `site${at}.co.uk`,
    kind: (["DIRECTORY", "FORUM", "NEWS", "REVIEWS", "RIVAL", "YOURS", "WEBSITE"] as const)[at % 7],
    times: 86 - at,
    besideYou: at % 3,
    besideRivals: 40 - at % 40,
    rivalsBeside: 3,
  })),
  pages: many(5, (at) => ({ url: `https://site${at}.co.uk/guide/`, host: `site${at}.co.uk`, kind: "RIVAL", times: 22 - at, citedFor: "how much a website costs" })),
};

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:getMySite": SITE, ...queries }));
  vi.mocked(useMutation).mockImplementation((() => vi.fn(async () => null)) as never);
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

describe("Discovery → Brand radar's approved looks", () => {
  it("Overview", async () => {
    at("/app/sites/site_1/radar");
    answer({ "siteBrandRadar:radarOverview": OVERVIEW });
    const { container } = render(<BrandRadarPage />);
    await screen.findByText("how much does a website cost in the uk");
    await expectApprovedLook(container, PLAN, "AiRadar", "Discovery → Brand radar → Overview");
  });

  it("Websites AI cites", async () => {
    at("/app/sites/site_1/radar/sources");
    answer({ "siteBrandRadar:radarSources": SOURCES });
    const { container } = render(<RadarSourcesPage />);
    await screen.findByText("clutch.co");
    await expectApprovedLook(container, PLAN, "AiRadarSources", "Discovery → Brand radar → Websites AI cites");
  });
});
