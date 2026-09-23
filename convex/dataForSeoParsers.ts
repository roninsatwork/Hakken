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
 */

export type ParsedSeoResult = {
  /** The small, permanent numbers, stored as JSON on the metrics row. */
  metrics: Record<string, number | string | null>;
  /** One row per keyword, when the operation was about keywords. */
  positions?: Array<{
    keyword: string;
    position?: number;
    url?: string;
    searchVolume?: number;
  }>;
};

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
    },
  };
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

  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;

    const keywordData = asRecord(record.keyword_data);
    const keyword = asString(keywordData?.keyword);
    if (!keyword) continue;

    const serpElement = asRecord(asRecord(record.ranked_serp_element)?.serp_item);
    const keywordInfo = asRecord(keywordData?.keyword_info);

    positions.push({
      keyword,
      ...(asNumber(serpElement?.rank_absolute) !== undefined
        ? { position: asNumber(serpElement?.rank_absolute) }
        : {}),
      ...(asString(serpElement?.url) ? { url: asString(serpElement?.url) } : {}),
      ...(asNumber(keywordInfo?.search_volume) !== undefined
        ? { searchVolume: asNumber(keywordInfo?.search_volume) }
        : {}),
    });
  }

  const metrics = asRecord(asRecord(item.metrics)?.organic);

  return {
    metrics: {
      rankedKeywords: asNumber(item.total_count) ?? positions.length,
      returnedKeywords: positions.length,
      estimatedTraffic: asNumber(metrics?.etv) ?? 0,
      top3: asNumber(metrics?.pos_1) ?? 0,
    },
    positions,
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
 * An AI engine's answer, reduced to the three things we read from it.
 *
 * The text is kept only long enough to run the brand matcher over it, and the
 * sources are the URLs the engine cited. Neither the text nor any passage of
 * it is stored: an answer is prose from a model that read the open web, and the
 * way to keep it out of any agent's prompt is not to keep it.
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
}> {
  const item = firstItem(result);
  const rows = asArray(item?.items);
  const found: Array<{ host: string; intersections: number; averagePosition: number | null; estimatedTraffic: number | null }> = [];

  for (const row of rows) {
    const record = asRecord(row);
    const host = asString(record?.domain);
    if (!record || !host) continue;
    const metrics = asRecord(asRecord(record.metrics)?.organic);
    found.push({
      host,
      intersections: asNumber(record.intersections) ?? 0,
      averagePosition: asNumber(record.avg_position) ?? null,
      estimatedTraffic: asNumber(metrics?.etv) ?? null,
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
 * Domains only, never titles or snippets — the same rule as the rest of this
 * file. Which domain is which website is the caller's job, through the host
 * rules that decide what counts as one site.
 */
export function parseSerpPage(result: unknown): {
  resultCount: number;
  rows: Array<{ domain: string; position: number; url?: string }>;
} {
  const item = firstItem(result);
  if (!item) return { resultCount: 0, rows: [] };

  const best = new Map<string, { domain: string; position: number; url?: string }>();
  for (const row of asArray(item.items)) {
    const record = asRecord(row);
    if (!record || asString(record.type) !== "organic") continue;
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
  };
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
