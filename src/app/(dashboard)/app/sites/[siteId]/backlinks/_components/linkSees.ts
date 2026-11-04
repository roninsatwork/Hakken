/**
 * What each Backlinks screen hands the eye (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10): the figures it
 * shows, cut to the ones its rules read (`convex/utils/sees/own/visibility.ts`, Backlinks and Keywords' block), and the
 * rivals beside them where a rule sets yours against theirs. Built here, in one place, so the screen and the every-period
 * test (`convex/utils/sees/visibilityLinksKeywordsPeriods.test.ts`) hand the rules the same figures. Names are the
 * reader's own words, from the screen's translations; no money. Link counts are `backlinks`, never `links`, which the
 * eye drops as plumbing (`pageData.ts`).
 */

type Figures = Record<string, unknown>;
type Line = { host: string; isYou: boolean; points: readonly Figures[]; before: Figures | null };

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Each website's figures at the end of the dates, and where it stood before them, from the chart's lines
 * (`siteCharts.siteSeries` with rivals): as the Summary's boxes read them (newest in the dates, else the newest before),
 * and the newest check before the dates as "before" only where a check in the dates moved it on.
 */
export function websitesOf(lines: readonly Line[], fields: readonly string[]): Figures[] {
  return lines.map((line) => {
    const row: Figures = { name: line.host, you: line.isYou };
    const before: Figures = {};
    for (const field of fields) {
      const inDates = [...line.points].reverse().find((point) => isNumber(point[field]));
      const earlier = line.before && isNumber(line.before[field]) ? (line.before[field] as number) : undefined;
      const first = line.points.find((point) => isNumber(point[field]));
      const now = inDates ? (inDates[field] as number) : earlier;
      if (now !== undefined) row[field] = now;
      // Before: the newest check before the dates, else the first in them where the dates hold two or more.
      const from = inDates ? (earlier ?? (first !== inDates ? (first?.[field] as number | undefined) : undefined)) : undefined;
      if (from !== undefined) before[field] = from;
    }
    if (isNumber(row.backlinks) && isNumber(row.referringDomains) && row.referringDomains > 0) row.linksPerWebsite = Math.round((row.backlinks / row.referringDomains) * 10) / 10;
    return Object.keys(before).length > 0 ? { ...row, before } : row;
  });
}

/** Your line's points in the dates, with only the figures the chart draws: the chart's every day, handed by date. */
function chartOf(lines: readonly Line[], fields: readonly string[]): Figures[] {
  const you = lines.find((line) => line.isYou);
  return (you?.points ?? []).filter((point) => fields.some((field) => isNumber(point[field]))).map((point) => ({
    day: point.day,
    ...Object.fromEntries(fields.flatMap((field) => (isNumber(point[field]) ? [[field, point[field]]] : []))),
  }));
}

const SUMMARY_FIELDS = ["referringDomains", "backlinks", "domainRank", "brokenBacklinks"] as const;

/** Backlinks › Summary: its four boxes and chart, yours and each rival's on the chart's dates. */
export function summarySees(lines: readonly Line[] | undefined, names: { rivals: string }) {
  if (!lines) return undefined;
  return { websites: websitesOf(lines, SUMMARY_FIELDS), chart: chartOf(lines, ["referringDomains", "backlinks", "domainRank"]), names };
}

/** Backlinks › Compared with rivals: each website's links as it stood at its newest check. */
export function comparedSees(rows: ReadonlyArray<{ host: string; isYou: boolean; day: string | null; domainRank: number | null; backlinks: number | null; referringDomains: number | null }> | undefined, names: { rivals: string }) {
  if (!rows) return undefined;
  return {
    websites: rows.map((row) => ({
      name: row.host, you: row.isYou, day: row.day,
      ...(row.domainRank !== null ? { domainRank: row.domainRank } : {}),
      ...(row.backlinks !== null ? { backlinks: row.backlinks } : {}),
      ...(row.referringDomains !== null ? { referringDomains: row.referringDomains } : {}),
      ...(row.backlinks !== null && row.referringDomains ? { linksPerWebsite: Math.round((row.backlinks / row.referringDomains) * 10) / 10 } : {}),
    })),
    names,
  };
}

type Profile = {
  day: string; backlinks: number | null; referringDomains: number | null; spamScore: number | null; brokenBacklinks: number | null;
  brokenPages: number | null; nofollowReferringDomains: number | null; domainRank: number | null;
  countries: ReadonlyArray<{ key: string; count: number }>; tlds: ReadonlyArray<{ key: string; count: number }>;
  platforms: ReadonlyArray<{ key: string; count: number }>; linkTypes: ReadonlyArray<{ key: string; count: number }>;
  attributes: ReadonlyArray<{ key: string; count: number }>;
};
type ProfileOf = { host: string; isYou: boolean; profile: Profile };

const QUALITY_FIELDS = ["spamScore", "brokenBacklinks", "brokenPages"] as const;

/**
 * Backlinks › Link quality: its four boxes as the newest summary has them, each website's beside them, and the chart's
 * figures on the dates chosen with where each stood before them. The share of linking websites asking Google not to
 * follow their links is each website's own, from its newest summary.
 */
export function qualitySees(profile: Profile | null | undefined, lines: readonly Line[] | undefined, profiles: readonly ProfileOf[] | undefined, names: { rivals: string }) {
  if (profile === undefined || !lines) return undefined;
  const nofollow = new Map((profiles ?? []).map((one) => [one.host, one.profile.referringDomains ? Math.round((1000 * (one.profile.nofollowReferringDomains ?? 0)) / one.profile.referringDomains) / 10 : null]));
  return {
    boxes: profile ? { spamScore: profile.spamScore, brokenBacklinks: profile.brokenBacklinks, brokenPages: profile.brokenPages, nofollowReferringDomains: profile.nofollowReferringDomains, day: profile.day } : null,
    websites: websitesOf(lines, QUALITY_FIELDS).map((row) => {
      const share = nofollow.get(String(row.name));
      return share !== undefined && share !== null ? { ...row, nofollowWebsitesPercent: share } : row;
    }),
    chart: chartOf(lines, QUALITY_FIELDS),
    names,
  };
}

/** Where links come from's breakdowns, as its picker names them. */
const BREAKDOWNS = ["countries", "tlds", "platforms", "linkTypes", "attributes"] as const;
/** Breakdowns whose groups overlap: their shares are of every link, as the screen counts them. */
const OVERLAPPING = new Set(["platforms", "attributes"]);
/** Keys that place a link nowhere: left out of a breakdown's shares, as no group anyone can act on. */
const NOWHERE = new Set(["(none)", "", "(rest)", "unknown"]);
/** A website whose placed links are under this share of all its links says too little of where they come from. */
const PLACED_LEAST = 0.3;
/** Groups of yours handed, each breakdown: the screen's chart draws twelve. */
const GROUPS_HANDED = 12;

/**
 * Backlinks › Where links come from: every breakdown the picker offers, not only the one on screen, each group's share
 * of your links beside a typical rival's share of theirs. Links placed nowhere ("unknown") are left out of each share,
 * as the supplier places many of a rival's links nowhere at all; a website with under a third of its links placed is
 * left out of the rivals' figure.
 */
export function whereSees(profiles: readonly ProfileOf[] | undefined, nameOf: (breakdown: (typeof BREAKDOWNS)[number], key: string) => string, breakdownName: (breakdown: (typeof BREAKDOWNS)[number]) => string, names: { rivals: string }) {
  if (!profiles) return undefined;
  const you = profiles.find((one) => one.isYou);
  if (!you) return { breakdowns: [], names };
  const sharesOf = (one: ProfileOf, breakdown: (typeof BREAKDOWNS)[number]) => {
    const groups = one.profile[breakdown];
    const placed = groups.filter((group) => !NOWHERE.has(group.key));
    const whole = OVERLAPPING.has(breakdown) ? one.profile.backlinks ?? 0 : placed.reduce((sum, group) => sum + group.count, 0);
    const all = OVERLAPPING.has(breakdown) ? whole : groups.reduce((sum, group) => sum + group.count, 0);
    if (whole <= 0 || (!OVERLAPPING.has(breakdown) && all > 0 && whole / all < PLACED_LEAST)) return null;
    return new Map(placed.map((group) => [group.key, (100 * group.count) / whole]));
  };
  const middle = (values: number[]) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const at = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[at] : (sorted[at - 1] + sorted[at]) / 2;
  };
  return {
    day: you.profile.day,
    breakdowns: BREAKDOWNS.map((breakdown) => {
      const mine = sharesOf(you, breakdown);
      const theirs = profiles.filter((one) => !one.isYou).map((one) => sharesOf(one, breakdown)).filter((one): one is Map<string, number> => one !== null);
      const groups = you.profile[breakdown].filter((group) => !NOWHERE.has(group.key)).slice(0, GROUPS_HANDED);
      return {
        name: breakdownName(breakdown),
        rivals: theirs.length,
        groups: groups.map((group) => {
          const typical = middle(theirs.map((shares) => shares.get(group.key) ?? 0));
          return {
            name: nameOf(breakdown, group.key),
            backlinks: group.count,
            ...(mine ? { linksSharePercent: Math.round((mine.get(group.key) ?? 0) * 10) / 10 } : {}),
            ...(typical !== null && mine ? { rivalsSharePercent: Math.round(typical * 10) / 10 } : {}),
          };
        }),
      };
    }),
    names,
  };
}

type AnchorFigures = {
  day: string | null; anchors: number; links: number; top: { anchor: string; links: number; websites: number } | null;
  brand: { links: number; websites: number; anchors: number }; noWords: { links: number; websites: number; anchors: number };
  spammy: { links: number; websites: number; anchors: number }; fresh: { links: number; websites: number; anchors: number };
};

/** A share of links worked out on the server, renamed so the eye keeps it: `links` is plumbing to it. */
const linksOf = (part: { links: number; websites: number; anchors: number }) => ({ backlinks: part.links, referringDomains: part.websites, anchors: part.anchors });

/**
 * Backlinks › Anchors: the page of anchors on screen, and the whole list summed on the server (`anchorFigures`): the
 * most-used words and their share of every link, those naming the business, those with no words, those reading as spam.
 */
export function anchorsSees(
  page: { rows: ReadonlyArray<{ anchor: string; backlinks: number; referringDomains: number; firstSeen: string | null }>; total: number; page: number; pages: number } | undefined,
  figures: AnchorFigures | undefined,
  names: { noAnchor: string; noWords: string; brand: string; spammy: string; fresh: string },
) {
  if (!page || !figures) return undefined;
  return {
    anchors: { rows: page.rows.map((row) => ({ name: row.anchor || names.noAnchor, backlinks: row.backlinks, referringDomains: row.referringDomains, firstSeen: row.firstSeen })), total: page.total, page: page.page, pages: page.pages },
    whole: {
      day: figures.day, anchors: figures.anchors, backlinks: figures.links,
      ...(figures.top ? { top: { name: figures.top.anchor || names.noAnchor, backlinks: figures.top.links, referringDomains: figures.top.websites } } : {}),
      brand: linksOf(figures.brand), noWords: linksOf(figures.noWords), spammy: linksOf(figures.spammy), fresh: linksOf(figures.fresh),
    },
    names,
  };
}

type ServerFigures = {
  servers: number; networks: number; links: number; websites: number; oneWebsiteServers: number;
  topServer: { ip: string; subnet: string; links: number; websites: number } | null;
  topNetwork: { subnet: string; servers: number; links: number; websites: number } | null;
};

/**
 * Backlinks › Referring IPs: the networks the chart draws, the page of servers on screen, and every server summed on the
 * server (`serverFigures`): the one carrying most links, and the network holding most linking websites, set against
 * every linking website the newest summary counts.
 */
export function ipsSees(
  profile: { referringDomains: number | null; referringSubnets: number | null; referringIps: number | null } | null | undefined,
  subnets: ReadonlyArray<{ subnet: string; ips: number; backlinks: number; referringDomains: number }> | undefined,
  servers: { rows: ReadonlyArray<{ ip: string; subnet: string; backlinks: number; referringDomains: number }>; total: number; page: number; pages: number } | undefined,
  figures: ServerFigures | undefined,
  names: { oneWebsite: string; busiestThree: string },
) {
  if (profile === undefined || !subnets || !figures) return undefined;
  return {
    networks: subnets.map((row) => ({ name: row.subnet, referringDomains: row.referringDomains, backlinks: row.backlinks, linkServers: row.ips })),
    ...(servers ? { servers: { rows: servers.rows.map((row) => ({ name: row.ip, network: row.subnet, referringDomains: row.referringDomains, backlinks: row.backlinks })), total: servers.total, page: servers.page, pages: servers.pages } } : {}),
    whole: {
      referringDomains: profile?.referringDomains ?? null, networks: profile?.referringSubnets ?? figures.networks, linkServers: profile?.referringIps ?? figures.servers,
      serversHeld: figures.servers, backlinks: figures.links, oneWebsiteServers: figures.oneWebsiteServers,
      ...(figures.topServer ? { topServer: { name: figures.topServer.ip, network: figures.topServer.subnet, backlinks: figures.topServer.links, referringDomains: figures.topServer.websites } } : {}),
      ...(figures.topNetwork ? { topNetwork: { name: figures.topNetwork.subnet, linkServers: figures.topNetwork.servers, backlinks: figures.topNetwork.links, referringDomains: figures.topNetwork.websites } } : {}),
    },
    names,
  };
}

type Change = { day: string; newBacklinks: number; lostBacklinks: number; newReferringDomains: number; lostReferringDomains: number };
const totalOf = (steps: readonly Change[]) => ({
  linksGained: steps.reduce((sum, step) => sum + step.newBacklinks, 0),
  linksLost: steps.reduce((sum, step) => sum + step.lostBacklinks, 0),
  websitesGained: steps.reduce((sum, step) => sum + step.newReferringDomains, 0),
  websitesLost: steps.reduce((sum, step) => sum + step.lostReferringDomains, 0),
});

/** A day moved by whole days. */
const dayAfter = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
/** The last day a step holds: its day, its week's Sunday, or its month's last day. */
function stepLastDay(day: string, step: "day" | "week" | "month"): string {
  if (step === "day") return day;
  if (step === "week") return dayAfter(day, 6);
  const next = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return dayAfter(next.toISOString().slice(0, 10), -1);
}

/**
 * Backlinks › New and lost links: each day, week or month in the dates, as the chart and table draw them, added up, and
 * the same span before added up beside them. The supplier's count is filed at each check, so it runs only to the newest
 * check: where it stops inside the dates (Last month on 3 November held 1–5 October), the span before is cut to as many
 * days from its start, so 5 days are never set against 30. Each step named as the table names it (`stepName`).
 */
export function linkChangesSees(
  points: readonly Change[] | undefined,
  before: readonly Change[] | undefined,
  range: { from: string; to: string; step: "day" | "week" | "month"; before: { from: string; to: string } },
  stepName: (day: string) => string,
  names: { otherSteps: string },
) {
  if (!points) return undefined;
  const newest = points.at(-1)?.day;
  const heldTo = newest ? (stepLastDay(newest, range.step) < range.to ? stepLastDay(newest, range.step) : range.to) : null;
  // The span before, to as many days from its start as the dates hold.
  const cutBefore = heldTo !== null && heldTo < range.to ? dayAfter(range.before.from, daysBetween(range.from, heldTo)) : range.before.to;
  const fair = (before ?? []).filter((point) => point.day <= cutBefore);
  return {
    steps: points.map((point) => ({ day: point.day, name: stepName(point.day), linksGained: point.newBacklinks, linksLost: point.lostBacklinks, websitesGained: point.newReferringDomains, websitesLost: point.lostReferringDomains })),
    totals: totalOf(points),
    ...(heldTo !== null && heldTo < range.to ? { heldTo } : {}),
    ...(fair.length > 0 ? { before: totalOf(fair), beforeTo: cutBefore } : {}),
    names,
  };
}
