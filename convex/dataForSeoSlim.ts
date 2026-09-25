import { MAX_ANSWER_BYTES, utf8Length } from "./seoPullAnswers";

/**
 * Trimming a DataForSEO answer to the fields we read, before it is stored.
 *
 * A pull keeps its raw answer so a parser bug can be fixed and re-run rather
 * than re-bought — in parts, up to a ceiling (`MAX_ANSWER_BYTES` in
 * `seoPullAnswers.ts`), past which nothing is kept and nothing is filed. A
 * thousand-row link list with every field DataForSEO sends carries, per link,
 * the text around it, the linking page's title and forty other fields — and
 * the page text that would be dropped anyway should never land at all.
 *
 * So a list keeps only the fields its parser reads, and keeps them as a
 * table: the field names once, then one row of values per item. Measured on
 * 2026-09-23, a thousand links kept as objects came to about half a million
 * characters; as a table they take about half that, one part. And if a list
 * is still too big for the ceiling, the rows at its end are left off until it
 * fits — the lists come strongest first, so what is lost is the weakest — and
 * counted (`rowsLeftOffIn`), so the request says so.
 *
 * Only the calls added for the Sites link pages are trimmed
 * (`dataForSeoLinkOperations.ts`); everything else is stored as it came —
 * except a Google results page too big to keep whole (`fitSerpResult`).
 * `expandSeoResult` lays a table back out as the items the parsers read.
 * Every size here is in bytes, as a document's ceiling is counted.
 */

/** What a list may take of the stored answer, leaving room for the rest of it. */
export const STORED_LIST_BYTES = MAX_ANSWER_BYTES - 400_000;

/**
 * A results page past this is cut to what the parsers read. Not the list
 * ceiling: what is cut is only the words around each result, which nothing
 * reads, and a check is bought thousands of times a day.
 */
export const SERP_KEPT_WHOLE_BYTES = 480_000;

const LINK_FIELDS = [
  "domain_from", "url_from", "url_to", "anchor", "dofollow", "is_new", "is_lost", "is_broken",
  "first_seen", "last_seen", "page_from_rank", "domain_from_rank", "item_type",
  "url_to_status_code", "domain_from_country",
  // Everything else about the link that is not the linking page's words
  // (2026-09-24, "store whatever we can").
  "attributes", "semantic_location", "domain_from_platform_type", "backlink_spam_score", "rank",
  "links_count", "is_indirect_link", "page_from_language", "prev_seen",
];

/** Dates DataForSEO sends with a time and zone; the parsers read the day. */
const DAY_FIELDS = new Set(["first_seen", "last_seen", "lost_date", "prev_seen"]);

const LIST_FIELDS: Record<string, readonly string[]> = {
  backlinks_list: LINK_FIELDS,
  backlinks_all: LINK_FIELDS,
  backlinks_broken: LINK_FIELDS,
  referring_domains_list: [
    "domain", "rank", "backlinks", "first_seen", "lost_date", "backlinks_spam_score",
    "broken_backlinks", "referring_pages", "referring_pages_nofollow",
  ],
  anchors_list: [
    "anchor", "rank", "backlinks", "first_seen", "lost_date", "backlinks_spam_score",
    "broken_backlinks", "referring_domains", "referring_main_domains", "referring_pages_nofollow",
  ],
  referring_ips_list: [
    "network_address", "rank", "backlinks", "first_seen", "lost_date", "backlinks_spam_score",
    "referring_domains", "referring_main_domains", "referring_pages",
  ],
};

/** The ranking history's figures per month: DataForSEO's own, without the clickstream extras we do not buy. */
const HISTORY_METRICS = [
  "pos_1", "pos_2_3", "pos_4_10", "pos_11_20", "pos_21_30", "pos_31_40", "pos_41_50", "pos_51_60",
  "pos_61_70", "pos_71_80", "pos_81_90", "pos_91_100", "etv", "count", "estimated_paid_traffic_cost",
  "is_new", "is_up", "is_down", "is_lost",
];

type Unknown = Record<string, unknown>;

function asRecord(value: unknown): Unknown | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Unknown : null;
}

function pick(record: Unknown, fields: readonly string[]): Unknown {
  const kept: Unknown = {};
  for (const field of fields) if (record[field] !== undefined) kept[field] = record[field];
  return kept;
}

/** A result's top level: every plain value, and nothing nested. */
function topLevel(record: Unknown): Unknown {
  const top: Unknown = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== "items" && (value === null || typeof value !== "object")) top[key] = value;
  }
  return top;
}

/** A result's top level, and its items trimmed by `trimItem`. */
function trimResult(result: unknown, trimItem: (item: Unknown) => Unknown): unknown {
  if (!Array.isArray(result)) return result;
  return result.map((entry) => {
    const record = asRecord(entry);
    if (!record) return entry;
    const items = Array.isArray(record.items) ? record.items : [];
    return { ...topLevel(record), items: items.map((item) => (asRecord(item) ? trimItem(asRecord(item)!) : item)) };
  });
}

/** One kept value: absent as null, so a row's places line up; a dated field as its day. */
function keptValue(field: string, value: unknown): unknown {
  if (value === undefined) return null;
  if (DAY_FIELDS.has(field) && typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return value;
}

/** How many of a list's rows, from the top, fit in `room` bytes. */
function rowsThatFit(rows: readonly unknown[][], room: number): number {
  let left = room;
  let fit = 0;
  for (const row of rows) {
    left -= utf8Length(JSON.stringify(row)) + 1;
    if (left < 0) break;
    fit += 1;
  }
  return fit;
}

/**
 * A list's items as a table — `packedItems: { fields, rows, dropped }` — with
 * the rows past the budget left off and counted.
 */
function packResult(result: unknown, fields: readonly string[]): unknown {
  if (!Array.isArray(result)) return result;
  const budget = Math.floor(STORED_LIST_BYTES / Math.max(result.length, 1));
  return result.map((entry) => {
    const record = asRecord(entry);
    if (!record) return entry;
    const top = topLevel(record);
    const items = Array.isArray(record.items) ? record.items : [];
    const rows = items.flatMap((item) => {
      const kept = asRecord(item);
      return kept ? [fields.map((field) => keptValue(field, kept[field]))] : [];
    });
    const fit = rowsThatFit(rows, budget - utf8Length(JSON.stringify(top)) - utf8Length(JSON.stringify(fields)) - 100);
    return { ...top, packedItems: { fields: [...fields], rows: rows.slice(0, fit), dropped: rows.length - fit } };
  });
}

/**
 * A stored answer as the parsers read it: a packed table laid back out as
 * items, a field left out where its value was null. Anything else — an answer
 * stored before lists were packed, or not a list — comes back as it was.
 */
export function expandSeoResult(result: unknown): unknown {
  if (!Array.isArray(result)) return result;
  return result.map((entry) => {
    const record = asRecord(entry);
    const ranked = asRecord(record?.packedRanked);
    if (record && ranked && Array.isArray(ranked.fields) && Array.isArray(ranked.rows)) {
      const fields = ranked.fields.filter((field): field is string => typeof field === "string");
      const expanded: Unknown = {};
      for (const [key, value] of Object.entries(record)) if (key !== "packedRanked") expanded[key] = value;
      expanded.items = ranked.rows.map((row) => (Array.isArray(row) ? expandRankedRow(fields, row) : {}));
      return expanded;
    }
    const packed = asRecord(record?.packedItems);
    if (!record || !packed || !Array.isArray(packed.fields) || !Array.isArray(packed.rows)) return entry;
    const fields = packed.fields.filter((field): field is string => typeof field === "string");
    const expanded: Unknown = {};
    for (const [key, value] of Object.entries(record)) if (key !== "packedItems") expanded[key] = value;
    expanded.items = packed.rows.map((row) => {
      const item: Unknown = {};
      if (Array.isArray(row)) {
        fields.forEach((field, index) => {
          if (row[index] !== null && row[index] !== undefined) item[field] = row[index];
        });
      }
      return item;
    });
    return expanded;
  });
}

/**
 * The full keyword list's rows, flattened to what is read: a thousand rows of
 * DataForSEO's nested items — each carrying the ranking page's title and
 * description, which are page text — are several times the raw copy's size.
 * Every fact the parser reads is kept; the page's words are not.
 */
const RANKED_FIELDS = [
  "keyword", "type", "rank_absolute", "url", "etv", "estimated_paid_traffic_cost",
  "search_volume", "cpc", "competition", "competition_level", "keyword_difficulty",
  "trend_from", "trend", "serp_item_types", "main_intent", "se_results_count",
  "previous_rank_absolute", "is_new", "is_up", "is_down", "page_rank", "referring_domains", "backlinks",
] as const;

/** One ranked-keywords item as a row of `RANKED_FIELDS`. */
function rankedRow(item: Unknown): unknown[] {
  const data = asRecord(item.keyword_data);
  const info = asRecord(data?.keyword_info);
  const element = asRecord(item.ranked_serp_element);
  const serp = asRecord(element?.serp_item);
  const changes = asRecord(serp?.rank_changes);
  // The monthly searches as volumes, oldest first, from the month they start.
  const months = (Array.isArray(info?.monthly_searches) ? info.monthly_searches : [])
    .map(asRecord)
    .flatMap((month) => (month && typeof month.year === "number" && typeof month.month === "number"
      ? [{ order: month.year * 12 + (month.month - 1), volume: typeof month.search_volume === "number" ? month.search_volume : 0 }]
      : []))
    .sort((left, right) => left.order - right.order);
  const from = months[0]?.order;
  const values: Record<(typeof RANKED_FIELDS)[number], unknown> = {
    keyword: data?.keyword,
    type: serp?.type,
    rank_absolute: serp?.rank_absolute,
    url: serp?.url,
    etv: serp?.etv,
    estimated_paid_traffic_cost: serp?.estimated_paid_traffic_cost,
    search_volume: info?.search_volume,
    cpc: info?.cpc,
    competition: info?.competition,
    competition_level: info?.competition_level,
    keyword_difficulty: asRecord(data?.keyword_properties)?.keyword_difficulty ?? element?.keyword_difficulty,
    trend_from: from === undefined ? null : `${Math.floor(from / 12)}-${String((from % 12) + 1).padStart(2, "0")}`,
    trend: months.length > 0 ? months.map((month) => month.volume) : null,
    serp_item_types: asRecord(data?.serp_info)?.serp_item_types ?? element?.serp_item_types,
    main_intent: asRecord(data?.search_intent_info)?.main_intent,
    se_results_count: asRecord(data?.serp_info)?.se_results_count,
    previous_rank_absolute: changes?.previous_rank_absolute,
    is_new: changes?.is_new,
    is_up: changes?.is_up,
    is_down: changes?.is_down,
    page_rank: asRecord(serp?.rank_info)?.page_rank,
    referring_domains: asRecord(serp?.backlinks_info)?.referring_domains,
    backlinks: asRecord(serp?.backlinks_info)?.backlinks,
  };
  return RANKED_FIELDS.map((field) => (values[field] === undefined ? null : values[field]));
}

/** A ranked-keywords answer with its items as `packedRanked` rows, its metrics kept whole. */
function packRankedResult(result: unknown): unknown {
  if (!Array.isArray(result)) return result;
  const budget = Math.floor(STORED_LIST_BYTES / Math.max(result.length, 1));
  return result.map((entry) => {
    const record = asRecord(entry);
    if (!record) return entry;
    const top = { ...topLevel(record), ...(asRecord(record.metrics) ? { metrics: record.metrics } : {}) };
    const items = Array.isArray(record.items) ? record.items : [];
    const rows = items.flatMap((item) => (asRecord(item) ? [rankedRow(asRecord(item)!)] : []));
    const fit = rowsThatFit(rows, budget - utf8Length(JSON.stringify(top)) - utf8Length(JSON.stringify(RANKED_FIELDS)) - 100);
    return { ...top, packedRanked: { fields: [...RANKED_FIELDS], rows: rows.slice(0, fit), dropped: rows.length - fit } };
  });
}

/** One packed ranked-keywords row laid back out as the item DataForSEO sent, as far as it was kept. */
function expandRankedRow(fields: string[], row: unknown[]): Unknown {
  const value = (field: string) => {
    const at = fields.indexOf(field);
    return at < 0 || row[at] === null ? undefined : row[at];
  };
  const trend = value("trend");
  const from = value("trend_from");
  const [year, month] = typeof from === "string" ? from.split("-").map(Number) : [NaN, NaN];
  const monthly = Array.isArray(trend) && Number.isFinite(year) && Number.isFinite(month)
    ? trend.map((volume, index) => {
      const order = year * 12 + (month - 1) + index;
      return { year: Math.floor(order / 12), month: (order % 12) + 1, search_volume: volume };
    })
    : undefined;
  const compact = (record: Unknown) => Object.fromEntries(Object.entries(record).filter(([, entry]) => entry !== undefined));
  return {
    keyword_data: compact({
      keyword: value("keyword"),
      keyword_info: compact({
        search_volume: value("search_volume"),
        cpc: value("cpc"),
        competition: value("competition"),
        competition_level: value("competition_level"),
        ...(monthly ? { monthly_searches: monthly } : {}),
      }),
      keyword_properties: compact({ keyword_difficulty: value("keyword_difficulty") }),
      serp_info: compact({ serp_item_types: value("serp_item_types"), se_results_count: value("se_results_count") }),
      search_intent_info: compact({ main_intent: value("main_intent") }),
    }),
    ranked_serp_element: {
      serp_item: compact({
        type: value("type"),
        rank_absolute: value("rank_absolute"),
        url: value("url"),
        etv: value("etv"),
        estimated_paid_traffic_cost: value("estimated_paid_traffic_cost"),
        rank_changes: compact({
          previous_rank_absolute: value("previous_rank_absolute"),
          is_new: value("is_new"),
          is_up: value("is_up"),
          is_down: value("is_down"),
        }),
        rank_info: compact({ page_rank: value("page_rank") }),
        backlinks_info: compact({ referring_domains: value("referring_domains"), backlinks: value("backlinks") }),
      }),
    },
  };
}

/** An organic result's facts: where, whose, which page — not its title or snippet. */
const SERP_ORGANIC_FIELDS = [
  "type", "rank_group", "rank_absolute", "position", "domain", "url", "website_name",
  "is_featured_snippet", "is_image", "is_video", "is_malicious", "is_web_story", "amp_version",
];

/** Every `domain` and its `url` inside a feature, however deep its references sit. Bounded. */
function sourcesIn(value: unknown, found: Unknown[], depth = 0): void {
  if (depth > 5 || found.length >= 60) return;
  if (Array.isArray(value)) {
    for (const entry of value) sourcesIn(entry, found, depth + 1);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  if (typeof record.domain === "string") found.push(pick(record, ["domain", "url"]));
  for (const child of Object.values(record)) {
    if (typeof child === "object" && child !== null) sourcesIn(child, found, depth + 1);
  }
}

/** One results-page item as `parseSerpPage` reads it. */
function serpItem(item: Unknown): Unknown {
  const type = item.type;
  if (type === "organic") return pick(item, SERP_ORGANIC_FIELDS);
  const kept = pick(item, ["type", "rank_group", "rank_absolute", "domain", "url"]);
  // Google's own short prompts, kept for the Questions people ask screen.
  if (type === "people_also_ask" || type === "related_searches") {
    const items = Array.isArray(item.items) ? item.items : [];
    return {
      ...kept,
      items: items.map((entry) => (typeof entry === "string" ? entry : pick(asRecord(entry) ?? {}, ["type", "title"]))),
    };
  }
  // Everything else — an AI Overview, a map pack, a featured snippet — by
  // the websites it names.
  const sources: Unknown[] = [];
  for (const [key, child] of Object.entries(item)) {
    if (key !== "domain" && typeof child === "object" && child !== null) sourcesIn(child, sources);
  }
  return sources.length > 0 ? { ...kept, references: sources } : kept;
}

/**
 * A Google results page, whole when it is under `SERP_KEPT_WHOLE_BYTES`, and
 * otherwise cut to what the parsers read. A check reads a hundred results
 * (2026-09-24), and a hundred with their titles, snippets and sitelinks —
 * beside an AI Overview and "People also ask" answers — run to half a
 * megabyte, for a check bought thousands of times a day; cut, it files the same.
 */
function fitSerpResult(result: unknown): unknown {
  if (!Array.isArray(result) || utf8Length(JSON.stringify(result)) <= SERP_KEPT_WHOLE_BYTES) return result;
  return result.map((entry) => {
    const record = asRecord(entry);
    if (!record) return entry;
    const items = Array.isArray(record.items) ? record.items : [];
    return {
      ...topLevel(record),
      ...(Array.isArray(record.item_types) ? { item_types: record.item_types } : {}),
      items: items.map((item) => (asRecord(item) ? serpItem(asRecord(item)!) : item)),
      trimmed: true,
    };
  });
}

/**
 * Rows left off the end of a stored list to keep it inside the ceiling, over
 * every result in the answer: nothing, for an answer that is not a list or
 * kept every row.
 */
export function rowsLeftOffIn(stored: unknown): number {
  if (!Array.isArray(stored)) return 0;
  let left = 0;
  for (const entry of stored) {
    const record = asRecord(entry);
    for (const packed of [asRecord(record?.packedItems), asRecord(record?.packedRanked)]) {
      if (typeof packed?.dropped === "number") left += packed.dropped;
    }
  }
  return left;
}

/** The answer as it should be stored for this operation. */
export function slimSeoResult(operationId: string, result: unknown): unknown {
  if (operationId === "serp_google_organic") return fitSerpResult(result);
  if (operationId === "domain_ranked_keywords_list") return packRankedResult(result);
  const fields = LIST_FIELDS[operationId];
  if (fields) return packResult(result, fields);
  if (operationId === "ranking_history") {
    return trimResult(result, (item) => {
      const metrics = asRecord(item.metrics);
      const organic = asRecord(metrics?.organic);
      const paid = asRecord(metrics?.paid);
      return {
        ...pick(item, ["year", "month"]),
        metrics: {
          ...(organic ? { organic: pick(organic, HISTORY_METRICS) } : {}),
          ...(paid ? { paid: pick(paid, HISTORY_METRICS) } : {}),
        },
      };
    });
  }
  return result;
}
