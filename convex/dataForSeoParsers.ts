/**
 * Turning a DataForSEO payload into the few numbers a screen plots.
 *
 * Pure functions, one per operation, kept apart from everything that touches
 * the network or the database so they can be tested against a saved response.
 * That separation is the point: when a parser is wrong, the fix is to correct
 * it and re-run it over the raw files we already hold, never to re-buy the
 * data.
 *
 * **Nothing here lets page text through.** A SERP result is text from the open
 * web, and a title can be written to read as an instruction. Positions,
 * counts and scores are safe to store and show; titles and snippets are not,
 * and the way to keep them out of an agent's prompt is not to keep them.
 *
 * Two kinds of text are kept, each on purpose. **Searches** — an engine's
 * fan-out, Google's "People also ask" questions and its related searches — are
 * what people type, not what a page says, and are kept like any search. **An
 * AI engine's answer** is kept word for word since D9 (see `parseLlmResponse`),
 * to be read as quoted material, never followed.
 */

export type ParsedSeoResult = {
  /** The small, permanent numbers, stored as JSON on the metrics row. */
  metrics: Record<string, number | string | null>;
  /** One row per keyword, when the operation was about keywords. */
  positions?: Array<RankedPosition>;
  /**
   * The searches the site buys adverts on, from the same ranked-keywords
   * answer, which returns adverts beside organic results unless told not to.
   * Kept apart so an advert is never read as a ranking the site earned.
   */
  paidPositions?: Array<PaidPosition>;
  /** Appearances in results-page features, when the call asked for them (the full keyword list). */
  featurePositions?: Array<FeaturePosition>;
};

export type PaidPosition = {
  keyword: string;
  position?: number;
  url?: string;
  searchVolume?: number;
  cpc?: number;
  traffic?: number;
  trafficCost?: number;
};

/**
 * One keyword a site ranks for, with what DataForSEO says about it and about
 * the page that ranks. Everything past `searchVolume` is read out for the
 * client's Sites screens (docs/plans/active/user-sites-plan.md, Phase 2):
 * what a click costs, how hard the search is, how it has been searched month
 * by month, the traffic it brings, what else is on its results page, and the
 * ranking page's page rank and links — never its title (see above).
 */
export type RankedPosition = {
  keyword: string;
  position?: number;
  url?: string;
  searchVolume?: number;
  cpc?: number;
  difficulty?: number;
  /** Monthly searches over the last year, oldest first. */
  trend?: number[];
  traffic?: number;
  trafficValue?: number;
  serpFeatures?: string[];
  pageRank?: number;
  pageReferringDomains?: number;
  pageBacklinks?: number;
  /** How competitive the search is for adverts, 0–1, and as DataForSEO's LOW/MEDIUM/HIGH. */
  competition?: number;
  competitionLevel?: string;
  /** What DataForSEO reads the searcher as wanting: informational, commercial and so on. */
  searchIntent?: string;
  /** How many results Google has for the search. */
  resultsCount?: number;
  /** Where the site was at DataForSEO's previous check, and whether it is new, up or down since. */
  previousPositionDfs?: number;
  movementDfs?: "NEW" | "UP" | "DOWN" | "SAME";
};

/** A site's appearance in a results-page feature — an AI Overview's source, an answer box, a map pack. */
export type FeaturePosition = {
  keyword: string;
  feature: "ai_overview_reference" | "featured_snippet" | "local_pack";
  position?: number;
  url?: string;
};

const FEATURE_TYPES = new Set(["ai_overview_reference", "featured_snippet", "local_pack"]);

type Unknown = Record<string, unknown>;

function asRecord(value: unknown): Unknown | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Unknown : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The first result item, which is where every DataForSEO endpoint puts the
 * thing that was asked about. The array wrapper exists for endpoints that
 * accept several targets; ours never do.
 */
function firstItem(result: unknown): Unknown | null {
  const items = asArray(result);
  return items.length > 0 ? asRecord(items[0]) : asRecord(result);
}

/** How many sites link to this one, and how strong they are. */
export function parseBacklinksSummary(result: unknown): ParsedSeoResult {
  const item = firstItem(result);
  if (!item) return { metrics: {} };

  return {
    metrics: {
      backlinks: asNumber(item.backlinks) ?? 0,
      referringDomains: asNumber(item.referring_domains) ?? 0,
      referringMainDomains: asNumber(item.referring_main_domains) ?? 0,
      rank: asNumber(item.rank) ?? 0,
      brokenBacklinks: asNumber(item.broken_backlinks) ?? 0,
      // For the Link quality and Where links come from screens. The
      // breakdowns are small maps (domain ending, country, kind of site),
      // kept as JSON text because a metrics row holds flat values.
      spamScore: asNumber(item.backlinks_spam_score) ?? null,
      brokenPages: asNumber(item.broken_pages) ?? null,
      nofollowReferringDomains: asNumber(item.referring_domains_nofollow) ?? null,
      tldsJson: topCounts(item.referring_links_tld),
      countriesJson: topCounts(item.referring_links_countries),
      platformsJson: topCounts(item.referring_links_platform_types),
      linkTypesJson: topCounts(item.referring_links_types),
      attributesJson: topCounts(item.referring_links_attributes),
    },
  };
}

/** A breakdown map's largest entries, as JSON text: `[["com", 3333], …]`. */
function topCounts(value: unknown, keep = 15): string | null {
  const record = asRecord(value);
  if (!record) return null;
  const entries = Object.entries(record)
    .flatMap(([key, count]) => (typeof count === "number" && count > 0 ? [[key || "(none)", count] as [string, number]] : []))
    .sort((left, right) => right[1] - left[1])
    .slice(0, keep);
  return JSON.stringify(entries);
}

/** DataForSEO's own move for a ranking since its previous check, from `rank_changes`. */
function movementOf(changes: Record<string, unknown> | null): RankedPosition["movementDfs"] {
  if (!changes) return undefined;
  if (changes.is_new === true) return "NEW";
  if (changes.is_up === true) return "UP";
  if (changes.is_down === true) return "DOWN";
  return typeof changes.previous_rank_absolute === "number" ? "SAME" : undefined;
}

/**
 * What a site already ranks for.
 *
 * This is the one operation that discovers keywords rather than measuring one,
 * which is why a site with tens of thousands of them is still a single paid
 * call. The positions it returns are stored per keyword; the summary numbers
 * go on the metrics row.
 */
export function parseDomainRankedKeywords(result: unknown): ParsedSeoResult {
  const item = firstItem(result);
  if (!item) return { metrics: {} };

  const rows = asArray(item.items);
  const positions: NonNullable<ParsedSeoResult["positions"]> = [];
  const paidPositions: PaidPosition[] = [];
  const featurePositions: FeaturePosition[] = [];

  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;

    const keywordData = asRecord(record.keyword_data);
    const keyword = asString(keywordData?.keyword);
    if (!keyword) continue;

    const rankedElement = asRecord(record.ranked_serp_element);
    const serpElement = asRecord(rankedElement?.serp_item);
    const keywordInfo = asRecord(keywordData?.keyword_info);

    // An advert is not a ranking. The call returns both unless told not to,
    // so an advertiser's adverts were read as organic places until
    // 2026-09-23; now they are kept apart, for the Sites Paid search pages.
    const type = asString(serpElement?.type) ?? "organic";
    if (type === "paid") {
      const optional = <T>(key: string, value: T | undefined) => (value === undefined ? {} : { [key]: value });
      paidPositions.push({
        keyword,
        ...optional("position", asNumber(serpElement?.rank_absolute)),
        ...optional("url", asString(serpElement?.url)),
        ...optional("searchVolume", asNumber(keywordInfo?.search_volume)),
        ...optional("cpc", asNumber(keywordInfo?.cpc)),
        ...optional("traffic", asNumber(serpElement?.etv)),
        ...optional("trafficCost", asNumber(serpElement?.estimated_paid_traffic_cost)),
      } as PaidPosition);
      continue;
    }
    // Nor is a results-page feature the site appears in — an AI Overview's
    // source, a map pack, an answer box. The call returns those only when
    // asked for them (`item_types`); they are kept apart, never filed as a
    // place in the organic results.
    if (type !== "organic") {
      if (FEATURE_TYPES.has(type)) {
        featurePositions.push({
          keyword,
          feature: type as FeaturePosition["feature"],
          ...(asNumber(serpElement?.rank_absolute) !== undefined ? { position: asNumber(serpElement?.rank_absolute) } : {}),
          ...(asString(serpElement?.url) ? { url: asString(serpElement?.url) } : {}),
        });
      }
      continue;
    }
    const properties = asRecord(keywordData?.keyword_properties);
    const serpInfo = asRecord(keywordData?.serp_info);
    const pageLinks = asRecord(serpElement?.backlinks_info);
    const pageRank = asRecord(serpElement?.rank_info);
    const rankChanges = asRecord(serpElement?.rank_changes);

    const trend = asArray(keywordInfo?.monthly_searches)
      .map((month) => asRecord(month))
      .flatMap((month) => {
        const year = asNumber(month?.year);
        const number = asNumber(month?.month);
        const volume = asNumber(month?.search_volume);
        return year !== undefined && number !== undefined ? [{ order: year * 12 + number, volume: volume ?? 0 }] : [];
      })
      .sort((left, right) => left.order - right.order)
      .slice(-12)
      .map((month) => month.volume);
    const features = asArray(serpInfo?.serp_item_types ?? rankedElement?.serp_item_types)
      .flatMap((type) => (asString(type) && asString(type) !== "organic" ? [asString(type) as string] : []));

    const optional = <T>(key: string, value: T | undefined) => (value === undefined ? {} : { [key]: value });
    positions.push({
      keyword,
      ...optional("position", asNumber(serpElement?.rank_absolute)),
      ...optional("url", asString(serpElement?.url)),
      ...optional("searchVolume", asNumber(keywordInfo?.search_volume)),
      ...optional("cpc", asNumber(keywordInfo?.cpc)),
      ...optional("difficulty", asNumber(properties?.keyword_difficulty) ?? asNumber(rankedElement?.keyword_difficulty)),
      ...(trend.length > 0 ? { trend } : {}),
      ...optional("traffic", asNumber(serpElement?.etv)),
      ...optional("trafficValue", asNumber(serpElement?.estimated_paid_traffic_cost)),
      ...(features.length > 0 ? { serpFeatures: features } : {}),
      ...optional("pageRank", asNumber(pageRank?.page_rank)),
      ...optional("pageReferringDomains", asNumber(pageLinks?.referring_domains)),
      ...optional("pageBacklinks", asNumber(pageLinks?.backlinks)),
      ...optional("competition", asNumber(keywordInfo?.competition)),
      ...optional("competitionLevel", asString(keywordInfo?.competition_level)),
      ...optional("searchIntent", asString(asRecord(keywordData?.search_intent_info)?.main_intent)),
      ...optional("resultsCount", asNumber(serpInfo?.se_results_count)),
      ...optional("previousPositionDfs", asNumber(rankChanges?.previous_rank_absolute)),
      ...optional("movementDfs", movementOf(rankChanges)),
    } as RankedPosition);
  }

  const allMetrics = asRecord(item.metrics);
  const metrics = asRecord(allMetrics?.organic);
  const paid = asRecord(allMetrics?.paid);
  const count = (key: string) => asNumber(metrics?.[key]) ?? 0;
  const inFeature = (feature: string) => asNumber(asRecord(allMetrics?.[feature])?.count) ?? null;

  return {
    metrics: {
      // Organic only: `total_count` also counts the adverts the answer carries
      // (`paidPositions`), and a total an advertiser's adverts swelled would
      // never let a pull be complete, nor the Overview's figure be right.
      rankedKeywords: asNumber(metrics?.count) ?? asNumber(item.total_count) ?? positions.length,
      returnedKeywords: positions.length,
      estimatedTraffic: asNumber(metrics?.etv) ?? 0,
      top3: asNumber(metrics?.pos_1) ?? 0,
      // DataForSEO's own counts across everything the site ranks for — not
      // only the keywords a capped pull returned — for the Position bands and
      // New and lost screens.
      bandTop3: count("pos_1") + count("pos_2_3"),
      band4to10: count("pos_4_10"),
      band11to20: count("pos_11_20"),
      band21to50: count("pos_21_30") + count("pos_31_40") + count("pos_41_50"),
      band51up: count("pos_51_60") + count("pos_61_70") + count("pos_71_80") + count("pos_81_90") + count("pos_91_100"),
      trafficValue: asNumber(metrics?.estimated_paid_traffic_cost) ?? 0,
      keywordsNew: count("is_new"),
      keywordsUp: count("is_up"),
      keywordsDown: count("is_down"),
      keywordsLost: count("is_lost"),
      // Paid search, from the same answer (Phase 5): how many searches the
      // site buys adverts on, the visits and what they would cost. Nought for
      // a site that does not advertise, which is most.
      paidKeywords: asNumber(paid?.count) ?? null,
      paidTraffic: asNumber(paid?.etv) ?? null,
      paidTrafficCost: asNumber(paid?.estimated_paid_traffic_cost) ?? null,
      // Across everything the site ranks for: how many searches show it in a
      // featured snippet, a map pack, or an AI Overview's references.
      featuredSnippets: inFeature("featured_snippet"),
      localPacks: inFeature("local_pack"),
      aiOverviewRefs: inFeature("ai_overview_reference"),
    },
    positions,
    paidPositions,
    ...(featurePositions.length > 0 ? { featurePositions } : {}),
  };
}

/** Where a site ranked for one search, and nothing about who else was there. */
export function parseSerpGoogleOrganic(result: unknown, target?: string): ParsedSeoResult {
  const item = firstItem(result);
  if (!item) return { metrics: {} };

  const keyword = asString(item.keyword);
  const rows = asArray(item.items);

  let position: number | undefined;
  let url: string | undefined;

  if (target) {
    for (const row of rows) {
      const record = asRecord(row);
      const domain = asString(record?.domain);
      if (!domain || !domain.endsWith(target)) continue;
      position = asNumber(record?.rank_absolute);
      url = asString(record?.url);
      break;
    }
  }

  return {
    metrics: {
      // Absent is not the same fact as "position 100", so it is stored as
      // absent. A chart that drew a missing week at the bottom of the page
      // would be inventing a ranking nobody ever had.
      position: position ?? null,
      resultCount: asNumber(item.se_results_count) ?? 0,
    },
    ...(keyword
      ? {
        positions: [{
          keyword,
          ...(position !== undefined ? { position } : {}),
          ...(url ? { url } : {}),
        }],
      }
      : {}),
  };
}

/** How often these terms are searched, and what advertisers pay. */
export function parseKeywordSearchVolume(result: unknown): ParsedSeoResult {
  const rows = asArray(result);
  const positions: NonNullable<ParsedSeoResult["positions"]> = [];

  for (const row of rows) {
    const record = asRecord(row);
    const keyword = asString(record?.keyword);
    if (!keyword) continue;
    positions.push({
      keyword,
      ...(asNumber(record?.search_volume) !== undefined
        ? { searchVolume: asNumber(record?.search_volume) }
        : {}),
    });
  }

  const volumes = positions
    .map((entry) => entry.searchVolume ?? 0)
    .filter((volume) => volume > 0);

  return {
    metrics: {
      keywords: positions.length,
      totalSearchVolume: volumes.reduce((sum, volume) => sum + volume, 0),
    },
    positions,
  };
}

/**
 * One bulk response, which is about many websites rather than one.
 *
 * Every other parser answers about the host that was asked for. This one
 * returns a row per target, because a single paid call covered all of them,
 * and the caller has to file each against its own website.
 *
 * Matched on the target string DataForSEO echoes back, normalised the same way
 * a host is stored, so a bulk row and a `websites` record are the same string.
 */
export function parseBulkByTarget(
  operationId: string,
  result: unknown,
): Array<{ target: string; metrics: Record<string, number | string | null> }> {
  const item = firstItem(result);
  const rows = asArray(item?.items ?? result);
  const parsed: Array<{ target: string; metrics: Record<string, number | string | null> }> = [];

  for (const row of rows) {
    const record = asRecord(row);
    const target = asString(record?.target);
    if (!record || !target) continue;

    if (operationId === "bulk_backlinks") {
      parsed.push({ target, metrics: { backlinks: asNumber(record.backlinks) ?? 0 } });
      continue;
    }
    if (operationId === "bulk_referring_domains") {
      parsed.push({
        target,
        metrics: { referringDomains: asNumber(record.referring_domains) ?? 0 },
      });
      continue;
    }
    if (operationId === "bulk_ranks") {
      parsed.push({ target, metrics: { rank: asNumber(record.rank) ?? 0 } });
      continue;
    }
  }

  return parsed;
}

/** Whether an operation answers about many websites rather than one. */
export function isBulkOperation(operationId: string): boolean {
  return operationId.startsWith("bulk_");
}

/**
 * An AI engine's answer, read for the three things we use from it.
 *
 * The text is run through the brand matcher, and — since D9, 2026-09-23 — kept
 * word for word (`aiAnswerTexts`, `siteAnswers.ts`) for the Sites Full answers
 * page. It used to be dropped here, so that nothing another model wrote could
 * reach an agent's prompt; the owner reversed that on purpose ("we need to show
 * the answers — we need to make strategies from this"). The condition it
 * protected still holds: an agent that reads the text gets it as quoted
 * material to analyse, never as instructions. The sources are the URLs the
 * engine cited.
 *
 * The third is the fan-out: the related searches the engine derived from the
 * question before answering it. Those are searches, not prose, and they are
 * the questions the engine actually went looking for answers to — which is the
 * surface a site has to be visible on, rather than the one question we asked.
 *
 * Shape, from DataForSEO's docs on 2026-09-22:
 * `result[0].items[]` of type "message", each with `sections[]` holding `text`
 * and, when web search was on, `annotations[]` holding `url` and `title` —
 * and, from one engine, `direct_url`, the real page behind a Google redirect;
 * `result[0].fan_out_queries[]` holding plain strings.
 */
export function parseLlmResponse(result: unknown): {
  answer: string;
  sources: Array<{ url: string; title?: string }>;
  fanOutQueries: string[];
} {
  const item = firstItem(result);
  const messages = asArray(item?.items);
  const parts: string[] = [];
  const sources: Array<{ url: string; title?: string }> = [];
  const seen = new Set<string>();

  for (const message of messages) {
    const record = asRecord(message);
    if (!record) continue;
    // Reasoning items carry the model's working, not its answer.
    if (asString(record.type) === "reasoning") continue;

    for (const section of asArray(record.sections)) {
      const part = asRecord(section);
      if (!part) continue;
      const text = asString(part.text);
      if (text) parts.push(text);

      for (const annotation of asArray(part.annotations)) {
        const note = asRecord(annotation);
        // One engine's `url` is a Google grounding redirect
        // (vertexaisearch.cloud.google.com/grounding-api-redirect/…) that names
        // no website; the real page is in `direct_url`. Reading `url` alone
        // filed every one of its sources under Google on the first live run,
        // 2026-09-23. Prefer the real address wherever it is given.
        const url = asString(note?.direct_url) ?? asString(note?.url);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        sources.push({ url, ...(asString(note?.title) ? { title: asString(note?.title) } : {}) });
      }
    }
  }

  // Not every engine runs a fan-out, and one that does not simply omits the
  // field. An absent fan-out is nothing to record, never an error.
  const fanOutQueries: string[] = [];
  const seenQuery = new Set<string>();
  for (const entry of asArray(item?.fan_out_queries)) {
    const query = asString(entry);
    if (!query) continue;
    const key = query.trim().toLowerCase();
    if (!key || seenQuery.has(key)) continue;
    seenQuery.add(key);
    fanOutQueries.push(query.trim());
  }

  return { answer: parts.join("\n"), sources, fanOutQueries };
}

/**
 * Websites competing for the same searches.
 *
 * `intersections` is the number of searches both sites rank for, which is the
 * one figure that says how much of a rival this really is. The target itself
 * comes back in its own list and is dropped by the caller, which knows what it
 * asked about.
 */
export function parseDomainCompetitors(result: unknown): Array<{
  host: string;
  intersections: number;
  averagePosition: number | null;
  estimatedTraffic: number | null;
  /** The whole domain's figures, for the Market map: every keyword it ranks for, and its traffic. */
  domainKeywords: number | null;
  domainTraffic: number | null;
}> {
  const item = firstItem(result);
  const rows = asArray(item?.items);
  const found: Array<{
    host: string; intersections: number; averagePosition: number | null; estimatedTraffic: number | null;
    domainKeywords: number | null; domainTraffic: number | null;
  }> = [];

  for (const row of rows) {
    const record = asRecord(row);
    const host = asString(record?.domain);
    if (!record || !host) continue;
    const metrics = asRecord(asRecord(record.metrics)?.organic);
    const whole = asRecord(asRecord(record.full_domain_metrics)?.organic);
    found.push({
      host,
      intersections: asNumber(record.intersections) ?? 0,
      averagePosition: asNumber(record.avg_position) ?? null,
      estimatedTraffic: asNumber(metrics?.etv) ?? null,
      domainKeywords: asNumber(whole?.count) ?? null,
      domainTraffic: asNumber(whole?.etv) ?? null,
    });
  }

  return found;
}

/** The parser for an operation id, or null when nothing knows how to read it. */
/**
 * Every site on one Google results page, at its best position.
 *
 * The page is the purchase — one search, one place — and every site on it is
 * measured by the same call, so nothing about it is tied to whoever asked.
 * Only organic results are read: an advert or a map pack is not a position a
 * site earned. A domain appearing twice keeps its better place, because "where
 * does it rank" has one answer.
 *
 * Domains only, never titles or snippets. The rest of the page — its
 * features, the domains an AI Overview or map pack names, and Google's "People
 * also ask" questions and related searches — is read into `page` for the Sites
 * screens (docs/plans/active/user-sites-plan.md, Phase 2). Which domain is
 * which website is the caller's job, through the host rules that decide what
 * counts as one site.
 */
export function parseSerpPage(result: unknown): {
  resultCount: number;
  rows: Array<{ domain: string; position: number; url?: string }>;
  /** What else the page carries, for the Sites screens (Phase 2). */
  page: SerpPageExtras;
} {
  const item = firstItem(result);
  if (!item) return { resultCount: 0, rows: [], page: emptyExtras() };

  const page = emptyExtras();
  const best = new Map<string, { domain: string; position: number; url?: string }>();
  for (const row of asArray(item.items)) {
    const record = asRecord(row);
    const type = asString(record?.type);
    if (record && type && type !== "organic") collectExtras(page, type, record);
    if (!record || type !== "organic") continue;
    const domain = asString(record.domain)?.toLowerCase();
    const position = asNumber(record.rank_absolute);
    if (!domain || position === undefined) continue;

    const held = best.get(domain);
    if (held && held.position <= position) continue;
    const url = asString(record.url);
    best.set(domain, { domain, position, ...(url ? { url } : {}) });
  }

  return {
    resultCount: asNumber(item.se_results_count) ?? 0,
    rows: [...best.values()].sort((left, right) => left.position - right.position),
    page,
  };
}

/**
 * The rest of a results page: which features it shows, which domains an AI
 * Overview, a map pack or a featured snippet name, and the "People also ask"
 * questions and related searches. Questions and searches are Google's own
 * short prompts, kept for the Questions people ask screen; domains only for
 * everything else, as for the organic results.
 */
export type SerpPageExtras = {
  features: string[];
  aiOverviewDomains: string[];
  localPackDomains: string[];
  featuredSnippetDomain: string | null;
  questions: string[];
  related: string[];
};

function emptyExtras(): SerpPageExtras {
  return { features: [], aiOverviewDomains: [], localPackDomains: [], featuredSnippetDomain: null, questions: [], related: [] };
}

/** Every `domain` inside a feature, however deep its references sit. Bounded. */
function domainsIn(value: unknown, found: Set<string>, depth = 0): void {
  if (depth > 5 || found.size >= 30) return;
  if (Array.isArray(value)) {
    for (const entry of value) domainsIn(entry, found, depth + 1);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  const domain = asString(record.domain)?.toLowerCase();
  if (domain) found.add(domain);
  for (const [key, child] of Object.entries(record)) {
    if (key === "domain" || typeof child !== "object" || child === null) continue;
    domainsIn(child, found, depth + 1);
  }
}

function collectExtras(page: SerpPageExtras, type: string, record: Unknown): void {
  if (!page.features.includes(type)) page.features.push(type);
  if (type === "ai_overview") {
    const found = new Set(page.aiOverviewDomains);
    domainsIn(record, found);
    page.aiOverviewDomains = [...found];
  } else if (type === "local_pack") {
    const domain = asString(record.domain)?.toLowerCase();
    if (domain && !page.localPackDomains.includes(domain)) page.localPackDomains.push(domain);
  } else if (type === "featured_snippet") {
    page.featuredSnippetDomain ??= asString(record.domain)?.toLowerCase() ?? null;
  } else if (type === "people_also_ask") {
    for (const entry of asArray(record.items)) {
      const question = asString(asRecord(entry)?.title)?.trim();
      if (question && page.questions.length < 20 && !page.questions.includes(question)) page.questions.push(question);
    }
  } else if (type === "related_searches") {
    for (const entry of asArray(record.items)) {
      const search = (asString(entry) ?? asString(asRecord(entry)?.title))?.trim();
      if (search && page.related.length < 20 && !page.related.includes(search)) page.related.push(search);
    }
  }
}

export function parseSeoResultFor(
  operationId: string,
  result: unknown,
  target?: string,
): ParsedSeoResult | null {
  if (operationId === "backlinks_summary") return parseBacklinksSummary(result);
  if (operationId === "domain_competitors") {
    // Read for the competitor rows, not for a metrics row; the caller files
    // them. The summary here is what a chart would plot.
    const found = parseDomainCompetitors(result);
    return {
      metrics: {
        competitorsFound: found.length,
        closestOverlap: found[0]?.intersections ?? 0,
      },
    };
  }
  if (operationId === "domain_ranked_keywords") return parseDomainRankedKeywords(result);
  if (operationId === "serp_google_organic") return parseSerpGoogleOrganic(result, target);
  if (operationId === "keyword_search_volume") return parseKeywordSearchVolume(result);
  return null;
}
