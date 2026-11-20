import { v, type Infer } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { loadSite } from "./websiteSiteRows";
import { holdBrandNames } from "./holdProfiles";
import { normaliseKeyword } from "./seoJudgments";
import { searchVolumeOf } from "./searchVolumes";
import { pagePath, pageTypeByAddress } from "./utils/siteShapes";
import type { PeriodRow } from "./searchConsolePeriodReads";
import type { ListRow, View } from "./utils/searchConsoleViews";

/**
 * What Sites already knows about the keywords and pages Search Console
 * lists (docs/plans/active/search-console-plan.md §13.3, §14.3 item 4): a
 * keyword's intent and the searches a month behind it, a page's type and the
 * visits Sites estimates for it. Looked up once after each collection and
 * kept with the ready-made periods, so no screen looks anything up a row at
 * a time.
 *
 * Every figure is Sites' own, read from the website's place. A keyword
 * Sites has never seen is "Not judged yet" with no monthly searches; a page,
 * its type by its address where the address says so, else "Not sorted yet".
 * Judging what is left is the Decision Maker's, and costs: not done here
 * (§13.4).
 */

/**
 * Keys looked up per ask: each is up to three index reads (collection-reliability-plan.md, RR3). 200 a call took about a
 * second, a query's whole time; 50 keep each well inside it, and more asks run side by side.
 */
const KEYS_PER_ASK = 50;

/** Unknown, as a number kept beside the others (a period's arrays hold numbers only). */
export const UNKNOWN = -1;

/** The website, the place Sites watches it from and its brand words (its Profile), for the hold's lookups. */
export const factsTarget = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({ websiteId: v.id("websites"), place: v.number(), brandWords: v.array(v.string()) })),
  handler: async (ctx, args) => {
    const site = await loadSite(ctx, args.companyWebsiteId);
    if (!site) return null;
    const brandWords = (await holdBrandNames(ctx, args.companyWebsiteId)).map((brand) => brand.name);
    return { websiteId: site.website._id, place: site.place, brandWords };
  },
});

/**
 * What a screen shows of Sites' facts (speed fixes, 18 November 2026): a keyword's intent or a page's type (`kind`), and
 * a keyword's searches a month or a page's estimated visits (`number`). Each is looked up only when wanted, so a lookup
 * reads nothing no screen shows.
 */
export const factsWantedValidator = v.object({ kind: v.boolean(), number: v.boolean() });
export type FactsWanted = Infer<typeof factsWantedValidator>;
export const EVERY_FACT: FactsWanted = { kind: true, number: true };

/**
 * The facts a live list of `kind` shows, by the page's own rule (`view`) — null when it shows none, and nothing is looked
 * up. A keyword's intent is on every list of keywords (the Intent chip); its searches a month on no Search Console list since
 * Almost there and Missed demand were taken out of the menu on 2026-11-20: Visibility's figures stay in Visibility. A page's type only until the website has Classifications, which name every page
 * on every list in its place (`withPageKinds`); its estimated visits only on Real against estimated.
 */
export function factsWanted(kind: "query" | "page", view: View, classified: boolean): FactsWanted | null {
  const wanted = kind === "query"
    ? { kind: true, number: false }
    : { kind: !classified, number: view === "estimates" };
  return wanted.kind || wanted.number ? wanted : null;
}

/**
 * Each key's facts, in the order given: for a keyword its intent and
 * monthly searches; for a page its type and Sites' estimated visits a month.
 * Only what `want` names is read; the rest is "UNJUDGED" and UNKNOWN.
 */
export const keyFacts = internalQuery({
  args: {
    websiteId: v.id("websites"),
    place: v.number(),
    kind: v.union(v.literal("query"), v.literal("page")),
    keys: v.array(v.string()),
    want: v.optional(factsWantedValidator),
  },
  returns: v.object({ kinds: v.array(v.string()), numbers: v.array(v.number()) }),
  handler: async (ctx, args) => {
    const want = args.want ?? EVERY_FACT;
    const kinds: string[] = [];
    const numbers: number[] = [];
    for (const key of args.keys) {
      if (args.kind === "query") {
        const keyword = normaliseKeyword(key);
        const ranked = await ctx.db
          .query("siteKeywordRanks")
          .withIndex("by_site_keyword", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.place).eq("keyword", keyword))
          .unique();
        const judged = !want.kind || ranked ? null : await ctx.db.query("seoKeywordIntents").withIndex("by_keyword", (q) => q.eq("keyword", keyword)).unique();
        const measured = !want.number || ranked?.volumeKnown ? null : await searchVolumeOf(ctx, keyword, args.place);
        kinds.push(want.kind ? (ranked?.intent ?? judged?.intent ?? "UNJUDGED") : "UNJUDGED");
        numbers.push(want.number ? (ranked?.volumeKnown ? ranked.volume : (measured?.volume ?? UNKNOWN)) : UNKNOWN);
      } else {
        const path = pagePath(key);
        const byAddress = want.kind ? pageTypeByAddress(path) : null;
        const judged = !want.kind || byAddress ? null : await ctx.db
          .query("sitePageTypes")
          .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId).eq("page", path))
          .unique();
        // The ranked page: its estimate, and its type where nothing else names one.
        const ranked = want.number || (want.kind && !byAddress && !judged) ? await ctx.db
          .query("sitePageRanks")
          .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.place).eq("page", path))
          .unique() : null;
        kinds.push(want.kind ? (byAddress ?? judged?.pageType ?? ranked?.pageType ?? "UNJUDGED") : "UNJUDGED");
        numbers.push(want.number ? (ranked?.traffic ?? UNKNOWN) : UNKNOWN);
      }
    }
    return { kinds, numbers };
  },
});

/** Rows of the website's ranked pages, or the pages it has judged, read a part at a time (`pageFactsByRange`). */
const PAGE_FACT_ROWS = 1_000;

/**
 * A part of the website's own page facts, from `cursor`: its ranked pages at its place (each one's type and estimated
 * visits) or the pages Sites has judged (each one's type). Read whole by `pageFactsByRange`.
 */
export const pageFactsPart = internalQuery({
  args: { websiteId: v.id("websites"), place: v.number(), of: v.union(v.literal("ranks"), v.literal("types")), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    rows: v.array(v.object({ page: v.string(), pageType: v.union(v.string(), v.null()), traffic: v.union(v.number(), v.null()) })),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = args.of === "ranks"
      ? await ctx.db.query("sitePageRanks").withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.place)).paginate({ cursor: args.cursor, numItems: PAGE_FACT_ROWS })
      : await ctx.db.query("sitePageTypes").withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId)).paginate({ cursor: args.cursor, numItems: PAGE_FACT_ROWS });
    return {
      rows: page.page.map((row) => ({ page: row.page, pageType: row.pageType ?? null, traffic: "traffic" in row ? (row.traffic ?? null) : null })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export type Facts = Map<string, { kind: string; number: number }>;

/**
 * Asks of `keyFacts` run at once: one after another, 5,000 keys took about 25 seconds (2026-10-03). Twelve, not the
 * sixteen they were until 18 November 2026: a deployment runs sixteen queries at once, and sixteen lookups at a time,
 * beside the collector's own, left a screen's reads waiting behind them (Pages' and Demand by Classification's boxes
 * showed only with Google's answer). Measured on dev that day for 5,000 of More Handles' keywords: every fact at sixteen
 * 1.6 seconds; the intent alone at twelve 1.3, at eight 2.0.
 */
const ASKS_AT_ONCE = 12;

/**
 * Keys past which a list of pages reads the website's own page facts whole, a part at a time (`pageFactsByRange`),
 * rather than three lookups a key: More Handles holds 817 ranked pages and 766 judged, two reads, where 5,000 pages were
 * a hundred asks (18 November 2026).
 */
const PAGES_READ_WHOLE_FROM = 500;

/** The facts for every key, asked a few hundred at a time, several asks at once; a long list of pages from its facts read whole. */
export async function factsFor(
  ctx: ActionCtx,
  target: { websiteId: Id<"websites">; place: number },
  kind: "query" | "page",
  keys: readonly string[],
  want: FactsWanted = EVERY_FACT,
): Promise<Facts> {
  if (kind === "page" && keys.length > PAGES_READ_WHOLE_FROM) return await pageFactsByRange(ctx, target, keys, want);
  const facts: Facts = new Map();
  const slices: string[][] = [];
  for (let start = 0; start < keys.length; start += KEYS_PER_ASK) slices.push(keys.slice(start, start + KEYS_PER_ASK));
  for (let at = 0; at < slices.length; at += ASKS_AT_ONCE) {
    const batch = slices.slice(at, at + ASKS_AT_ONCE);
    const answers = await Promise.all(batch.map(async (slice) => await ctx.runQuery(internal.searchConsoleFacts.keyFacts, { websiteId: target.websiteId, place: target.place, kind, keys: slice, want })));
    batch.forEach((slice, which) => slice.forEach((key, index) => facts.set(key, { kind: answers[which].kinds[index] ?? "UNJUDGED", number: answers[which].numbers[index] ?? UNKNOWN })));
  }
  return facts;
}

type PageFact = { page: string; pageType: string | null; traffic: number | null };

/** All of one table's page facts, a part at a time. */
async function allPageFacts(ctx: ActionCtx, target: { websiteId: Id<"websites">; place: number }, of: "ranks" | "types"): Promise<PageFact[]> {
  const rows: PageFact[] = [];
  for (let cursor: string | null = null; ;) {
    // The website and its place alone: a build's target carries its brand words too, which the read's validator refuses.
    const part: { rows: PageFact[]; continueCursor: string; isDone: boolean } = await ctx.runQuery(internal.searchConsoleFacts.pageFactsPart, { websiteId: target.websiteId, place: target.place, of, cursor });
    rows.push(...part.rows);
    if (part.isDone) return rows;
    cursor = part.continueCursor;
  }
}

/**
 * Each page's facts from the website's own page facts read whole: the same answer `keyFacts` gives a page — its type by
 * its address, else as judged, else as ranked; its estimate as ranked — in two or three reads, however many pages.
 */
export async function pageFactsByRange(ctx: ActionCtx, target: { websiteId: Id<"websites">; place: number }, keys: readonly string[], want: FactsWanted): Promise<Facts> {
  const [ranks, types] = await Promise.all([
    want.number || want.kind ? allPageFacts(ctx, target, "ranks") : [],
    want.kind ? allPageFacts(ctx, target, "types") : [],
  ]);
  // The first of a page's rows, as an index read by its address finds it.
  const firstBy = (rows: PageFact[]) => {
    const by = new Map<string, PageFact>();
    for (const row of rows) if (!by.has(row.page)) by.set(row.page, row);
    return by;
  };
  const [ranked, judged] = [firstBy(ranks), firstBy(types)];
  const facts: Facts = new Map();
  for (const key of keys) {
    const path = pagePath(key);
    const rank = ranked.get(path);
    const type = want.kind ? (pageTypeByAddress(path) ?? judged.get(path)?.pageType ?? rank?.pageType ?? "UNJUDGED") : "UNJUDGED";
    facts.set(key, { kind: type, number: want.number ? (rank?.traffic ?? UNKNOWN) : UNKNOWN });
  }
  return facts;
}

/**
 * A live list's rows with what Sites knows of them (`searchConsoleLiveList`), moved here from `searchConsoleLists.ts` as it
 * passed a thousand lines on 18 November 2026. The keys Sites' facts are looked up for: the rows with the most clicks, up
 * to the website's limit (`consoleLiveFactsRows`).
 */
export function factKeys(rows: readonly { key: string; clicks: number }[], most: number): string[] {
  return [...rows].sort((left, right) => right.clicks - left.clicks).slice(0, most).map((row) => row.key);
}

/**
 * A live list's rows with the facts its screen shows (`factsWanted`) — Sites' intent and searches a month, or page type
 * and estimated visits — beside the first few thousand. A fact not wanted is left as the row has it.
 */
export async function withFacts(
  ctx: ActionCtx,
  target: { websiteId: Id<"websites">; place: number },
  kind: "query" | "page",
  rows: PeriodRow[],
  most: number,
  want: FactsWanted = EVERY_FACT,
): Promise<PeriodRow[]> {
  const facts = await factsFor(ctx, target, kind, factKeys(rows, most), want);
  return rows.map((row) => {
    const known = facts.get(row.key);
    if (!known) return row;
    return { ...row, ...(want.kind ? { kind: known.kind } : {}), ...(want.number ? (kind === "query" ? { volume: known.number } : { estimate: known.number }) : {}) };
  });
}

/** The same, on rows a page's rule has listed: so a rule that keeps few rows looks up few. */
export async function withListFacts(
  ctx: ActionCtx,
  target: { websiteId: Id<"websites">; place: number },
  kind: "query" | "page",
  rows: ListRow[],
  most: number,
  want: FactsWanted = EVERY_FACT,
): Promise<ListRow[]> {
  return withFactsKnown(rows, await factsFor(ctx, target, kind, factKeys(rows, most), want), kind, want);
}

/** Listed rows with facts looked up already: a live list's "all" rule lists every row Google answered, so its facts are asked as soon as the answer is in. */
export function withFactsKnown(rows: ListRow[], facts: Facts, kind: "query" | "page", want: FactsWanted): ListRow[] {
  return rows.map((row) => {
    const known = facts.get(row.key);
    if (!known) return row;
    const number = known.number === UNKNOWN ? null : known.number;
    return { ...row, ...(want.kind ? { kind: known.kind } : {}), ...(want.number ? (kind === "query" ? { volume: number } : { estimate: number }) : {}) };
  });
}
