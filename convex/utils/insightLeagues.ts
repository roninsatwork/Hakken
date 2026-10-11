import type { Fact } from "./insightFacts";

/**
 * The leaderboards (docs/plans/active/insights-analyst-plan.md §5, I8): the
 * website and its rivals ranked on each measure Hakken reads, led by the four
 * in Anthony's reference — domain authority, organic traffic, AI mindshare
 * and share of voice — then five more. Worked out from the same facts the
 * team reads (`insightsReading.marketFacts`), so a league and a finding never
 * disagree, and from history Hakken already keeps: nothing stored.
 */

export const LEAGUE_IDS = ["strength", "traffic", "mindshare", "shareOfVoice", "links", "aiOverviews", "recommended", "cited", "reviews"] as const;
export type LeagueId = (typeof LEAGUE_IDS)[number];

/** The four main leagues, first everywhere. */
export const MAIN_LEAGUES: readonly LeagueId[] = ["strength", "traffic", "mindshare", "shareOfVoice"];

export type LeagueRow = {
  name: string;
  /** The website itself (or its own Business Profile). */
  you: boolean;
  value: number;
  /** A year before, where Hakken holds it. */
  before: number | null;
  place: number;
  placeBefore: number | null;
  /** Its share of the league's total, for the leagues that are a market's share (mindshare, share of voice). */
  share: number | null;
};

export type League = {
  id: LeagueId;
  main: boolean;
  rows: LeagueRow[];
  /** Your place, and a year before; null when the league has nothing for you. */
  place: number | null;
  placeBefore: number | null;
  /** Your gap to the place above: what it takes to climb one. */
  gapAbove: number | null;
};

/** Each league's figure for a host, from the facts. */
const FACT_OF: Record<Exclude<LeagueId, "recommended" | "reviews">, (host: string, which: "now" | "year") => string> = {
  strength: (host, which) => `seo.${host}.strength.${which}`,
  traffic: (host, which) => `seo.${host}.traffic.${which}`,
  mindshare: (host, which) => `ai.${host}.mentions.${which}`,
  shareOfVoice: (host, which) => `seo.${host}.top3.${which}`,
  links: (host, which) => `seo.${host}.linkingSites.${which}`,
  aiOverviews: (host, which) => `seo.${host}.aiOverviews.${which}`,
  cited: (host, which) => (which === "now" ? `ai.cited.${host}` : `ai.cited.${host}.year`),
};

/** A short name for a website: its host without "www." and its ending. */
export function shortName(host: string): string {
  return host.replace(/^www\./, "").replace(/\.(co\.uk|com|io|ai|net|org|uk)$/i, "");
}

function ranked(rows: Array<Omit<LeagueRow, "place" | "placeBefore" | "share">>, shared: boolean): LeagueRow[] {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const byNow = [...rows].sort((a, b) => b.value - a.value || Number(b.you) - Number(a.you));
  const withBefore = rows.filter((row) => row.before !== null);
  const byBefore = [...withBefore].sort((a, b) => (b.before ?? 0) - (a.before ?? 0));
  return byNow.map((row, index) => ({
    ...row,
    place: index + 1,
    // A place a year before only when every website in the league has a figure then: a part would rank wrongly.
    placeBefore: withBefore.length === rows.length && row.before !== null ? byBefore.indexOf(row) + 1 : null,
    share: shared && total > 0 ? Math.round((row.value / total) * 1000) / 10 : null,
  }));
}

function leagueOf(id: LeagueId, rows: LeagueRow[]): League {
  const mine = rows.find((row) => row.you) ?? null;
  const above = mine && mine.place > 1 ? rows[mine.place - 2] : null;
  return {
    id,
    main: MAIN_LEAGUES.includes(id),
    rows,
    place: mine?.place ?? null,
    placeBefore: mine?.placeBefore ?? null,
    gapAbove: mine && above ? above.value - mine.value : null,
  };
}

/** Every league, from a website's market facts; `own` is its host. A league with no figure for two or more websites is left out. */
export function leaguesFrom(facts: readonly Fact[], own: string): League[] {
  const byKey = new Map(facts.map((fact) => [fact.key, fact.value]));
  const hosts = [...new Set(facts.map((fact) => /^seo\.(.+)\.traffic\.now$/.exec(fact.key)?.[1]).filter((host): host is string => Boolean(host)))];
  if (!hosts.includes(own)) hosts.unshift(own);
  const leagues: League[] = [];
  for (const id of LEAGUE_IDS) {
    let rows: Array<Omit<LeagueRow, "place" | "placeBefore" | "share">> = [];
    if (id === "recommended") {
      // Answers naming each website, across every assistant Hakken asks.
      const engines = [...new Set(facts.map((fact) => /^ai\.answers\.([^.]+)\.asked$/.exec(fact.key)?.[1]).filter((engine): engine is string => Boolean(engine)))];
      if (engines.length > 0) {
        rows = hosts.map((host) => ({ name: host, you: host === own, value: engines.reduce((sum, engine) => sum + (byKey.get(`ai.answers.${engine}.${host}.named`) ?? 0), 0), before: null }));
      }
    } else if (id === "reviews") {
      // Each Business Profile, the business's own and its rivals'.
      for (const fact of facts) {
        const match = /^local\.(own|rival)\.(.+)\.reviews$/.exec(fact.key);
        if (match) rows.push({ name: match[2], you: match[1] === "own", value: fact.value, before: null });
      }
    } else {
      rows = hosts
        .filter((host) => byKey.has(FACT_OF[id](host, "now")))
        .map((host) => ({ name: host, you: host === own, value: byKey.get(FACT_OF[id](host, "now")) ?? 0, before: byKey.get(FACT_OF[id](host, "year")) ?? null }));
    }
    if (rows.length < 2) continue;
    leagues.push(leagueOf(id, ranked(rows, id === "mindshare" || id === "shareOfVoice")));
  }
  return leagues;
}

/** An ordinal in English: 1st, 2nd, 3rd, 4th. */
export function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${["th", "st", "nd", "rd"][place % 10] ?? "th"}`;
}
