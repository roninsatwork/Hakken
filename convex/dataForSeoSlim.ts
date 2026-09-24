/**
 * Trimming a DataForSEO answer to the fields we read, before it is stored.
 *
 * A pull keeps its raw answer so a parser bug can be fixed and re-run rather
 * than re-bought — but only up to a ceiling (`MAX_RAW_CHARS` in
 * `seoCollectionActions.ts`), past which the answer is dropped and nothing is
 * filed. A thousand-row link list with every field DataForSEO sends is well
 * past it: each link carries the text around it, the linking page's title and
 * forty other fields — and the page text that would be dropped anyway should
 * never land at all.
 *
 * So a list keeps only the fields its parser reads, and keeps them as a
 * table: the field names once, then one row of values per item. Measured on
 * 2026-09-23, a thousand links kept as objects came to about half a million
 * characters, right at the ceiling — past it for a site linked from long
 * addresses, which would then be paid for every week and never filed. As a
 * table they take about half that. And if a list is still too big, the rows
 * at its end are left off until it fits: the lists come strongest first, so a
 * pull always files, and what is lost is the weakest links.
 *
 * Only the calls added for the Sites link pages are trimmed
 * (`dataForSeoLinkOperations.ts`); everything else is stored as it came.
 * `expandSeoResult` lays a table back out as the items the parsers read.
 */

/** What a list may take of the raw copy's 512,000 characters, leaving room for the rest of the answer. */
export const STORED_LIST_CHARS = 480_000;

const LINK_FIELDS = [
  "domain_from", "url_from", "url_to", "anchor", "dofollow", "is_new", "is_lost", "is_broken",
  "first_seen", "last_seen", "page_from_rank", "domain_from_rank", "item_type",
  "url_to_status_code", "domain_from_country",
];

/** Dates DataForSEO sends with a time and zone; the parsers read the day. */
const DAY_FIELDS = new Set(["first_seen", "last_seen", "lost_date"]);

const LIST_FIELDS: Record<string, readonly string[]> = {
  backlinks_list: LINK_FIELDS,
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

/**
 * A list's items as a table — `packedItems: { fields, rows, dropped }` — with
 * the rows past the budget left off and counted.
 */
function packResult(result: unknown, fields: readonly string[]): unknown {
  if (!Array.isArray(result)) return result;
  const budget = Math.floor(STORED_LIST_CHARS / Math.max(result.length, 1));
  return result.map((entry) => {
    const record = asRecord(entry);
    if (!record) return entry;
    const top = topLevel(record);
    const items = Array.isArray(record.items) ? record.items : [];
    const rows = items.flatMap((item) => {
      const kept = asRecord(item);
      return kept ? [fields.map((field) => keptValue(field, kept[field]))] : [];
    });
    let room = budget - JSON.stringify(top).length - JSON.stringify(fields).length - 100;
    let fit = 0;
    for (const row of rows) {
      room -= JSON.stringify(row).length + 1;
      if (room < 0) break;
      fit += 1;
    }
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

/** The answer as it should be stored for this operation. */
export function slimSeoResult(operationId: string, result: unknown): unknown {
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
