import type { Fact } from "./insightFacts";

/**
 * A company's own websites competing for one search (docs/plans/active/
 * insights-analyst-plan.md I4): the searches where the website being read and
 * another of the company's own both rank in Google's top 20, so Google splits
 * one search between them and neither ranks as well as one page could.
 */

/** A search a website ranks for: its place, its page, and how often it is searched a month (null when unknown). */
export type RankedRow = { keyword: string; position: number; page: string; volume: number | null };

export type SharedSearch = {
  keyword: string;
  volume: number | null;
  position: number;
  page: string;
  otherHost: string;
  otherPosition: number;
  otherPage: string;
};

/** Only places this high count: lower, neither page is competing for the click. */
export const SHARED_TOP = 20;

/**
 * Each search this website and another of the company's own both rank for in
 * Google's top 20, against the best-placed of the others, the most searched
 * first, then the closest fought.
 */
export function sharedSearches(own: readonly RankedRow[], others: ReadonlyArray<{ host: string; rows: readonly RankedRow[] }>): SharedSearch[] {
  const best = new Map<string, { host: string; row: RankedRow }>();
  for (const other of others) {
    for (const row of other.rows) {
      if (row.position > SHARED_TOP) continue;
      const held = best.get(row.keyword);
      if (!held || row.position < held.row.position) best.set(row.keyword, { host: other.host, row });
    }
  }
  const shared: SharedSearch[] = [];
  const seen = new Set<string>();
  for (const row of own) {
    if (row.position > SHARED_TOP || seen.has(row.keyword)) continue;
    const other = best.get(row.keyword);
    if (!other) continue;
    seen.add(row.keyword);
    shared.push({
      keyword: row.keyword, volume: row.volume ?? other.row.volume, position: row.position, page: row.page,
      otherHost: other.host, otherPosition: other.row.position, otherPage: other.row.page,
    });
  }
  return shared.sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || Math.abs(a.position - a.otherPosition) - Math.abs(b.position - b.otherPosition));
}

/**
 * The shared searches as facts: how many, and the most searched one's
 * volume and both places, its search and websites named in the labels for
 * the specialist to write from.
 */
export function sharedSearchFacts(host: string, shared: readonly SharedSearch[], day: string): Fact[] {
  if (shared.length === 0) return [];
  const base = { source: "market" as const, from: day, to: day };
  const top = shared[0];
  const facts: Fact[] = [
    { ...base, key: "own.shared.count", value: shared.length, unit: "count", label: `searches where ${host} and another of the company's own websites both rank in Google's top ${SHARED_TOP}` },
    { ...base, key: "own.shared.top.position", value: top.position, unit: "position", label: `${host}'s place on Google for "${top.keyword}" (${top.page || "/"}), the most searched of them` },
    { ...base, key: "own.shared.top.otherPosition", value: top.otherPosition, unit: "position", label: `${top.otherHost}'s place on Google for "${top.keyword}" (${top.otherPage || "/"})` },
  ];
  if (top.volume !== null) facts.push({ ...base, key: "own.shared.top.volume", value: top.volume, unit: "count", label: `searches a month for "${top.keyword}"` });
  return facts;
}
