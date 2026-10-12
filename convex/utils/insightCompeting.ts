import { v, type Infer } from "convex/values";
import { OWN_RATE_VISITS, bandOf, type PositionBand } from "./heroes";
import type { Fact } from "./insightFacts";
import { namedIn, placeName, wordsOf, type Named } from "./placeNames";

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
  /** Of its enquiries, those from people who came from Google's own results: what decides between two pages equal on everything else. */
  googleEnquiries?: number;
};

/** What the searches are read against: the website's own country (a search naming it names no one place) and the places it has offices. */
export type Places = { homeIso: string | null; offices: readonly string[] };

/**
 * A page is merged only when the group's searches are at least this share of
 * all its showings — Ronins' /brand-design-agency/, 39% of it the owner's
 * branding searches; otherwise it has a topic of its own.
 */
export const MERGE_SHARE = 1 / 3;

export type Decision = "OWNER" | "MERGE" | "DIFFERENTIATE" | "LINK";
export type Sure = "LIKELY" | "ROUGH";

/**
 * Why a page should own a search, each step that narrowed the pages Google
 * shows for it, in the order they are weighed (`ownerOfSearch`).
 */
export const OWNER_WHYS = ["ARTICLE", "SELLS", "PLACE", "OTHER_PLACE", "NEAR", "NO_PLACE", "WORDS", "GOOGLE", "ENQUIRIES", "AGENT"] as const;
export type OwnerWhy = (typeof OWNER_WHYS)[number];

export type GroupPage = PageFigures & {
  path: string;
  clicks: number;
  shown: number;
  searches: number;
  decision: Decision;
  /** The place the page is for (/web-design-surrey/: "surrey"), none for a page for no one place. */
  place?: string | null;
  /** The group's searches it should own, and how often they are searched a month, close variants once, when known. */
  owns?: number;
  ownsVolume?: number | null;
  /** The page a page that owns none is merged into, links to or is made different from: the one owning most of what it is shown for. */
  into?: string | null;
  /** The Keyword cannibalisation specialist's reason for what to do with it, in a sentence a client reads. */
  reason?: string;
};
export type GroupSearch = {
  search: string;
  shown: number;
  clicks: number;
  split: boolean;
  position: number | null;
  volume: number | null;
  /** The page Google sends most of the search's clicks to, or shows most. */
  top: string;
  /** The page that should own it, and why (Anthony, 12 October 2026: "location, keyword volume and other factors all make this up"). */
  owner?: string;
  why?: OwnerWhy[];
  /** The place it names, as its words name it ("london"), when it names one. */
  place?: string | null;
  /** Why the Keyword cannibalisation specialist gave it a page other than the rule's, in a sentence a client reads. */
  reason?: string;
  pages: Array<{ path: string; shown: number; clicks: number }>;
  /** Extra Google clicks a month at a top-three place, from how often it is searched when known, else from times shown. */
  gain: number | null;
};
export type CompetingGroup = {
  key: string;
  name: string;
  /** The page that should own the most of the group's searches, weighed by how often they are searched: the group is kept by it. */
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
  /**
   * Who decided its pages (Anthony, 12 October 2026: "it should be routed to
   * the head of strategy then assigned to the cannibalisation agent"): the
   * Keyword cannibalisation specialist, in the week it did, or the rule
   * alone when it wasn't reached; and the rule's reading it decided, so an
   * unchanged group keeps its decision rather than being asked again.
   */
  decidedBy?: "AGENT" | "RULE";
  decidedWeek?: string;
  signature?: string;
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

/** How often searches are searched a month, close variants once; null when none of them is known. */
function volumeOf(searches: readonly GroupSearch[]): number | null {
  const counted = new Set<string>();
  let total: number | null = null;
  for (const search of searches) {
    if (search.volume === null) continue;
    const variant = `${search.volume}|${variantOf(search.search)}`;
    if (counted.has(variant)) continue;
    counted.add(variant);
    total = (total ?? 0) + search.volume;
  }
  return total;
}

/** Words that say nothing of what a search is for: left out when a page's words are set against it. */
const FILLER = new Set(["a", "an", "the", "in", "of", "for", "to", "and", "or", "near", "me", "nearby", "by", "best", "top", "my", "with", "on", "at", "from", "based", "local"]);
/** Words that make a search a question, which an article answers: anything else is a search to buy. */
const QUESTION = new Set(["how", "what", "why", "when", "which", "who", "where", "should", "guide", "tips", "ideas", "examples", "vs", "versus", "checklist", "meaning"]);

/** A text's words that say what it is about, each by its first three letters as `variantOf` reads them, its places left out. */
function subjectOf(text: string, named: Named): Set<string> {
  const placeWords = new Set(named.places.flatMap((place) => place.split(" ")));
  return new Set(wordsOf(text).filter((word) => !FILLER.has(word) && !placeWords.has(word)).map((word) => word.slice(0, 3)));
}

type Contender = { path: string; type: string; place: string | null; places: readonly string[]; subject: ReadonlySet<string>; shown: number; clicks: number; googleEnquiries: number };

/**
 * The page that should own one search, of the pages Google shows for it
 * (Anthony, 12 October 2026: "location, keyword volume and other factors all
 * make this up" — never one figure alone). Weighed in turn, each step keeping
 * only the pages it favours when it favours some over others:
 *
 * 1. Kind: a question to an article, any other search to a page that sells —
 *    first, so an article that names no place never takes "web designers"
 *    from the place pages that sell.
 * 2. Place: a search naming a place goes to that place's page — a town's
 *    county's when the town has none ("web design guildford" to Surrey's);
 *    "near me" to the page for a place the business has an office; and a
 *    search naming no place, only the country, or a place none of the pages
 *    is for, to a page for no one place.
 * 3. Words: the page whose own words cover most of the search's.
 * 4. Google: the page it already sends most clicks to, then shows most.
 * 5. Enquiries: the page more people from Google's results enquired from.
 *
 * How often a search is searched never decides: it is as big whichever page
 * owns it. It weighs which page owns the most (`competingGroups`).
 */
export function ownerOfSearch(search: string, named: Named, contenders: readonly Contender[], offices: ReadonlySet<string>): { owner: string; why: OwnerWhy[] } {
  let pool = [...contenders];
  const why: OwnerWhy[] = [];
  const narrow = (reason: OwnerWhy, keep: (page: Contender) => boolean) => {
    const kept = pool.filter(keep);
    if (kept.length === 0 || kept.length === pool.length) return false;
    pool = kept;
    why.push(reason);
    return true;
  };
  if (wordsOf(search).some((word) => QUESTION.has(word))) narrow("ARTICLE", (page) => page.type === "INFORMATIONAL");
  else narrow("SELLS", (page) => page.type !== "INFORMATIONAL");
  const noPlace = (page: Contender) => page.place === null;
  if (named.places.length > 0) {
    const town = named.places[0];
    if (!narrow("PLACE", (page) => page.place === town) && !narrow("PLACE", (page) => page.places.some((place) => named.places.includes(place)))) {
      narrow("OTHER_PLACE", noPlace);
    }
  } else if (named.near && offices.size > 0) {
    if (!narrow("NEAR", (page) => page.places.some((place) => offices.has(place)))) narrow("NO_PLACE", noPlace);
  } else {
    narrow("NO_PLACE", noPlace);
  }
  const wanted = subjectOf(search, named);
  const fit = (page: Contender) => (wanted.size === 0 ? 0 : [...wanted].filter((word) => page.subject.has(word)).length / wanted.size);
  const bestFit = Math.max(...pool.map(fit));
  narrow("WORDS", (page) => fit(page) === bestFit);
  const [shownMost] = [...pool].sort((a, b) => b.clicks - a.clicks || b.shown - a.shown);
  narrow("GOOGLE", (page) => page.clicks === shownMost.clicks && page.shown === shownMost.shown);
  const mostEnquiries = Math.max(...pool.map((page) => page.googleEnquiries));
  narrow("ENQUIRIES", (page) => page.googleEnquiries === mostEnquiries);
  const [owner] = pool.sort((a, b) => a.path.localeCompare(b.path));
  return { owner: owner.path, why: why.length > 0 ? why : ["GOOGLE"] };
}

/**
 * A page's decision against the page it is read against: a page owning
 * searches of its own is kept for them; of a page owning none, an article
 * beside a page that sells is kept and links to it; a page shown largely for
 * the group's searches is merged into the page owning most of them with a
 * redirect, even one bringing enquiries (Anthony, 12 October 2026: "I'm happy
 * to merge pages that generate enquiries, that's valid in fixing
 * cannibalisation"), which the redirect carries over; any other — a topic of
 * its own the group only touches (an SEO page sharing a few "AI SEO"
 * searches) — is made clearly different.
 */
export function decisionFor(page: GroupPage, owner: GroupPage): Decision {
  if (page.path === owner.path || (page.owns ?? 0) > 0) return "OWNER";
  if (page.type === "INFORMATIONAL" && owner.type !== "INFORMATIONAL") return "LINK";
  const mostlyHere = page.shownAll !== undefined && page.shownAll !== null && page.shownAll > 0 && page.shown >= page.shownAll * MERGE_SHARE;
  // A redirect carries the page's clicks, enquiries and links to the owner, so none of them keeps it.
  if (mostlyHere) return "MERGE";
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
  /** Its own country and its offices' places; none known, every search is weighed as naming a place only by its words. */
  places?: Places;
}): CompetingGroup[] {
  const homeIso = input.places?.homeIso ?? null;
  const offices = new Set(input.places?.offices ?? []);
  const namedOf = new Map<string, Named>();
  const placesOf = (text: string) => {
    let held = namedOf.get(text);
    if (!held) namedOf.set(text, (held = namedIn(text, homeIso)));
    return held;
  };
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
      return { path, ...input.pageOf(path), clicks: mine.reduce((sum, page) => sum + page.clicks, 0), shown: mine.reduce((sum, page) => sum + page.shown, 0), searches: mine.length, decision: "OWNER" as Decision, place: placesOf(path).places[0] ?? null };
    });

    // Each search's owner, of the pages Google shows for it (`ownerOfSearch`).
    const contenders = new Map(pages.map((page) => {
      const own = placesOf(page.path);
      return [page.path, { path: page.path, type: page.type, place: own.places[0] ?? null, places: own.places, subject: subjectOf(page.path, own), googleEnquiries: page.googleEnquiries ?? 0 }];
    }));
    for (const search of searches) {
      const named = placesOf(search.search);
      const chosen = ownerOfSearch(search.search, named, search.pages.map((page) => ({ ...contenders.get(page.path)!, shown: page.shown, clicks: page.clicks })), offices);
      Object.assign(search, { owner: chosen.owner, why: chosen.why, place: named.places[0] ?? null });
    }

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
    const recentBefore = pages.every((page) => page.recentBefore === null) ? null : pages.reduce((sum, page) => sum + (page.recentBefore ?? 0), 0);
    return settleGroup({
      key: "",
      name: searches[0]?.search ?? "",
      owner: "",
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
      gainEnquiries: null,
      sure: split.length >= 20 && shown >= 1_000 ? "LIKELY" : "ROUGH",
    }, input.websiteRate);
  });
  const kept = groups.filter((group) => group.split >= LEAST_SPLIT && group.shown >= LEAST_SHOWN).sort((a, b) => b.shown - a.shown || a.key.localeCompare(b.key)).slice(0, MOST_GROUPS);
  nameGroups(kept);
  return kept;
}

/**
 * A group's pages settled from its searches' owners — the rule's, or the
 * Keyword cannibalisation agent's where it chose another — so the screens,
 * the findings and Page decisions all add up the same way: what each page
 * should own and how often that is searched, the page owning the most
 * (which keeps the group), every page's decision, and the enquiries a top-
 * three place would bring at each owner's own rate.
 */
export function settleGroup<Group extends CompetingGroup | KeptGroup>(group: Group, websiteRate: number | null): Group {
  const { pages, searches } = group;
  const byPath = new Map(pages.map((page) => [page.path, page]));
  const ownedBy = (path: string) => searches.filter((search) => search.owner === path);
  for (const page of pages) {
    page.owns = ownedBy(page.path).length;
    page.ownsVolume = volumeOf(ownedBy(page.path));
  }
  const ownedShown = (path: string) => ownedBy(path).reduce((sum, search) => sum + search.shown, 0);
  const [owner] = [...pages].sort((a, b) => (b.ownsVolume ?? 0) - (a.ownsVolume ?? 0) || ownedShown(b.path) - ownedShown(a.path) || (b.owns ?? 0) - (a.owns ?? 0)
    || (b.googleEnquiries ?? 0) - (a.googleEnquiries ?? 0) || a.path.localeCompare(b.path));
  for (const page of pages) {
    if ((page.owns ?? 0) > 0) {
      page.decision = "OWNER";
      page.into = null;
      continue;
    }
    // A page owning none is read against the page owning most of what it is shown for.
    const against = new Map<string, number>();
    for (const search of searches) {
      const mine = search.pages.find((entry) => entry.path === page.path);
      if (mine && search.owner && search.owner !== page.path) against.set(search.owner, (against.get(search.owner) ?? 0) + mine.shown);
    }
    const [most] = [...against].sort((a, b) => b[1] - a[1] || Number(b[0] === owner.path) - Number(a[0] === owner.path) || a[0].localeCompare(b[0]));
    const target = byPath.get(most?.[0] ?? owner.path) ?? owner;
    page.decision = decisionFor(page as GroupPage, target as GroupPage);
    page.into = target.path;
  }
  pages.sort((a, b) => Number(b.path === owner.path) - Number(a.path === owner.path) || Number(b.decision === "OWNER") - Number(a.decision === "OWNER")
    || (b.ownsVolume ?? 0) - (a.ownsVolume ?? 0) || (b.owns ?? 0) - (a.owns ?? 0) || b.enquiries - a.enquiries || b.clicks - a.clicks || b.shown - a.shown);
  // The extra clicks a top-three place would bring, at the enquiry rate of each search's owner: its own from `OWN_RATE_VISITS` visits.
  const rateOf = (path: string) => {
    const page = byPath.get(path);
    return page && page.visits >= OWN_RATE_VISITS ? page.enquiries / page.visits : websiteRate;
  };
  const weighed = searches.filter((search) => search.split && search.gain !== null && search.gain > 0);
  const weight = weighed.reduce((sum, search) => sum + search.gain!, 0);
  const rates = weighed.map((search) => rateOf(search.owner ?? owner.path));
  const rate = weight > 0 && rates.some((entry) => entry !== null)
    ? weighed.reduce((sum, search, at) => sum + search.gain! * (rates[at] ?? 0), 0) / weight
    : rateOf(owner.path);
  group.gainEnquiries = group.gainClicks !== null && rate !== null ? Math.round(group.gainClicks * rate * 10) / 10 : null;
  group.key = owner.path;
  group.owner = owner.path;
  return group;
}

/** Each group named by the most shown search its owner should own, never a name a bigger group took. */
export function nameGroups(groups: Array<CompetingGroup | KeptGroup>): void {
  const taken = new Set<string>();
  for (const group of groups) {
    const named = group.searches.filter((search) => search.owner === group.owner).find((search) => !taken.has(search.search))
      ?? group.searches.filter((search) => search.pages.some((page) => page.path === group.owner)).find((search) => !taken.has(search.search))
      ?? group.searches.find((search) => !taken.has(search.search));
    group.name = named?.search ?? group.owner;
    taken.add(group.name);
  }
}

const nullable = v.union(v.number(), v.null());
const nullableText = v.union(v.string(), v.null());
const decisionValidator = v.union(v.literal("OWNER"), v.literal("MERGE"), v.literal("DIFFERENTIATE"), v.literal("LINK"));
const whyValidator = v.union(...OWNER_WHYS.map((why) => v.literal(why)));

/** A group as it is kept (`insightCompetingGroups`) and read by the screens. */
export const competingGroupValidator = v.object({
  key: v.string(),
  name: v.string(),
  owner: v.string(),
  // The owner by search (12 October 2026) is optional: a group kept before it has none until the next week's run.
  pages: v.array(v.object({
    path: v.string(), kind: v.union(v.string(), v.null()), type: v.string(), visits: v.number(), enquiries: v.number(), recent: v.number(), recentBefore: nullable, shownAll: v.optional(nullable),
    clicks: v.number(), shown: v.number(), searches: v.number(), decision: decisionValidator,
    googleEnquiries: v.optional(v.number()), place: v.optional(nullableText), owns: v.optional(v.number()), ownsVolume: v.optional(nullable), into: v.optional(nullableText),
    reason: v.optional(v.string()),
  })),
  searches: v.array(v.object({
    search: v.string(), shown: v.number(), clicks: v.number(), split: v.boolean(), position: nullable, volume: nullable, top: v.string(),
    pages: v.array(v.object({ path: v.string(), shown: v.number(), clicks: v.number() })), gain: nullable,
    owner: v.optional(v.string()), why: v.optional(v.array(whyValidator)), place: v.optional(nullableText), reason: v.optional(v.string()),
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
  decidedBy: v.optional(v.union(v.literal("AGENT"), v.literal("RULE"))),
  decidedWeek: v.optional(v.string()),
  signature: v.optional(v.string()),
});
export type KeptGroup = Infer<typeof competingGroupValidator>;

const listOf = (items: readonly string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** What to do with a page owning none of the searches, against the page owning most of what it is shown for, in words a client reads. */
function decisionWords(page: { path: string; decision: Decision; into?: string | null }, owner: string): string {
  const into = page.into ?? owner;
  if (page.decision === "MERGE") return `merge ${page.path} into ${into}, with a redirect`;
  if (page.decision === "LINK") return `keep ${page.path} and link from it to ${into}`;
  return `make ${page.path} clearly about something different from ${into}`;
}

/**
 * How Hakken decides which page owns a search, for the agents who write about
 * the website's pages (Anthony, 12 October 2026: "are you building these into
 * the agents so that they have this knowledge as it can be reused"): the
 * steps `ownerOfSearch` takes, in the order it takes them, so an agent never
 * gives advice the Keyword cannibalisation screens contradict.
 */
export const OWNER_RULE = [
  "Each search should have one page, chosen from the pages Google already shows for it, in this order. First the kind: a question goes to an article, any other search to a page that sells. Then the place: a search that names a place goes to that place's page, or to its county's when the town has none; a \"near me\" search goes to the page for a place where the business has an office; a search that names no place, only the country, or a place none of the pages is for goes to a page for no one place. Then the words: the page whose own words cover most of the search's. Then the page Google already sends most clicks to, then the page more people from Google's results enquired from.",
  "How often a search is searched never decides which page owns it, because the search is as big whichever page owns it; it decides which page owns the most. A page that owns searches is kept and made clearly about them. A page that owns none is merged into the page owning most of what it is shown for, with a redirect, when those searches are a third or more of all its showings, even when it brought enquiries, which the redirect carries over; an article beside a page that sells is kept and links to it; any other page is made clearly about something different.",
].join("\n");

/** The rule as the other agents are given it: the Keyword cannibalisation specialist decides, so they never do. */
export const COMPETING_RULE = [
  "Keyword cannibalisation — pages of the website competing for the same Google searches — is the Keyword cannibalisation specialist's, handed it by the Head of Strategy, and written up as its own findings. Never write a finding that merges or redirects a page, or that names the page that should own a search. If you mention competing pages, use the same rule it does:",
  OWNER_RULE,
].join("\n");

/** The facts a group's write-up names, kept beside it for the finding's page and the Editor's checks. */
export function competingFacts(group: CompetingGroup | KeptGroup, span: { from: string; to: string }): Fact[] {
  const fact = (key: string, value: number, source: "searchConsole" | "analytics" | "market", label: string, within = false): Fact => ({
    key: `competing.${group.key}.${key}`, value, unit: "count", source, label, ...(within ? { from: span.from, to: span.to } : {}),
  });
  return [
    fact("pages", group.pages.length, "searchConsole", "pages of the website Google showed for the same searches", true),
    fact("shared", group.shared, "searchConsole", "searches Google showed two or more of the group's pages for", true),
    fact("split", group.split, "searchConsole", "searches Google split between two or more of them", true),
    fact("shown", group.shown, "searchConsole", "times Google showed the group's pages for those searches", true),
    fact("clicks", group.clicks, "searchConsole", "Google clicks the group's pages had for them", true),
    fact("enquiries", group.enquiries, "analytics", "enquiries the group's pages brought in the last 12 months"),
    fact("recent", group.recent, "analytics", "enquiries they brought in the last three months"),
    ...(group.recentBefore !== null ? [fact("recentBefore", group.recentBefore, "analytics", "enquiries they brought in the same three months a year before")] : []),
    ...(group.gainClicks !== null ? [fact("gainClicks", group.gainClicks, "market", "extra Google clicks a month with each search's page in the top three")] : []),
    ...(group.gainEnquiries !== null ? [fact("gainEnquiries", group.gainEnquiries, "market", "extra enquiries a month that would bring")] : []),
  ];
}

/** The days until a group's finding is checked. */
export const GROUP_CHECK_DAYS = 56;

/**
 * A group written up as a finding (phase 3: "each group is a finding"), for
 * the Head of Strategy to rank among the week's and the Editor to check like
 * any other: every figure named by its fact (`competingFacts`), never typed.
 * The headline and story are the Keyword cannibalisation specialist's when it
 * wrote them; what to do is always read from the group's own decisions, so
 * the finding never says other than the screens.
 */
export function competingDraft(group: CompetingGroup | KeptGroup, words?: { headline?: string; story?: string } | null) {
  const named = (fact: string) => `[[competing.${group.key}.${fact}]]`;
  const others = group.pages.filter((page) => page.path !== group.owner);
  const owners = group.pages.filter((page) => page.decision === "OWNER");
  const rest = others.filter((page) => page.decision !== "OWNER");
  const keeping = owners.slice(1).map((page) => page.path);
  const gain = group.gainClicks !== null && group.gainClicks >= 1
    ? ` Held in the top three for the searches they split, they would have about ${named("gainClicks")} more Google clicks a month${group.gainEnquiries !== null && group.gainEnquiries >= 0.5 ? `, and about ${named("gainEnquiries")} more enquiries` : ""}.`
    : "";
  const story = `Google shows ${listOf(others.map((page) => page.path))} as well as ${group.owner} for ${named("shared")} of the same searches, and splits ${named("split")} of them between two or more, so none of them holds a high place. Each search should have one page: one that names a place goes to that place's page, and one that names no place to a page for no one place; then the page whose words fit it best, and the one Google already shows most. On that, ${group.owner} should own the most of them${keeping.length > 0 ? `, and ${listOf(keeping)} ${keeping.length > 1 ? "keep" : "keeps"} ${keeping.length > 1 ? "their" : "its"} own` : ""}.${gain}`;
  const keep = `keep ${listOf(owners.map((page) => page.path))} for the searches ${owners.length > 1 ? "each should own, each made clearly about its own" : "it should own"}`;
  return {
    specialist: "search" as const,
    pattern: "COMPETING_PAGES",
    ...(group.gainEnquiries !== null && group.gainEnquiries * 12 >= 1 ? { atStake: Math.round(group.gainEnquiries * 12) } : {}),
    stake: (group.gainEnquiries ?? 0) * 12,
    headline: words?.headline || `${named("pages")} of your pages split Google's searches for "${group.name}": shown ${named("shown")} times in 90 days for ${named("clicks")} clicks.`,
    story: words?.story || story,
    action: `Give each search one page: ${[keep, ...rest.map((page) => decisionWords(page, group.owner))].join("; ")}.`,
    howWeKnow: "From Search Console's searches by page over the last 90 days, the places the searches and the pages name, and Google Analytics' enquiries by landing page over the last 12 months. Checked again in 8 weeks: Google should split fewer of these searches, and each page should be clicked more for its own.",
    ruledOut: ["Your home page and searches for your own name are left out: they bring enquiries for everything."],
    sure: group.sure === "LIKELY" ? (group.split >= 50 && group.shown >= 10_000 ? "HIGH" as const : "MEDIUM" as const) : "LOW" as const,
    comparisons: group.recentBefore !== null ? [[`competing.${group.key}.recent`, `competing.${group.key}.recentBefore`]] : [],
    checkInDays: GROUP_CHECK_DAYS,
  };
}

/** Each step of the rule in words, for Ask Hakken (the screens word them from `insights.cannibalisation.why`). */
const WHY_WORDS: Record<OwnerWhy, string> = {
  ARTICLE: "a question, which an article answers", SELLS: "a page that sells, not an article", PLACE: "names {place}", OTHER_PLACE: "names {place}, which none of these pages is for",
  NEAR: "near me: the page for where the business has an office", NO_PLACE: "names no one place", WORDS: "its words fit the search best", GOOGLE: "Google already shows it most",
  ENQUIRIES: "more enquiries from Google", AGENT: "the Keyword cannibalisation specialist's choice",
};
/** Searches of a group Ask Hakken reads, the most searched first. */
const SEARCHES_FOR_ASSISTANT = 25;

/**
 * Keyword cannibalisation for Ask Hakken (Anthony, 12 October 2026: "its
 * important the info is consistent here and in ask hakken"): every group as
 * kept — who decided it, what to do with each page and why, and the page for
 * each of its most searched searches — in the words the screens use, so Ask
 * Hakken repeats the decision and never makes its own.
 */
export function competingForAssistant(groups: readonly KeptGroup[]) {
  return {
    rule: "Keyword cannibalisation as the Keyword cannibalisation specialist decided it, handed the groups by the Head of Strategy (or Hakken's own rule where it says so). Give it as written: which page should own a search, and what to do with each page. For a page or a search not here, say the team hasn't looked at it yet — never your own advice.",
    link: "/app/insights/cannibalisation",
    groups: groups.map((group) => ({
      name: group.name,
      link: `/app/insights/cannibalisation/group?key=${encodeURIComponent(group.key)}`,
      decided_by: group.decidedBy === "AGENT" ? `the Keyword cannibalisation specialist${group.decidedWeek ? `, on ${group.decidedWeek}` : ""}` : "Hakken's rule: the specialist hasn't looked at this group yet",
      main_page: group.owner,
      pages: group.pages.map((page) => ({
        page: page.path,
        do: page.decision === "OWNER" ? `keep it for the ${page.owns ?? 0} searches it should own` : decisionWords(page, group.owner),
        ...(page.reason ? { why: page.reason } : {}),
      })),
      searches: [...group.searches].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || b.shown - a.shown).slice(0, SEARCHES_FOR_ASSISTANT).map((search) => ({
        search: search.search,
        searched_a_month: search.volume,
        should_own: search.owner ?? search.top,
        why: search.reason || (search.why ?? []).map((why) => WHY_WORDS[why].replace("{place}", search.place ? placeName(search.place) : "a place")).join("; "),
      })),
    })),
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
