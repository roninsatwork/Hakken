import { asArray, asNumber, asRecord, asString, type UnknownRecord } from "./utils/unknownShapes";

/**
 * What Keyword research buys from DataForSEO, and how each answer is read
 * (docs/plans/active/keyword-research-plan.md). Every call is a live one —
 * the person who pressed Look up is waiting — and its own, never the
 * collection's registry (`dataForSeoRegistry.ts`), so no other agent can ask
 * for one. Each is written to the company's DataForSEO spend like any other
 * (`seoDataPulls`, under these ids).
 *
 * The readers are pure: what DataForSEO answered in, what the screens hold
 * out, and anything missing as null, never a guess.
 */

/** English for every country on the list (`researchCountries.ts`). */
const LANGUAGE_CODE = "en";

/** The most keywords one keyword-overview call takes (DataForSEO's own limit is 700). */
export const OVERVIEW_KEYWORDS_PER_CALL = 700;

/** How deep Google's results are read: deep enough to say "not in the top 100". */
export const SERP_DEPTH = 100;

/** A month older than this many is not kept: the overview's chart is the last 24 months. */
export const MONTHS_KEPT = 24;

export type ResearchCall = {
  id: string;
  path: string;
  family: string;
  /** What the run's timeline calls it. */
  name: string;
};

export const RESEARCH_CALLS = {
  overview: {
    id: "research_keyword_overview",
    path: "/v3/dataforseo_labs/google/keyword_overview/live",
    family: "DataForSEO Labs",
    name: "keyword overviews",
  },
  history: {
    id: "research_search_history",
    path: "/v3/dataforseo_labs/google/historical_search_volume/live",
    family: "DataForSEO Labs",
    name: "searches a month, 24 months",
  },
  serp: {
    id: "research_google_results",
    path: "/v3/serp/google/organic/live/advanced",
    family: "SERP",
    name: "Google's top 100",
  },
  /** The top ten's visits and keywords, one call for all ten, bought with the lookup: the overview's top five show the visits. */
  traffic: {
    id: "research_page_traffic",
    path: "/v3/dataforseo_labs/google/bulk_traffic_estimation/live",
    family: "DataForSEO Labs",
    name: "the top ten's visits",
  },
  /** Bought when Google's results are first opened: each top-ten page's strength… */
  strength: {
    id: "research_page_strength",
    path: "/v3/backlinks/bulk_ranks/live",
    family: "Backlinks",
    name: "the top ten's strength",
  },
  /** …the websites linking to it… */
  linking: {
    id: "research_page_linking",
    path: "/v3/backlinks/bulk_referring_domains/live",
    family: "Backlinks",
    name: "the top ten's linking websites",
  },
  /** …and what it ranks for: its top keyword, and the "also rank for" ideas. One call a page. */
  pageKeywords: {
    id: "research_page_keywords",
    path: "/v3/dataforseo_labs/google/ranked_keywords/live",
    family: "DataForSEO Labs",
    name: "what a top page ranks for",
  },
  /** Ideas, terms match: searches that hold the keyword's words, the most searched first. */
  terms: {
    id: "research_ideas_terms",
    path: "/v3/dataforseo_labs/google/keyword_suggestions/live",
    family: "DataForSEO Labs",
    name: "keyword ideas, terms match",
  },
  /** Ideas, questions: the same, only those asked as a question. */
  questions: {
    id: "research_ideas_questions",
    path: "/v3/dataforseo_labs/google/keyword_suggestions/live",
    family: "DataForSEO Labs",
    name: "keyword ideas, questions",
  },
} as const satisfies Record<string, ResearchCall>;

/** A search asked as a question: it starts with a question word. */
export const QUESTION_PATTERN = "^(who|what|where|when|why|how|which|whose|whom|can|could|is|are|do|does|did|should|will|would)\\s";

/** The pages Google's results screen holds in full. */
export const TOP_PAGES = 10;

export function overviewTask(keywords: readonly string[], locationCode: number): UnknownRecord {
  return { keywords: [...keywords], location_code: locationCode, language_code: LANGUAGE_CODE, include_serp_info: true };
}

export function historyTask(keywords: readonly string[], locationCode: number): UnknownRecord {
  return { keywords: [...keywords], location_code: locationCode, language_code: LANGUAGE_CODE };
}

export function serpTask(keyword: string, locationCode: number): UnknownRecord {
  return { keyword, location_code: locationCode, language_code: LANGUAGE_CODE, depth: SERP_DEPTH };
}

export type KeywordOverview = {
  searchVolume: number | null;
  cpc: number | null;
  competitionLevel: string | null;
  difficulty: number | null;
  intent: string | null;
  monthly: Array<{ month: string; volume: number }>;
  serpKinds: string[];
  resultsCount: number | null;
  topTenLinkingSites: number | null;
  /** The top ten's domains' strength on average, 0 to 100: DataForSEO's main domain rank of 0 to 1,000 divided by ten. */
  topTenDomainStrength: number | null;
};

/** The result's items, wherever the envelope's task put them. */
function itemsOf(result: unknown): UnknownRecord[] {
  return asArray(result).flatMap((entry) => asArray(asRecord(entry)?.items)).flatMap((item) => {
    const record = asRecord(item);
    return record ? [record] : [];
  });
}

const orNull = <T>(value: T | undefined): T | null => (value === undefined ? null : value);

/** A keyword's months, oldest first, the last `MONTHS_KEPT`. */
export function monthsOf(keywordInfo: UnknownRecord | null): Array<{ month: string; volume: number }> {
  return asArray(keywordInfo?.monthly_searches)
    .flatMap((entry) => {
      const month = asRecord(entry);
      const year = asNumber(month?.year);
      const number = asNumber(month?.month);
      if (year === undefined || number === undefined) return [];
      return [{ month: `${year}-${String(number).padStart(2, "0")}`, volume: asNumber(month?.search_volume) ?? 0 }];
    })
    .sort((left, right) => left.month.localeCompare(right.month))
    .slice(-MONTHS_KEPT);
}

/** Keyword overview: each keyword's figures, by the keyword as DataForSEO wrote it back (lower case). */
export function readKeywordOverviews(result: unknown): Map<string, KeywordOverview> {
  const read = new Map<string, KeywordOverview>();
  for (const item of itemsOf(result)) {
    const keyword = asString(item.keyword)?.toLowerCase();
    if (!keyword) continue;
    const info = asRecord(item.keyword_info);
    const properties = asRecord(item.keyword_properties);
    const serp = asRecord(item.serp_info);
    const links = asRecord(item.avg_backlinks_info);
    read.set(keyword, {
      searchVolume: orNull(asNumber(info?.search_volume)),
      cpc: orNull(asNumber(info?.cpc)),
      competitionLevel: orNull(asString(info?.competition_level)),
      difficulty: orNull(asNumber(properties?.keyword_difficulty)),
      intent: orNull(asString(asRecord(item.search_intent_info)?.main_intent)),
      monthly: monthsOf(info),
      serpKinds: asArray(serp?.serp_item_types).flatMap((kind) => {
        const name = asString(kind);
        return name && name !== "organic" ? [name] : [];
      }),
      resultsCount: orNull(asNumber(serp?.se_results_count)),
      topTenLinkingSites: orNull(asNumber(links?.referring_domains)),
      topTenDomainStrength: strengthOf(asNumber(links?.main_domain_rank)),
    });
  }
  return read;
}

/** DataForSEO's rank of 0 to 1,000 as a strength of 0 to 100: the scale every strength in Keyword research is read on. */
function strengthOf(rank: number | undefined): number | null {
  return rank === undefined ? null : Math.round(rank / 10);
}

/** Historical search volume: each keyword's last 24 months. */
export function readSearchHistories(result: unknown): Map<string, Array<{ month: string; volume: number }>> {
  const read = new Map<string, Array<{ month: string; volume: number }>>();
  for (const item of itemsOf(result)) {
    const keyword = asString(item.keyword)?.toLowerCase();
    if (keyword) read.set(keyword, monthsOf(asRecord(item.keyword_info)));
  }
  return read;
}

export type SerpResult = { position: number; url: string; domain: string; title: string };

/** A host as the screens compare them: lower case, without "www.". */
export function hostOf(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^www\./, "");
  }
}

/** Google's ordinary results, in order — the adverts, maps and answer boxes left out. */
export function readGoogleResults(result: unknown): SerpResult[] {
  return itemsOf(result)
    .flatMap((item) => {
      if (asString(item.type) !== "organic") return [];
      const position = asNumber(item.rank_group);
      const url = asString(item.url);
      if (position === undefined || !url) return [];
      return [{ position, url, domain: hostOf(asString(item.domain) ?? url), title: asString(item.title) ?? "" }];
    })
    .sort((left, right) => left.position - right.position);
}

export function trafficTask(urls: readonly string[], locationCode: number): UnknownRecord {
  return { targets: [...urls], location_code: locationCode, language_code: LANGUAGE_CODE, item_types: ["organic"] };
}

export function strengthTask(urls: readonly string[]): UnknownRecord {
  return { targets: [...urls] };
}

export function pageKeywordsTask(url: string, locationCode: number, limit: number): UnknownRecord {
  return {
    target: url,
    location_code: locationCode,
    language_code: LANGUAGE_CODE,
    item_types: ["organic"],
    limit,
    order_by: ["ranked_serp_element.serp_item.etv,desc"],
  };
}

/** A page's address as the bulk calls give it back: no scheme, no "www.", no trailing slash, lower-case host. */
export function pageKey(url: string): string {
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return url.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

/** Bulk traffic estimation: each page's estimated visits a month and how many searches it ranks for. */
export function readPageTraffic(result: unknown): Map<string, { visits: number | null; keywords: number | null }> {
  const read = new Map<string, { visits: number | null; keywords: number | null }>();
  for (const item of itemsOf(result)) {
    const target = asString(item.target);
    if (!target) continue;
    const organic = asRecord(asRecord(item.metrics)?.organic);
    read.set(pageKey(target), { visits: orNull(asNumber(organic?.etv)), keywords: orNull(asNumber(organic?.count)) });
  }
  return read;
}

/** Bulk ranks: each page's strength, 0 to 100 — DataForSEO's rank of 0 to 1,000 divided by ten. */
export function readPageStrength(result: unknown): Map<string, number> {
  const read = new Map<string, number>();
  for (const item of itemsOf(result)) {
    const target = asString(item.target);
    const strength = strengthOf(asNumber(item.rank));
    if (target && strength !== null) read.set(pageKey(target), strength);
  }
  return read;
}

/** Bulk referring domains: how many websites link to each page. */
export function readPageLinking(result: unknown): Map<string, number> {
  const read = new Map<string, number>();
  for (const item of itemsOf(result)) {
    const target = asString(item.target);
    const domains = asNumber(item.referring_domains);
    if (target && domains !== undefined) read.set(pageKey(target), domains);
  }
  return read;
}

export type IdeaRow = { keyword: string; volume: number | null; difficulty: number | null; intent: string | null; cpc: number | null };

/** Ranked keywords: what a page ranks for, the most visits first, as idea rows. */
export function readPageKeywords(result: unknown): IdeaRow[] {
  return itemsOf(result).flatMap((item) => {
    const data = asRecord(item.keyword_data);
    const keyword = asString(data?.keyword)?.toLowerCase();
    if (!keyword) return [];
    const info = asRecord(data?.keyword_info);
    return [{
      keyword,
      volume: orNull(asNumber(info?.search_volume)),
      difficulty: orNull(asNumber(asRecord(data?.keyword_properties)?.keyword_difficulty)),
      intent: orNull(asString(asRecord(data?.search_intent_info)?.main_intent)),
      cpc: orNull(asNumber(info?.cpc)),
    }];
  });
}

export function ideasTask(keyword: string, locationCode: number, limit: number, questions: boolean): UnknownRecord {
  return {
    keyword,
    location_code: locationCode,
    language_code: LANGUAGE_CODE,
    limit,
    include_seed_keyword: false,
    order_by: ["keyword_info.search_volume,desc"],
    ...(questions ? { filters: ["keyword", "regex", QUESTION_PATTERN] } : {}),
  };
}

/** Keyword suggestions: the ideas, the most searched first, and how many DataForSEO holds in all. */
export function readIdeas(result: unknown): { total: number | null; rows: IdeaRow[] } {
  const total = asNumber(asRecord(asArray(result)[0])?.total_count) ?? null;
  const rows = itemsOf(result).flatMap((item) => {
    const keyword = asString(item.keyword)?.toLowerCase();
    if (!keyword) return [];
    const info = asRecord(item.keyword_info);
    return [{
      keyword,
      volume: orNull(asNumber(info?.search_volume)),
      difficulty: orNull(asNumber(asRecord(item.keyword_properties)?.keyword_difficulty)),
      intent: orNull(asString(asRecord(item.search_intent_info)?.main_intent)),
      cpc: orNull(asNumber(info?.cpc)),
    }];
  });
  return { total, rows };
}
