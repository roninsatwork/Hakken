import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { prepareDecisions, runDecisions, type DecisionResult } from "./decisionActions";
import { pageVerdictValidator } from "./fanOutSchema";
import { wordsThatMatter } from "./utils/fanOutAngle";
import { isTrackedHold } from "./utils/websitePairing";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { readFanOutLimits } from "./fanOutLimits";

/**
 * Which of a site's own pages answers each angle (docs/plans/active/
 * fan-out-angles-plan.md, FA4) — or none, which is the missing angle.
 *
 * Asked of the `seo.angle-page` Decision, one angle per request as every SEO
 * judgment is (`askEach` in `seoJudgments.ts` says why). The pages offered are
 * the site's that share the most words with the search: the pages the site
 * audit read and the pages Google ranks the site with, each by its address and
 * the searches it ranks for — never its title, since no page text is kept or
 * sent to a model (`dataForSeoParsers.ts`). A page that shares no word with a
 * search is not offered for it; the screen says what "None" was judged against.
 *
 * An angle is judged once per site, and again when the site audit reads the
 * site afresh (`pagesStamp`). Like every Decision it ships switched off: off,
 * nothing is asked, Your page reads "not judged yet" and no missing angle is
 * suggested.
 */

const DECISION = "seo.angle-page";

/*
 * How many angles a run asks about, how many one collection judges, how many
 * pages are offered for each and how many of the site's pages are read to
 * offer from are the company's choices (`fanOutLimits.ts`).
 */

/** Requests in flight at once. */
const ANGLE_JUDGMENTS_AT_ONCE = 8;

/** The labels the pages offered for one angle wear: at most this many are offered. */
const PAGE_SLOTS = ["page-a", "page-b", "page-c", "page-d", "page-e", "page-f", "page-g", "page-h", "page-i", "page-j", "page-k", "page-l"] as const;
export const PAGES_OFFERED = PAGE_SLOTS.length;

/** Searches named beside a ranking page. */
const SEARCHES_PER_OFFERED_PAGE = 3;

/** Other wordings named with the search. */
const OTHER_WORDINGS_NAMED = 5;

type Verdict = "ANSWERED" | "NONE" | "OFF_TOPIC" | "UNSURE";
type SitePage = { page: string; url: string; ranked: boolean; keywords: number; words: string[]; topKeyword: string | null };
type Judged = { angle: string; verdict: Verdict; page?: string; url?: string; certainty?: "SURE" | "FAIRLY_SURE" | "NOT_SURE" };

export const judgeHoldPages = internalAction({
  args: { holdId: v.id("companyWebsites"), runsLeft: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const work: AnglesToJudge = await ctx.runQuery(internal.fanOutPageJudge.anglesToJudge, { holdId: args.holdId });
    const deriveMoves = () => ctx.scheduler.runAfter(0, internal.websiteMoves.deriveSiteMoves, { companyWebsiteId: args.holdId });
    if (!work) return null;
    // Its mode and model looked up once for every angle, not again on each.
    const prepared = await prepareDecisions(ctx, { keys: [DECISION], companyId: work.companyId });
    if (prepared.modes[DECISION] === "OFF" || work.angles.length === 0) {
      await deriveMoves();
      return null;
    }

    const [business, pages] = await Promise.all([
      // The company's own account of its business (company-level-website-facts-plan.md, CL4).
      ctx.runQuery(internal.holdProfiles.describeHoldForJudgingInternal, { companyWebsiteId: args.holdId }),
      ctx.runQuery(internal.fanOutPageJudge.pagesToOffer, { holdId: args.holdId }),
    ]);

    const judged: Judged[] = [];
    for (let start = 0; start < work.angles.length; start += ANGLE_JUDGMENTS_AT_ONCE) {
      const batch = work.angles.slice(start, start + ANGLE_JUDGMENTS_AT_ONCE).map((angle) => ({
        angle,
        offered: offeredPages(angle.words, pages.pages, work.pagesOffered),
      }));
      const searches: Record<string, string[]> = await ctx.runQuery(internal.fanOutPageJudge.pageSearches, {
        websiteId: work.websiteId,
        locationCode: work.locationCode,
        pages: [...new Set(batch.flatMap((entry) => entry.offered.filter((page) => page.ranked).map((page) => page.page)))],
      });
      await Promise.all(batch.map(async ({ angle, offered }) => {
        let result: DecisionResult | undefined;
        try {
          result = (await runDecisions(ctx, {
            companyId: work.companyId,
            prepared,
            subject: { kind: "seo-angles", id: args.holdId },
            state: {
              business: {
                address: work.host,
                ...(business?.sector ? { sells: business.sector } : {}),
                ...(business?.does ? { does: business.does } : {}),
              },
              search: { text: angle.text, otherWordings: angle.otherWordings, question: angle.prompt },
              pages: Object.fromEntries(offered.map((page, index) => [PAGE_SLOTS[index], {
                address: page.page,
                ...(searches[page.page]?.length ? { ranksFor: searches[page.page] } : {}),
              }])),
            },
            requests: [{
              key: DECISION,
              // Before this Decision nothing was judged: "cannot tell".
              fallback: () => ({ kind: "pick-one" as const, choice: "other" }),
            }],
          }))[DECISION];
        } catch {
          // One angle left unjudged; the rest are still asked about.
          return;
        }
        if (!result || result.source === "RULES" || result.answer.kind !== "pick-one") return;
        judged.push(verdictOf(angle.angle, result.answer.choice, offered, result.certainty ?? undefined));
      }));
    }

    // Nothing reached a model: the provider is down. The next collection tries again.
    if (judged.length === 0) {
      await deriveMoves();
      return null;
    }
    await ctx.runMutation(internal.fanOutPageJudge.writeJudgments, { holdId: args.holdId, pagesStamp: work.pagesStamp, judged });

    // As many runs as the collection's share takes, one of them this.
    const runsLeft = (args.runsLeft ?? Math.ceil(work.perCollection / work.perRun)) - 1;
    if (work.angles.length === work.perRun && runsLeft > 0) {
      await ctx.scheduler.runAfter(0, internal.fanOutPageJudge.judgeHoldPages, { holdId: args.holdId, runsLeft });
    } else {
      await deriveMoves();
    }
    return null;
  },
});

/** What the judge's choice means: a page offered, none, off topic, or cannot tell. */
export function verdictOf(
  angle: string,
  choice: string,
  offered: ReadonlyArray<{ page: string; url: string }>,
  certainty?: "SURE" | "FAIRLY_SURE" | "NOT_SURE",
): Judged {
  const sure = certainty ? { certainty } : {};
  if (choice === "none") return { angle, verdict: "NONE", ...sure };
  if (choice === "off-topic") return { angle, verdict: "OFF_TOPIC", ...sure };
  const slot = (PAGE_SLOTS as readonly string[]).indexOf(choice);
  // A label past the pages offered is no page at all: cannot tell.
  const page = slot >= 0 ? offered[slot] : undefined;
  if (!page) return { angle, verdict: "UNSURE", ...sure };
  return { angle, verdict: "ANSWERED", page: page.page, url: page.url, ...sure };
}

/**
 * The pages offered for one angle: those sharing the most of its words, pages
 * Google ranks first among equals, then the busier, then the shorter address.
 */
export function offeredPages(angleWords: readonly string[], pages: readonly SitePage[], count: number = PAGES_OFFERED): SitePage[] {
  const wanted = new Set(angleWords);
  return pages
    .map((page) => ({ page, shared: new Set(page.words.filter((word) => wanted.has(word))).size }))
    .filter((entry) => entry.shared > 0)
    .sort((left, right) =>
      right.shared - left.shared
      || Number(right.page.ranked) - Number(left.page.ranked)
      || right.page.keywords - left.page.keywords
      || left.page.page.length - right.page.page.length
      || left.page.page.localeCompare(right.page.page))
    .slice(0, Math.min(count, PAGES_OFFERED))
    .map((entry) => entry.page);
}

/** The site's pages as they stand for judging: the newest site audit's, else this month's. */
function pagesStampOf(crawlPullId: Id<"seoDataPulls"> | null, now: number): string {
  return crawlPullId ? `crawl:${crawlPullId}` : `month:${new Date(now).toISOString().slice(0, 7)}`;
}

const anglesToJudgeValidator = v.union(v.null(), v.object({
  companyId: v.id("companies"),
  websiteId: v.id("websites"),
  host: v.string(),
  locationCode: v.number(),
  pagesStamp: v.string(),
  perRun: v.number(),
  perCollection: v.number(),
  pagesOffered: v.number(),
  angles: v.array(v.object({
    angle: v.string(),
    text: v.string(),
    otherWordings: v.array(v.string()),
    prompt: v.string(),
    words: v.array(v.string()),
  })),
}));

type AnglesToJudge = typeof anglesToJudgeValidator.type;

/** The angles not yet judged against the site's pages as they stand, most seen first. */
export const anglesToJudge = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: anglesToJudgeValidator,
  handler: async (ctx, args): Promise<AnglesToJudge> => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold || isTrackedHold(hold)) return null;
    const website = await ctx.db.get(hold.websiteId);
    if (!website) return null;
    const crawl = await ctx.db
      .query("siteCrawls")
      .withIndex("by_site_day", (q) => q.eq("websiteId", hold.websiteId))
      .order("desc")
      .first();
    const pagesStamp = pagesStampOf(crawl?.pullId ?? null, Date.now());
    const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);

    const rows = await ctx.db
      .query("fanOutAngles")
      .withIndex("by_hold_seen", (q) => q.eq("holdId", args.holdId))
      .order("desc")
      // The angles the Sites page shows, most seen first: the only ones worth judging.
      .take(limits.anglesShown);
    const seen = new Set<string>();
    const angles: NonNullable<AnglesToJudge>["angles"] = [];
    for (const row of rows) {
      // One angle from two questions is one judgment.
      if (seen.has(row.angle)) continue;
      seen.add(row.angle);
      const held = await ctx.db
        .query("fanOutPageJudgments")
        .withIndex("by_hold_angle", (q) => q.eq("holdId", args.holdId).eq("angle", row.angle))
        .unique();
      if (held && held.pagesStamp === pagesStamp) continue;
      angles.push({
        angle: row.angle,
        text: row.wordings[0]?.queryText ?? row.angle,
        otherWordings: row.wordings.slice(1, 1 + OTHER_WORDINGS_NAMED).map((wording) => wording.queryText),
        prompt: row.prompt,
        words: [...new Set(row.wordings.flatMap((wording) => wordsThatMatter(wording.query)))],
      });
      if (angles.length >= limits.anglesJudgedPerRun) break;
    }
    return {
      companyId: hold.companyId,
      websiteId: hold.websiteId,
      host: website.displayHost,
      locationCode: hold.locationCode ?? DEFAULT_LOCATION_CODE,
      pagesStamp,
      perRun: limits.anglesJudgedPerRun,
      perCollection: limits.anglesJudgedPerCollection,
      pagesOffered: limits.pagesOffered,
      angles,
    };
  },
});

/**
 * The site's pages to offer: every page the newest site audit read that
 * answered, and every page Google ranks the site with, each with the words of
 * its address and of the search it ranks for most.
 */
export const pagesToOffer = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.object({
    pages: v.array(v.object({
      page: v.string(),
      url: v.string(),
      ranked: v.boolean(),
      keywords: v.number(),
      words: v.array(v.string()),
      topKeyword: v.union(v.string(), v.null()),
    })),
    crawled: v.number(),
    ranked: v.number(),
    cut: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return { pages: [], crawled: 0, ranked: 0, cut: false };
    const locationCode = hold.locationCode ?? DEFAULT_LOCATION_CODE;
    const { auditPagesRead, rankedPagesRead } = await readFanOutLimits(ctx, hold.companyId, hold._id);
    const [crawledRows, rankedRows] = await Promise.all([
      ctx.db.query("siteCrawlPages").withIndex("by_site", (q) => q.eq("websiteId", hold.websiteId)).take(auditPagesRead + 1),
      ctx.db
        .query("sitePageRanks")
        .withIndex("by_site_keywords", (q) => q.eq("websiteId", hold.websiteId).eq("locationCode", locationCode))
        .order("desc")
        .take(rankedPagesRead + 1),
    ]);
    const byPage = new Map<string, SitePage>();
    for (const row of rankedRows.slice(0, rankedPagesRead)) {
      byPage.set(row.page, {
        page: row.page,
        url: row.url,
        ranked: true,
        keywords: row.keywords,
        words: [...new Set([...wordsThatMatter(row.page), ...wordsThatMatter(row.topKeyword)])],
        topKeyword: row.topKeyword || null,
      });
    }
    let crawled = 0;
    for (const row of crawledRows.slice(0, auditPagesRead)) {
      // A page that answered, not a redirect, a missing page or a file.
      const answered = (row.statusCode === undefined || row.statusCode === 200) && !row.redirectTo
        && (row.resourceType === undefined || row.resourceType === "html");
      if (!answered) continue;
      crawled += 1;
      if (byPage.has(row.page)) continue;
      byPage.set(row.page, { page: row.page, url: row.url, ranked: false, keywords: 0, words: wordsThatMatter(row.page), topKeyword: null });
    }
    return {
      pages: [...byPage.values()],
      crawled,
      ranked: Math.min(rankedRows.length, rankedPagesRead),
      cut: crawledRows.length > auditPagesRead || rankedRows.length > rankedPagesRead,
    };
  },
});

/** The searches each ranking page ranks best for, a few each, to name beside it. */
export const pageSearches = internalQuery({
  args: { websiteId: v.id("websites"), locationCode: v.number(), pages: v.array(v.string()) },
  returns: v.record(v.string(), v.array(v.string())),
  handler: async (ctx, args) => {
    const found: Record<string, string[]> = {};
    for (const page of args.pages) {
      const rows = await ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_page_band_position", (q) =>
          q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode).eq("page", page))
        .take(SEARCHES_PER_OFFERED_PAGE * 2);
      found[page] = rows.filter((row) => row.status !== "LOST").slice(0, SEARCHES_PER_OFFERED_PAGE).map((row) => row.keyword);
    }
    return found;
  },
});

export const writeJudgments = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    pagesStamp: v.string(),
    judged: v.array(v.object({
      angle: v.string(),
      verdict: pageVerdictValidator,
      page: v.optional(v.string()),
      url: v.optional(v.string()),
      certainty: v.optional(v.union(v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"))),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const entry of args.judged) {
      const held = await ctx.db
        .query("fanOutPageJudgments")
        .withIndex("by_hold_angle", (q) => q.eq("holdId", args.holdId).eq("angle", entry.angle))
        .unique();
      const fields = {
        verdict: entry.verdict,
        page: entry.page,
        url: entry.url,
        certainty: entry.certainty,
        pagesStamp: args.pagesStamp,
        judgedAt: now,
      };
      if (held) await ctx.db.patch(held._id, fields);
      else await ctx.db.insert("fanOutPageJudgments", { holdId: args.holdId, angle: entry.angle, ...fields });
    }
    return null;
  },
});
