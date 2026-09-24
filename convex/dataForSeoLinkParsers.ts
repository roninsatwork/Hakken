/**
 * Reading the Sites link calls (`dataForSeoLinkOperations.ts`) into rows.
 *
 * Pure functions, like `dataForSeoParsers.ts`, so each can be tested against
 * a saved answer and re-run over stored ones. The same rules hold: a payload
 * that is not what the docs describe reads as nothing rather than throwing,
 * and no page text is read — addresses, counts, dates and flags only. The one
 * exception is a link's **anchor**: the words a linking page uses, kept for the
 * Anchors and All backlinks pages because that is the whole point of them, and
 * shown to people only — never handed to a model.
 *
 * Field names from DataForSEO's docs, read on 2026-09-23.
 */

type Unknown = Record<string, unknown>;

function asRecord(value: unknown): Unknown | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Unknown : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** The first result's items, and its total. */
function firstResult(result: unknown): { items: Unknown[]; total: number | undefined } {
  const first = asRecord(asArray(result)[0]);
  return {
    items: asArray(first?.items).flatMap((item) => (asRecord(item) ? [asRecord(item)!] : [])),
    total: asNumber(first?.total_count),
  };
}

/** `2019-11-15 12:57:46 +00:00` as `2019-11-15`; anything else as undefined. */
export function dayOf(value: unknown): string | undefined {
  const text = asString(value);
  return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : undefined;
}

/** The path of an address, which is what a person recognises on their own site. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

/** Whether a row is still there, newly found, or gone. */
export type LinkStatus = "LIVE" | "NEW" | "LOST";

export type BacklinkRow = {
  domainFrom: string;
  urlFrom: string;
  urlTo: string;
  pageTo: string;
  anchor?: string;
  dofollow: boolean;
  status: LinkStatus;
  isBroken: boolean;
  itemType?: string;
  domainRank: number;
  pageRank?: number;
  firstSeen?: string;
  lastSeen?: string;
  statusCode?: number;
  country?: string;
};

/** Anchors kept at most this long: a link's words, not a paragraph. */
const ANCHOR_CHARS = 300;

export function parseBacklinkList(result: unknown): { total: number | undefined; rows: BacklinkRow[] } {
  const { items, total } = firstResult(result);
  const rows = items.flatMap((item): BacklinkRow[] => {
    const domainFrom = asString(item.domain_from)?.toLowerCase();
    const urlFrom = asString(item.url_from);
    const urlTo = asString(item.url_to);
    if (!domainFrom || !urlFrom || !urlTo) return [];
    const anchor = asString(item.anchor)?.trim().slice(0, ANCHOR_CHARS);
    const optional = <T>(key: string, value: T | undefined) => (value === undefined ? {} : { [key]: value });
    return [{
      domainFrom,
      urlFrom,
      urlTo,
      pageTo: pathOf(urlTo),
      ...(anchor ? { anchor } : {}),
      dofollow: item.dofollow === true,
      status: item.is_lost === true ? "LOST" : item.is_new === true ? "NEW" : "LIVE",
      isBroken: item.is_broken === true,
      ...optional("itemType", asString(item.item_type)),
      domainRank: asNumber(item.domain_from_rank) ?? 0,
      ...optional("pageRank", asNumber(item.page_from_rank)),
      ...optional("firstSeen", dayOf(item.first_seen)),
      ...optional("lastSeen", dayOf(item.last_seen)),
      ...optional("statusCode", asNumber(item.url_to_status_code)),
      ...optional("country", asString(item.domain_from_country)),
    } as BacklinkRow];
  });
  return { total, rows };
}

/** The figures a referring domain, an anchor and a server share. */
type LinkGroupFigures = {
  rank: number;
  backlinks: number;
  firstSeen?: string;
  lostDate?: string;
  status: LinkStatus;
  spamScore?: number;
};

function groupFigures(item: Unknown): LinkGroupFigures {
  const lostDate = dayOf(item.lost_date);
  const optional = <T>(key: string, value: T | undefined) => (value === undefined ? {} : { [key]: value });
  return {
    rank: asNumber(item.rank) ?? 0,
    backlinks: asNumber(item.backlinks) ?? 0,
    ...optional("firstSeen", dayOf(item.first_seen)),
    ...optional("lostDate", lostDate),
    status: lostDate ? "LOST" : "LIVE",
    ...optional("spamScore", asNumber(item.backlinks_spam_score)),
  } as LinkGroupFigures;
}

export type ReferringDomainRow = LinkGroupFigures & {
  domain: string;
  brokenBacklinks?: number;
  referringPages?: number;
  nofollowPages?: number;
};

export function parseReferringDomains(result: unknown): { total: number | undefined; rows: ReferringDomainRow[] } {
  const { items, total } = firstResult(result);
  const rows = items.flatMap((item): ReferringDomainRow[] => {
    const domain = asString(item.domain)?.toLowerCase();
    if (!domain) return [];
    const optional = <T>(key: string, value: T | undefined) => (value === undefined ? {} : { [key]: value });
    return [{
      domain,
      ...groupFigures(item),
      ...optional("brokenBacklinks", asNumber(item.broken_backlinks)),
      ...optional("referringPages", asNumber(item.referring_pages)),
      ...optional("nofollowPages", asNumber(item.referring_pages_nofollow)),
    } as ReferringDomainRow];
  });
  return { total, rows };
}

export type AnchorRow = LinkGroupFigures & {
  anchor: string;
  referringDomains: number;
};

export function parseAnchors(result: unknown): { total: number | undefined; rows: AnchorRow[] } {
  const { items, total } = firstResult(result);
  const rows = items.flatMap((item): AnchorRow[] => {
    // An image link has no words; it is still an anchor worth counting.
    const anchor = (asString(item.anchor) ?? "").trim().slice(0, ANCHOR_CHARS);
    return [{ anchor, ...groupFigures(item), referringDomains: asNumber(item.referring_domains) ?? 0 }];
  });
  return { total, rows };
}

export type ReferringIpRow = LinkGroupFigures & {
  ip: string;
  /** The network the address sits in — its first three parts for an IPv4 address. */
  subnet: string;
  referringDomains: number;
};

/** An IPv4 address's /24 network, `1.2.3.0/24`; any other address stands for itself. */
export function subnetOf(ip: string): string {
  const parts = ip.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part)) ? `${parts.slice(0, 3).join(".")}.0/24` : ip;
}

export function parseReferringIps(result: unknown): { total: number | undefined; rows: ReferringIpRow[] } {
  const { items, total } = firstResult(result);
  const rows = items.flatMap((item): ReferringIpRow[] => {
    const ip = asString(item.network_address);
    if (!ip) return [];
    return [{ ip, subnet: subnetOf(ip), ...groupFigures(item), referringDomains: asNumber(item.referring_domains) ?? 0 }];
  });
  return { total, rows };
}

export type LinkDayRow = {
  day: string;
  newBacklinks: number;
  lostBacklinks: number;
  newReferringDomains: number;
  lostReferringDomains: number;
  newMainDomains: number;
  lostMainDomains: number;
};

export function parseNewLostSeries(result: unknown): LinkDayRow[] {
  return firstResult(result).items.flatMap((item): LinkDayRow[] => {
    const day = dayOf(item.date);
    if (!day) return [];
    const count = (key: string) => asNumber(item[key]) ?? 0;
    return [{
      day,
      newBacklinks: count("new_backlinks"),
      lostBacklinks: count("lost_backlinks"),
      newReferringDomains: count("new_referring_domains"),
      lostReferringDomains: count("lost_referring_domains"),
      newMainDomains: count("new_referring_main_domains"),
      lostMainDomains: count("lost_referring_main_domains"),
    }];
  });
}

export type LinkHistoryRow = {
  day: string;
  domainRank?: number;
  backlinks?: number;
  referringDomains?: number;
  referringMainDomains?: number;
};

export function parseLinkHistory(result: unknown): LinkHistoryRow[] {
  return firstResult(result).items.flatMap((item): LinkHistoryRow[] => {
    const day = dayOf(item.date);
    if (!day) return [];
    const optional = <T>(key: string, value: T | undefined) => (value === undefined ? {} : { [key]: value });
    return [{
      day,
      ...optional("domainRank", asNumber(item.rank)),
      ...optional("backlinks", asNumber(item.backlinks)),
      ...optional("referringDomains", asNumber(item.referring_domains)),
      ...optional("referringMainDomains", asNumber(item.referring_main_domains)),
    } as LinkHistoryRow];
  });
}

export type RankingHistoryRow = {
  /** The first of the month the figures describe. */
  day: string;
  keywords?: number;
  traffic?: number;
  trafficValue?: number;
  bands?: { p01_03: number; p04_10: number; p11_20: number; p21_50: number; p51_up: number };
  keywordsNew?: number;
  keywordsUp?: number;
  keywordsDown?: number;
  keywordsLost?: number;
  paidKeywords?: number;
  paidTraffic?: number;
  paidTrafficCost?: number;
};

export function parseRankingHistory(result: unknown): RankingHistoryRow[] {
  return firstResult(result).items.flatMap((item): RankingHistoryRow[] => {
    const year = asNumber(item.year);
    const month = asNumber(item.month);
    if (year === undefined || month === undefined || month < 1 || month > 12) return [];
    const metrics = asRecord(item.metrics);
    const organic = asRecord(metrics?.organic);
    const paid = asRecord(metrics?.paid);
    const count = (key: string) => asNumber(organic?.[key]) ?? 0;
    const optional = <T>(key: string, value: T | undefined) => (value === undefined ? {} : { [key]: value });
    const round = (value: number | undefined) => (value === undefined ? undefined : Math.round(value));
    return [{
      day: `${year}-${String(month).padStart(2, "0")}-01`,
      ...(organic ? {
        ...optional("keywords", asNumber(organic.count)),
        ...optional("traffic", round(asNumber(organic.etv))),
        ...optional("trafficValue", round(asNumber(organic.estimated_paid_traffic_cost))),
        bands: {
          p01_03: count("pos_1") + count("pos_2_3"),
          p04_10: count("pos_4_10"),
          p11_20: count("pos_11_20"),
          p21_50: count("pos_21_30") + count("pos_31_40") + count("pos_41_50"),
          p51_up: count("pos_51_60") + count("pos_61_70") + count("pos_71_80") + count("pos_81_90") + count("pos_91_100"),
        },
        ...optional("keywordsNew", asNumber(organic.is_new)),
        ...optional("keywordsUp", asNumber(organic.is_up)),
        ...optional("keywordsDown", asNumber(organic.is_down)),
        ...optional("keywordsLost", asNumber(organic.is_lost)),
      } : {}),
      ...(paid ? {
        ...optional("paidKeywords", asNumber(paid.count)),
        ...optional("paidTraffic", round(asNumber(paid.etv))),
        ...optional("paidTrafficCost", round(asNumber(paid.estimated_paid_traffic_cost))),
      } : {}),
    } as RankingHistoryRow];
  });
}
