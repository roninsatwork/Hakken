import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { useMiddayUtc } from "@/src/test/realTime";
import WebMentionsPage from "./page";
import MentionsAgainstRivalsPage from "./rivals/page";
import WhereToGetListedPage from "./listed/page";

/**
 * Discovery's Web mentions screens hold to the looks Anthony approved on the
 * canvas "Discovery — local, reviews, AI apps and mentions" (docs/plans/
 * active/discovery-local-reputation-ai-plan.md, D18; design-drift-plan D4):
 * each screen, rendered with sample rows in English, reads as the outline
 * saved beside its board in docs/plans/assets/discovery-local-reputation-ai/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/mentions", search: "" }));

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
const many = <T,>(count: number, make: (at: number) => T) => Array.from({ length: count }, (_, at) => make(at));
const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);

const MENTIONS = {
  names: ["Ronins", "ronins.co.uk"],
  rows: many(198, (at) => ({
    url: at === 0 ? "https://surreybusinessnews.co.uk/best-web-design-agencies-surrey" : `https://site${at}.co.uk/page-${at}`,
    host: at === 0 ? "surreybusinessnews.co.uk" : `site${at}.co.uk`,
    title: at === 0 ? "The 10 best web design agencies in Surrey for 2026" : `Page ${at}`,
    day: day(at),
    kind: at % 6,
    tone: at % 3,
    strength: 400 - at,
    linked: at % 2,
  })),
};

const business = (host: string, mentions: number, you = false) => ({ host, you, mentions, before: mentions - 3, well: Math.round(mentions * 0.7), badly: 1, noLink: Math.round(mentions / 2), series: many(12, (at) => mentions - 11 + at) });
const RIVALS = {
  months: many(12, (at) => `2025-${String(at + 1).padStart(2, "0")}`),
  businesses: [business("brightsidedigital.co.uk", 41), business("ronins.co.uk", 23, true), business("kestrelcreative.co.uk", 19), business("surreyweb.co", 14), business("northlane.studio", 11)],
};

const LISTED = {
  // Past a page, so its rows-per-page choice shows as drawn.
  rows: many(30, (at) => ({
    host: at === 0 ? "clutch.co" : `place${at}.co.uk`,
    kind: (["DIRECTORY", "REVIEWS", "NEWS", "WEBSITE"] as const)[at % 4],
    quoted: 86 - at,
    linksTo: at % 2 ? ["brightsidedigital.co.uk", "kestrelcreative.co.uk"] : [],
    rivals: ["brightsidedigital.co.uk", "kestrelcreative.co.uk", "surreyweb.co"],
    strength: 712 - at,
    there: false,
  })),
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
  useMiddayUtc();
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Discovery → Web mentions' approved looks", () => {
  it("All mentions", async () => {
    at("/app/sites/site_1/mentions");
    answer({ "siteWebMentions:webMentions": MENTIONS });
    const { container } = render(<WebMentionsPage />);
    await screen.findByText("The 10 best web design agencies in Surrey for 2026");
    await expectApprovedLook(container, PLAN, "WebMentions", "Discovery → Web mentions → All mentions");
  });

  it("Against rivals", async () => {
    at("/app/sites/site_1/mentions/rivals");
    answer({ "siteWebMentions:mentionsAgainstRivals": RIVALS });
    const { container } = render(<MentionsAgainstRivalsPage />);
    await screen.findByText("ronins.co.uk · you");
    await expectApprovedLook(container, PLAN, "WebMentionsRivals", "Discovery → Web mentions → Against rivals");
  });

  it("Where to get listed", async () => {
    at("/app/sites/site_1/mentions/listed");
    answer({ "siteWebMentions:whereToGetListed": LISTED });
    const { container } = render(<WhereToGetListedPage />);
    await screen.findByText("clutch.co");
    await expectApprovedLook(container, PLAN, "ListingsGap", "Discovery → Web mentions → Where to get listed");
  });
});
