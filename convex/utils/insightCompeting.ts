import { v, type Infer } from "convex/values";
import { OWN_RATE_VISITS, bandOf, type PositionBand } from "./heroes";

/**
 * Keyword cannibalisation (docs/plans/active/insights-intelligence-plan.md
 * phase 3; Anthony, 12 October 2026: "there may be many pages competing; it
 * may not be a pair"): the website's pages that Google shows for the same
 * searches, read from Search Console's Pages competing list, gathered into
 * groups linked by the searches they split — the home page and searches for
 * the website's own name left out — each with the page that should own its
 * searches, a decision for every other page, and what a higher place would
 * bring.
 */

/** A page takes at least this share of a search's showings among the pages shown for it to count as splitting it. */
export const SPLIT_SHARE = 0.1;
/** Two pages are in one group when they split at least this many searches between them. */
export const LINK_SEARCHES = 3;
/** A group bigger than this is split again on stronger links: a group is pages an agency would weigh together. */
export const MOST_PAGES = 6;
/** Searches a group keeps, the most shown first: the screen lists them and buys their volumes. */
export const MOST_SEARCHES = 200;
/** A group is kept when its pages split at least this many searches and were shown this often: less is noise. */
export const LEAST_SPLIT = 5;
export const LEAST_SHOWN = 250;
/** Groups kept a website, the most shown first. */
export const MOST_GROUPS = 20;

export type CompetingPair = { search: string; page: string; clicks: number; impressions: number };
export type SearchFigures = { position: number | null; volume: number | null };
export type PageFigures = {
  kind: string | null;
  type: string;
  /** Analytics' visits and enquiries over the last 12 whole months, and the newest three months against the same three a year before. */
  visits: number;
  enquiries: number;
  recent: number;
  recentBefore: number | null;
  /** Times Google showed the page for any search over the same span: how much of its own life these searches are. */
  shownAll?: number | null;
};

/**
 * A page is merged only when the group's searches are at least this share of
 * all its showings — Ronins' /brand-design-agency/, 39% of it the owner's
 * branding searches; otherwise it has a topic of its own.
 */
export const MERGE_SHARE = 1 / 3;

export type Decision = "OWNER" | "MERGE" | "DIFFERENTIATE" | "LINK";
export type Sure = "LIKELY" | "ROUGH";

export type GroupPage = PageFigures & { path: string; clicks: number; shown: number; searches: number; decision: Decision };
export type GroupSearch = {
  search: string;
  shown: number;
  clicks: number;
  split: boolean;
  position: number | null;
  volume: number | null;
  /** The page Google sends most of the search's clicks to, or shows most. */
  top: string;
  pages: Array<{ path: string; shown: number; clicks: number }>;
  /** Extra Google clicks a month at a top-three place, from how often it is searched when known, else from times shown. */
  gain: number | null;
};
export type CompetingGroup = {
  key: string;
  name: string;
  owner: string;
  pages: GroupPage[];
  searches: GroupSearch[];
  shared: number;
  split: number;
  shown: number;
  clicks: number;
  enquiries: number;
  recent: number;
  recentBefore: number | null;
  /** Extra Google clicks and enquiries a month if the owner held a top-three place for the split searches. */
  gainClicks: number | null;
  gainEnquiries: number | null;
  sure: Sure;
};

/** The home page brings enquiries for everything, so it is never counted in a group. */
export function isHome(path: string): boolean {
  return path === "/" || /^\/(index|home|default)(\.[a-z]+)?\/?$/i.test(path);
}

/** A page's address without its section, kept by its path. */
export function pathOfPage(address: string): string {
  const match = /^https?:\/\/[^/]+(\/[^#]*)?/i.exec(address.trim());
  return match ? match[1] || "/" : address.trim().split("#")[0];
}

/** The website's own name in a search: its address's first word ("acme" of acme.co.uk). */
export function brandWordsOf(host: string): string[] {
  const label = host.toLowerCase().replace(/^www\./, "").split(".")[0] ?? "";
  return label.length >= 3 ? [label, label.replace(/-/g, " ")].filter((word, at, all) => all.indexOf(word) === at) : [];
}

const isBrand = (search: string, brands: ReadonlySet<string>, words: readonly string[]) => {
  if (brands.has(search)) return true;
  const text = search.toLowerCase();
  return words.some((word) => text.includes(word));
};

const linkKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Pages joined when they share at least `least` split searches: every piece, a page alone among them. */
function joined(nodes: readonly string[], edges: ReadonlyMap<string, number>, least: number): string[][] {
  const parent = new Map(nodes.map((node) => [node, node]));
  const find = (node: string): string => {
    let root = node;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(node, root);
    return root;
  };
  const inside = new Set(nodes);
  for (const [pair, count] of edges) {
    if (count < least) continue;
    const [a, b] = pair.split("\u0000");
    if (inside.has(a) && inside.has(b)) parent.set(find(a), find(b));
  }
  const pieces = new Map<string, string[]>();
  for (const node of nodes) {
    const root = find(node);
    pieces.set(root, [...(pieces.get(root) ?? []), node]);
  }
  return [...pieces.values()];
}

/**
 * The groups: pages joined by `LINK_SEARCHES` split searches, a group bigger
 * than `MOST_PAGES` joined again on the least stronger link that makes every
 * piece fit, and a page that leaves alone rejoining the piece it splits the
 * most searches with while that piece has room — never dropped.
 */
function partsOf(nodes: readonly string[], edges: ReadonlyMap<string, number>, least: number): string[][] {
  const out: string[][] = [];
  for (const part of joined(nodes, edges, least)) {
    if (part.length < 2) continue;
    if (part.length <= MOST_PAGES) {
      out.push(part);
      continue;
    }
    let stronger = least + 1;
    let pieces = joined(part, edges, stronger);
    while (pieces.some((piece) => piece.length > MOST_PAGES) && stronger < 256) pieces = joined(part, edges, (stronger += 1));
    const groups = pieces.filter((piece) => piece.length >= 2);
    for (const [alone] of pieces.filter((piece) => piece.length === 1)) {
      let best: string[] | null = null;
      let most = 0;
      for (const group of groups) {
        if (group.length >= MOST_PAGES) continue;
        const shared = group.reduce((sum, node) => sum + (edges.get(linkKey(alone, node)) ?? 0), 0);
        if (shared > most) [best, most] = [group, shared];
      }
      if (best && most >= least) best.push(alone);
    }
    out.push(...groups);
  }
  return out;
}

/** A search's close-variant key: each word's first three letters, in order of the alphabet ("web designers" and "website designers" alike). */
export function variantOf(search: string): string {
  return search.toLowerCase().split(/\s+/).filter(Boolean).map((word) => word.slice(0, 3)).sort().join(" ");
}

/** The owner: the page bringing the most enquiries, then the most clicks, then the most shown. */
function ownerOf(pages: readonly GroupPage[]): GroupPage {
  return [...pages].sort((a, b) => b.enquiries - a.enquiries || b.clicks - a.clicks || b.shown - a.shown || a.path.localeCompare(b.path))[0];
}

/**
 * Every other page's decision: an article beside a page that sells is kept and
 * links to it; a page bringing no enquiries of its own and shown largely for
 * the owner's searches is merged into the owner with a redirect; any other — its
 * own enquiries, or a topic of its own the group only touches (an SEO page
 * sharing a few "AI SEO" searches) — is made clearly different.
 */
export function decisionFor(page: GroupPage, owner: GroupPage): Decision {
  if (page.path === owner.path) return "OWNER";
  if (page.type === "INFORMATIONAL" && owner.type !== "INFORMATIONAL") return "LINK";
  const mostlyHere = page.shownAll !== undefined && page.shownAll !== null && page.shownAll > 0 && page.shown >= page.shownAll * MERGE_SHARE;
  // A redirect carries the page's clicks and links to the owner, so its clicks never keep it.
  if (page.enquiries === 0 && mostlyHere) return "MERGE";
  return "DIFFERENTIATE";
}

/**
 * The groups of competing pages, biggest first, from Search Console's pairs
 * over a span (`months` of it, to put clicks a month), each page's figures,
 * each search's place and volume, and the website's click rate in each band
 * of places (`clickRates`, `heroes.ts`).
 */
export function competingGroups(input: {
  pairs: readonly CompetingPair[];
  brandSearches: ReadonlySet<string>;
  brandWords: readonly string[];
  searchOf: (search: string) => SearchFigures;
  pageOf: (path: string) => PageFigures;
  clickRates: Partial<Record<PositionBand, number | null>>;
  /** The website's visits that enquired over the same 12 months: a page's own rate is used from `OWN_RATE_VISITS` visits, as Page reviews price a fix. */
  websiteRate: number | null;
  months: number;
}): CompetingGroup[] {
  const bySearch = new Map<string, Map<string, { clicks: number; impressions: number }>>();
  for (const pair of input.pairs) {
    const path = pathOfPage(pair.page);
    if (!pair.search || isHome(path) || isBrand(pair.search, input.brandSearches, input.brandWords)) continue;
    const pages = bySearch.get(pair.search) ?? new Map<string, { clicks: number; impressions: number }>();
    const held = pages.get(path) ?? { clicks: 0, impressions: 0 };
    held.clicks += pair.clicks;
    held.impressions += pair.impressions;
    pages.set(path, held);
    bySearch.set(pair.search, pages);
  }

  // Each search's splitting pages, and the links between them.
  const splitting = new Map<string, string[]>();
  const edges = new Map<string, number>();
  for (const [search, pages] of bySearch) {
    if (pages.size < 2) continue;
    const total = [...pages.values()].reduce((sum, page) => sum + page.impressions, 0);
    const split = [...pages].filter(([, page]) => total > 0 && page.impressions / total >= SPLIT_SHARE).map(([path]) => path).sort();
    if (split.length < 2) continue;
    splitting.set(search, split);
    for (let a = 0; a < split.length; a += 1) {
      for (let b = a + 1; b < split.length; b += 1) {
        const pair = linkKey(split[a], split[b]);
        edges.set(pair, (edges.get(pair) ?? 0) + 1);
      }
    }
  }
  const nodes = [...new Set([...splitting.values()].flat())].sort();
  const top3 = input.clickRates.top3 ?? null;

  const groups = partsOf(nodes, edges, LINK_SEARCHES).map((members): CompetingGroup => {
    const inGroup = new Set(members);
    const searches: GroupSearch[] = [];
    for (const [search, pages] of bySearch) {
      const here = [...pages].filter(([path]) => inGroup.has(path));
      if (here.length < 2) continue;
      const figures = input.searchOf(search);
      const shown = here.reduce((sum, [, page]) => sum + page.impressions, 0);
      const clicks = here.reduce((sum, [, page]) => sum + page.clicks, 0);
      const sorted = here.map(([path, page]) => ({ path, shown: page.impressions, clicks: page.clicks })).sort((a, b) => b.clicks - a.clicks || b.shown - a.shown || a.path.localeCompare(b.path));
      const split = (splitting.get(search) ?? []).filter((path) => inGroup.has(path)).length >= 2;
      // At a top-three place the search would be clicked at the website's own top-three rate: its volume a month when known.
      const rateHere = figures.position !== null ? input.clickRates[bandOf(figures.position)] ?? 0 : 0;
      const perMonth = clicks / input.months;
      const gain = top3 === null || figures.position === null
        ? null
        : figures.volume !== null
          ? Math.max(0, figures.volume * top3 - perMonth)
          : Math.max(0, (shown / input.months) * (top3 - rateHere));
      searches.push({ search, shown, clicks, split, position: figures.position, volume: figures.volume, top: sorted[0].path, pages: sorted, gain });
    }
    searches.sort((a, b) => b.shown - a.shown || a.search.localeCompare(b.search));
    const pages: GroupPage[] = members.map((path) => {
      const mine = searches.flatMap((search) => search.pages.filter((page) => page.path === path));
      return { path, ...input.pageOf(path), clicks: mine.reduce((sum, page) => sum + page.clicks, 0), shown: mine.reduce((sum, page) => sum + page.shown, 0), searches: mine.length, decision: "OWNER" as Decision };
    });
    const owner = ownerOf(pages);
    for (const page of pages) page.decision = decisionFor(page, owner);
    pages.sort((a, b) => Number(b.path === owner.path) - Number(a.path === owner.path) || b.enquiries - a.enquiries || b.clicks - a.clicks || b.shown - a.shown);
    const split = searches.filter((search) => search.split);
    const shown = searches.reduce((sum, search) => sum + search.shown, 0);
    const clicks = searches.reduce((sum, search) => sum + search.clicks, 0);
    // Google gives close variants one volume ("web designers", "website designers": 8,100 each), so each is counted once.
    const counted = new Set<string>();
    const gains = split.filter((search) => {
      if (search.gain === null) return false;
      if (search.volume === null) return true;
      const variant = `${search.volume}|${variantOf(search.search)}`;
      if (counted.has(variant)) return false;
      counted.add(variant);
      return true;
    }).map((search) => search.gain!);
    const gainClicks = gains.length > 0 ? Math.round(gains.reduce((sum, gain) => sum + gain, 0) * 10) / 10 : null;
    const ownerRate = owner.visits >= OWN_RATE_VISITS ? owner.enquiries / owner.visits : input.websiteRate;
    const recentBefore = pages.every((page) => page.recentBefore === null) ? null : pages.reduce((sum, page) => sum + (page.recentBefore ?? 0), 0);
    return {
      key: owner.path,
      name: searches[0]?.search ?? owner.path,
      owner: owner.path,
      pages,
      searches: searches.slice(0, MOST_SEARCHES),
      shared: searches.length,
      split: split.length,
      shown,
      clicks,
      enquiries: pages.reduce((sum, page) => sum + page.enquiries, 0),
      recent: pages.reduce((sum, page) => sum + page.recent, 0),
      recentBefore,
      gainClicks,
      gainEnquiries: gainClicks !== null && ownerRate !== null ? Math.round(gainClicks * ownerRate * 10) / 10 : null,
      sure: split.length >= 20 && shown >= 1_000 ? "LIKELY" : "ROUGH",
    };
  });
  const kept = groups.filter((group) => group.split >= LEAST_SPLIT && group.shown >= LEAST_SHOWN).sort((a, b) => b.shown - a.shown || a.key.localeCompare(b.key)).slice(0, MOST_GROUPS);
  // Each group named by the most shown search its owner is shown for, never a name a bigger group took.
  const taken = new Set<string>();
  for (const group of kept) {
    const named = group.searches.filter((search) => search.pages.some((page) => page.path === group.owner)).find((search) => !taken.has(search.search))
      ?? group.searches.find((search) => !taken.has(search.search));
    group.name = named?.search ?? group.owner;
    taken.add(group.name);
  }
  return kept;
}

const nullable = v.union(v.number(), v.null());
const decisionValidator = v.union(v.literal("OWNER"), v.literal("MERGE"), v.literal("DIFFERENTIATE"), v.literal("LINK"));

/** A group as it is kept (`insightCompetingGroups`) and read by the screens. */
export const competingGroupValidator = v.object({
  key: v.string(),
  name: v.string(),
  owner: v.string(),
  pages: v.array(v.object({
    path: v.string(), kind: v.union(v.string(), v.null()), type: v.string(), visits: v.number(), enquiries: v.number(), recent: v.number(), recentBefore: nullable, shownAll: v.optional(nullable),
    clicks: v.number(), shown: v.number(), searches: v.number(), decision: decisionValidator,
  })),
  searches: v.array(v.object({
    search: v.string(), shown: v.number(), clicks: v.number(), split: v.boolean(), position: nullable, volume: nullable, top: v.string(),
    pages: v.array(v.object({ path: v.string(), shown: v.number(), clicks: v.number() })), gain: nullable,
  })),
  shared: v.number(),
  split: v.number(),
  shown: v.number(),
  clicks: v.number(),
  enquiries: v.number(),
  recent: v.number(),
  recentBefore: nullable,
  gainClicks: nullable,
  gainEnquiries: nullable,
  sure: v.union(v.literal("LIKELY"), v.literal("ROUGH")),
});
export type KeptGroup = Infer<typeof competingGroupValidator>;

const count = (value: number) => Math.round(value).toLocaleString("en-GB");
const listOf = (items: readonly string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** What to do with each page beside the owner, in words a client reads. */
function decisionWords(page: { path: string; decision: Decision }, owner: string): string {
  if (page.decision === "MERGE") return `merge ${page.path} into it, with a redirect`;
  if (page.decision === "LINK") return `keep ${page.path} and link from it to ${owner}`;
  return `make ${page.path} clearly about something different`;
}

/**
 * A group written up as a finding (phase 3: "each group is a finding"): built
 * from its figures, not by a specialist, so every number is the group's own;
 * the facts it rests on kept beside it for the finding's page.
 */
export function competingFinding(group: KeptGroup, span: { from: string; to: string }, checkOn: string) {
  const others = group.pages.filter((page) => page.path !== group.owner);
  const owner = group.pages.find((page) => page.path === group.owner);
  const fact = (key: string, value: number, unit: "count" | "ratio", source: "searchConsole" | "analytics" | "market", label: string, from?: string, to?: string) => ({
    key: `competing.${group.key}.${key}`, value, unit, source, label, ...(from ? { from } : {}), ...(to ? { to } : {}),
  });
  const facts = [
    fact("shared", group.shared, "count", "searchConsole", "searches Google showed two or more of the group's pages for", span.from, span.to),
    fact("split", group.split, "count", "searchConsole", "searches Google split between two or more of them", span.from, span.to),
    fact("shown", group.shown, "count", "searchConsole", "times Google showed the group's pages for those searches", span.from, span.to),
    fact("clicks", group.clicks, "count", "searchConsole", "Google clicks the group's pages had for them", span.from, span.to),
    fact("enquiries", group.enquiries, "count", "analytics", "enquiries the group's pages brought in the last 12 months"),
    fact("recent", group.recent, "count", "analytics", "enquiries they brought in the last three months"),
    ...(group.recentBefore !== null ? [fact("recentBefore", group.recentBefore, "count", "analytics", "enquiries they brought in the same three months a year before")] : []),
    ...(group.gainClicks !== null ? [fact("gainClicks", group.gainClicks, "count", "market", "extra Google clicks a month with the owner in the top three")] : []),
    ...(group.gainEnquiries !== null ? [fact("gainEnquiries", group.gainEnquiries, "count", "market", "extra enquiries a month that would bring")] : []),
  ];
  const brings = owner && owner.enquiries > 0
    ? `${group.owner} brings the most enquiries of them (${count(owner.enquiries)} in the last 12 months), so it should own these searches.`
    : `${group.owner} has the most clicks of them, so it should own these searches.`;
  const gain = group.gainClicks !== null && group.gainClicks >= 1
    ? ` Held in the top three for the searches they split, it would have about ${count(group.gainClicks)} more Google clicks a month${group.gainEnquiries !== null && group.gainEnquiries >= 0.5 ? `, and about ${count(group.gainEnquiries)} more enquiries` : ""}.`
    : "";
  return {
    specialist: "search" as const,
    pattern: "COMPETING_PAGES",
    ...(group.gainEnquiries !== null && group.gainEnquiries * 12 >= 1 ? { atStake: Math.round(group.gainEnquiries * 12) } : {}),
    headline: `${group.pages.length} of your pages split Google's searches for "${group.name}": shown ${count(group.shown)} times in 90 days for ${count(group.clicks)} clicks.`,
    story: `Google shows ${listOf(others.map((page) => page.path))} as well as ${group.owner} for ${count(group.shared)} of the same searches, and splits ${count(group.split)} of them between two or more, so none of them holds a high place. ${brings}${gain}`,
    action: `Make ${group.owner} the page for these searches: ${listOf(others.map((page) => decisionWords(page, group.owner)))}.`,
    howWeKnow: `From Search Console's searches by page from ${span.from} to ${span.to}, and Google Analytics' enquiries by landing page over the last 12 months. Checked again on ${checkOn}: Google should split fewer of these searches, and ${group.owner} should be clicked more.`,
    ruledOut: ["Your home page and searches for your own name are left out: they bring enquiries for everything."],
    sure: group.sure === "LIKELY" ? (group.split >= 50 && group.shown >= 10_000 ? "HIGH" as const : "MEDIUM" as const) : "LOW" as const,
    sources: ["searchConsole", "analytics", ...(group.gainClicks !== null ? ["market"] : [])],
    facts,
    comparisons: group.recentBefore !== null ? [[`competing.${group.key}.recent`, `competing.${group.key}.recentBefore`]] : [],
    checkOn,
  };
}

/** Keyword cannibalisation summed up for the Executive summary: every group, and the biggest. */
export function competingSummary(groups: readonly KeptGroup[]) {
  const biggest = groups[0];
  const total = (field: "shared" | "shown" | "clicks") => groups.reduce((sum, group) => sum + group[field], 0);
  return {
    groups: groups.length,
    pages: groups.reduce((sum, group) => sum + group.pages.length, 0),
    shared: total("shared"),
    shown: total("shown"),
    clicks: total("clicks"),
    biggest: { key: biggest.key, name: biggest.name, pages: biggest.pages.length, shared: biggest.shared, shown: biggest.shown, clicks: biggest.clicks },
  };
}
