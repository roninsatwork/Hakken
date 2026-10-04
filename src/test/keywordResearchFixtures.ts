import messages from "../../messages/en.json";
import { vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { answerQueries, convexPath } from "./siteViewFixtures";

/** The four assistants, as the screens name them (`aiEngines` in the word file), without naming them here. */
export const AI_ENGINE_KEYS = Object.keys(messages.aiEngines).filter((key) => key !== "googleAiOverview");

/**
 * Keyword research's reads as its screens' tests answer them
 * (docs/plans/active/keyword-research-plan.md): acme-agency.test's lookups and
 * lists, shaped as `convex/keywordResearch.ts` returns them, with the figures
 * the approved drawings show.
 */

export const SITE_ID = "site_1";
export const LOOKUP_ID = "lookup_1";
export const LIST_ID = "list_1";

export const SETUP = {
  canLookUp: true,
  countries: [
    { code: 2826, label: "United Kingdom" },
    { code: 2372, label: "Ireland" },
    { code: 2840, label: "United States" },
    { code: 2036, label: "Australia" },
    { code: 2124, label: "Canada" },
  ],
  websites: [
    { siteId: SITE_ID, host: "acme-agency.test", homeCountry: 2826 },
    { siteId: "site_2", host: "acme-agency.ie", homeCountry: 2372 },
  ],
  limits: { keywordsPerLookup: 10, ideasPerKind: 100, reuseDays: 30 },
  agent: { active: true, test: false },
};

const lookupRow = (lookupId: string, keyword: string, volume: number | null, difficulty: number | null, intent: string | null, position: number | null, day: number) => ({
  lookupId,
  keyword,
  locationCode: 2826,
  country: "United Kingdom",
  host: "acme-agency.test",
  state: "READY",
  openedAt: Date.UTC(2026, 8, day, 9, 0),
  volume,
  difficulty,
  intent,
  position,
  notInTop100: position === null,
  sample: false,
});

export const LOOKUPS = [
  lookupRow(LOOKUP_ID, "web design agency", 3600, 64, "commercial", 18, 30),
  lookupRow("lookup_2", "brand identity prism", 880, 29, "informational", 2, 29),
  lookupRow("lookup_3", "website redesign cost", 720, 22, "commercial", null, 28),
];

export const LISTS = [
  { listId: LIST_ID, name: "Web design – London", keywords: 3, volume: 5410, host: "acme-agency.test", updatedAt: Date.UTC(2026, 9, 1) },
  { listId: "list_2", name: "AI services", keywords: 12, volume: 9100, host: null, updatedAt: Date.UTC(2026, 8, 30) },
];

const MONTHS = Array.from({ length: 24 }, (_, index) => {
  const date = new Date(Date.UTC(2024, 9 + index, 1));
  return { month: date.toISOString().slice(0, 7), volume: 2900 + (index % 4) * 350 };
});

const page = (position: number, url: string, title: string, kind: string | null, visits: number, keywords: number) => ({
  position,
  url,
  domain: new URL(url).hostname.replace(/^www\./, ""),
  title,
  kind,
  strength: null,
  linkingSites: null,
  visits,
  keywords,
  topKeyword: null,
});

const TOP = [
  page(1, "https://madebyshape.co.uk/", "MadeByShape: Web Design Agency", "HOME", 9400, 122),
  page(2, "https://www.awwwards.com/websites/design-agencies/", "Best Web Agencies Websites", null, 5100, 150),
  page(3, "https://kota.co.uk/", "Branding & Web Design Agency | Kota", "HOME", 6200, 152),
  page(4, "https://class.agency/", "Web Design Agency Birmingham | Class", "HOME", 1500, 45),
  page(5, "https://plugandplaydesign.co.uk/", "Web Design Agency London | Plug & Play", "HOME", 2200, 113),
];

export const OVERVIEW = {
  lookupId: LOOKUP_ID,
  keyword: "web design agency",
  locationCode: 2826,
  country: "United Kingdom",
  state: "READY" as const,
  problem: null as string | null,
  openedAt: Date.UTC(2026, 9, 1, 8, 14),
  boughtAt: Date.UTC(2026, 9, 1, 8, 14),
  costUsd: 0.34 as number | null,
  sample: false,
  overview: {
    volume: 3600,
    cpc: 6.2,
    competitionLevel: "HIGH",
    difficulty: 64,
    intent: "commercial",
    monthly: MONTHS,
    serpKinds: ["local_pack", "people_also_ask"],
    resultsCount: 1_250_000,
    topTenLinkingSites: 180,
  },
  top: TOP,
  topResult: TOP[0],
  resultsCount: 10,
  results: null as string | null,
  serpBoughtAt: Date.UTC(2026, 9, 1, 8, 14),
  forWebsite: {
    siteId: SITE_ID,
    host: "acme-agency.test",
    position: 18,
    url: "https://acme-agency.test/custom-web-design-agency/",
    notInTop100: false,
    visits: 40,
    checkedDay: "2026-09-29",
    linkingSites: 312,
    tracked: false,
    verdict: "IMPROVE" as const,
    competitors: [
      { host: "plugandplaydesign.co.uk", position: 5 },
      { host: "lightflows.co.uk", position: null },
    ],
  },
  countries: [
    { code: 2826, label: "United Kingdom", state: "HOME", volume: 3600 },
    { code: 2372, label: "Ireland", state: null, volume: null },
    { code: 2840, label: "United States", state: "READY", volume: 14800 },
    { code: 2036, label: "Australia", state: null, volume: null },
    { code: 2124, label: "Canada", state: null, volume: null },
  ],
  lists: [
    { listId: LIST_ID, name: "Web design – London" },
    { listId: "list_2", name: "AI services" },
  ],
  canLookUp: true,
};

const result = (position: number, url: string, title: string, kind: string | null, strength: number, linkingSites: number, visits: number, keywords: number, who: "YOU" | "RIVAL" | null) => ({
  position,
  url,
  domain: new URL(url).hostname.replace(/^www\./, ""),
  title,
  kind,
  strength,
  linkingSites,
  visits,
  keywords,
  topKeyword: "web design agency",
  who,
});

export const RESULTS = {
  lookupId: LOOKUP_ID,
  keyword: "web design agency",
  country: "United Kingdom",
  state: "READY" as string | null,
  problem: null as string | null,
  checkedAt: Date.UTC(2026, 9, 1, 8, 14),
  detailsAt: Date.UTC(2026, 9, 1, 8, 20),
  sample: false,
  rows: [
    result(1, "https://madebyshape.co.uk/", "MadeByShape: Web Design Agency", "HOME", 72, 2100, 9400, 122, null),
    result(2, "https://www.awwwards.com/websites/design-agencies/", "Best Web Agencies Websites", null, 89, 44, 5100, 150, null),
    result(3, "https://plugandplaydesign.co.uk/", "Web Design Agency London | Plug & Play", "HOME", 64, 1700, 2200, 113, "RIVAL"),
  ],
  beyond: [
    { domain: "acme-agency.test", who: "YOU" as const, position: 18, url: "https://acme-agency.test/custom-web-design-agency/" },
    { domain: "plugandplaydesign.co.uk", who: "RIVAL" as const, position: 3, url: "https://plugandplaydesign.co.uk/" },
    { domain: "lightflows.co.uk", who: "RIVAL" as const, position: null, url: null },
  ],
};

const listRow = (keyword: string, volume: number, difficulty: number, intent: string, position: number | null, url: string | null, verdict: string, tracked: boolean) => ({
  keyword,
  text: keyword,
  locationCode: 2826,
  volume,
  difficulty,
  intent,
  position,
  url,
  verdict,
  tracked,
  addedAt: Date.UTC(2026, 9, 1),
});

export const LIST = {
  listId: LIST_ID,
  name: "Web design – London",
  siteId: SITE_ID as string | null,
  host: "acme-agency.test" as string | null,
  createdBy: "Anthony Basker",
  createdAt: Date.UTC(2026, 9, 1),
  rows: [
    listRow("web design agency", 3600, 64, "commercial", 18, "https://acme-agency.test/custom-web-design-agency/", "IMPROVE", false),
    listRow("web design agency near me", 2900, 41, "commercial", null, null, "NEW_PAGE", false),
    listRow("web design agency surrey", 210, 24, "commercial", 2, "https://acme-agency.test/web-design-surrey/", "WINNING", true),
  ],
  canChange: true,
};

const idea = (keyword: string, volume: number, difficulty: number, intent: string, cpc: number | null, position: number | null, page: string | null) => ({
  keyword, volume, difficulty, intent, cpc, position, page,
});

/** Keyword ideas, the same rows whichever kind is asked for: what a test of one kind needs. */
export const IDEAS = {
  lookupId: LOOKUP_ID,
  keyword: "web design agency",
  country: "United Kingdom",
  host: "acme-agency.test" as string | null,
  siteId: SITE_ID as string | null,
  kind: "TERMS",
  state: "READY" as string | null,
  problem: null as string | null,
  boughtAt: Date.UTC(2026, 9, 1, 8, 14) as number | null,
  sample: false,
  counts: { TERMS: 1000, QUESTIONS: 86, ALSO_RANK: 410 } as Record<"TERMS" | "QUESTIONS" | "ALSO_RANK", number | null>,
  rows: [
    idea("web design agency near me", 2900, 41, "commercial", 7.1, null, null),
    idea("web design agency london", 1600, 58, "commercial", 8.4, 27, "https://acme-agency.test/web-design-london/"),
    idea("how to choose a web design agency", 210, 18, "informational", 2.4, 9, "https://acme-agency.test/hub/how-to-choose-a-web-design-agency/"),
    idea("web design agency surrey", 210, 24, "commercial", 4.6, 2, "https://acme-agency.test/web-design-surrey/"),
  ],
};

const engine = (name: string, named: Array<[string, "YOU" | "RIVAL" | null]>, cited: number) => {
  const place = named.findIndex(([, who]) => who === "YOU");
  return {
    engine: name,
    answered: true,
    answer: "Some agencies to consider…",
    named: named.map(([host, who]) => ({ host, who })),
    yourPlace: place >= 0 ? place + 1 : null,
    rivalsNamed: named.filter(([, who]) => who === "RIVAL").map(([host]) => host),
    cited: Array.from({ length: cited }, (_, index) => ({ url: `https://example${index}.com/`, host: `example${index}.com` })),
    citedYours: 0,
  };
};

/** What the AI says, as drawn: Perplexity alone names acme-agency.test, fourth of seven. */
export const ANSWERS = {
  lookupId: LOOKUP_ID,
  keyword: "web design agency",
  country: "United Kingdom",
  host: "acme-agency.test" as string | null,
  state: "READY" as string | null,
  problem: null as string | null,
  askedAt: Date.UTC(2026, 9, 1, 8, 20) as number | null,
  sample: false,
  question: "Which web design agency should I use in the UK?" as string | null,
  figures: { answered: 4, nameYou: 1, nameARival: 3, rivalMost: "plugandplaydesign.co.uk", businessesNamed: 14, pagesCited: 22, pagesCitedYours: 0 } as {
    answered: number; nameYou: number; nameARival: number; rivalMost: string | null; businessesNamed: number; pagesCited: number; pagesCitedYours: number;
  } | null,
  engines: [
    engine(AI_ENGINE_KEYS[0], [["kota.co.uk", null], ["madebyshape.co.uk", null], ["plugandplaydesign.co.uk", "RIVAL"]], 6),
    engine(AI_ENGINE_KEYS[1], [["kota.co.uk", null], ["madebyshape.co.uk", null], ["plugandplaydesign.co.uk", "RIVAL"], ["acme-agency.test", "YOU"], ["pixelfield.co.uk", "RIVAL"], ["clay.global", null], ["huemor.com", null]], 9),
    engine(AI_ENGINE_KEYS[2], [["madebyshape.co.uk", null], ["kota.co.uk", null], ["plugandplaydesign.co.uk", "RIVAL"]], 4),
    engine(AI_ENGINE_KEYS[3], [["kota.co.uk", null], ["madebyshape.co.uk", null]], 3),
  ],
  mostNamed: [
    { host: "kota.co.uk", who: null, count: 4 },
    { host: "plugandplaydesign.co.uk", who: "RIVAL" as const, count: 3 },
    { host: "acme-agency.test", who: "YOU" as const, count: 1 },
  ],
  searches: [
    { query: "best web design agencies uk 2026", times: 3, page: null },
    { query: "web design agency vs freelancer", times: 2, page: "https://acme-agency.test/hub/how-to-choose-a-web-design-agency/" },
  ],
  canAsk: true,
};

/** Start from a competitor: acme-agency.test's competitors and the searches each ranks for that it doesn't. */
export const STARTS = {
  preparing: false,
  rivals: [
    { rivalSiteId: "rival_1", host: "plugandplaydesign.co.uk", gap: 2310 as number | null },
    { rivalSiteId: "rival_2", host: "pixelfield.co.uk", gap: 1105 as number | null },
  ],
};

export const GAP = {
  host: "acme-agency.test",
  rivalHost: "plugandplaydesign.co.uk",
  locationCode: 2826,
  preparing: false,
  rows: [
    { keyword: "web design agency london", position: 6, volume: 1600, difficulty: 58, intent: "BUYING" },
    { keyword: "how much does a website cost uk", position: 12, volume: 2400, difficulty: 46, intent: "RESEARCHING" },
    { keyword: "web design guildford", position: 1, volume: 260, difficulty: 21, intent: "BUYING" },
  ],
};

/** Search Console connected for acme-agency.test, its newest day 1 October 2026. */
export const CONSOLE_STATUS = {
  configured: true,
  owned: true,
  canManage: true,
  host: "acme-agency.test",
  connection: { status: "CONNECTED", newestDay: "2026-10-01", oldestDay: "2025-01-01", countriesNewest: [] },
};

/** What Search Console counted for the keyword over its last 28 days. */
export const CONSOLE_SERIES = {
  ok: true,
  days: [],
  totals: { clicks: 6, impressions: 1180, ctr: 6 / 1180, position: 16.2 },
  previous: null,
  previousHeld: true,
};

/**
 * Answers each read by the end of its name, and hands back each mutation's
 * spy by name — one per function for the whole test, as Convex's is — so a
 * test can ask which was called, and with what. An action answers from
 * `actions`, or never.
 */
export function answerResearch(queries: Record<string, unknown>, actions: Record<string, unknown> = {}) {
  const mutations = new Map<string, ReturnType<typeof vi.fn>>();
  const answers = new Map<string, ReturnType<typeof vi.fn>>();
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
    const name = convexPath(reference);
    if (!mutations.has(name)) {
      mutations.set(name, vi.fn(async () => (name.endsWith("lookUp") ? { lookupIds: ["lookup_new"], waiting: 1 } : name.endsWith("addToResearchList") ? { listId: "list_new", added: 1 } : name.endsWith("trackFromResearchList") ? { tracked: 1 } : null)));
    }
    return mutations.get(name);
  }) as never);
  vi.mocked(useAction).mockImplementation(((reference: unknown) => {
    const name = convexPath(reference);
    if (!answers.has(name)) {
      const match = Object.keys(actions).find((suffix) => name.endsWith(suffix));
      answers.set(name, match ? vi.fn(() => Promise.resolve(actions[match])) : vi.fn(() => new Promise(() => undefined)));
    }
    return answers.get(name);
  }) as never);
  /** The spy behind a mutation, by the end of its name. */
  return (suffix: string) => {
    const name = [...mutations.keys()].find((entry) => entry.endsWith(`:${suffix}`));
    if (!name) throw new Error(`${suffix} was never asked for`);
    return mutations.get(name)!;
  };
}
