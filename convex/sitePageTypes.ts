import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { runDecisions, type DecisionResult } from "./decisionActions";
import { pageTypeValidator, type PageType } from "./utils/siteShapes";
import { pagesCopyKey, requestListCopy } from "./siteListCopies";

/**
 * What kind of page each ranking page is, for the Sites Top pages report
 * (docs/plans/active/user-sites-plan.md, Phase 2, 🤖 judged).
 *
 * The address settles most pages for free — the home page, `/contact/`,
 * anything under `/blog/` (`pageTypeByAddress`). The rest are asked of the
 * `seo.page-type` Decision — from the address and the search that brings the
 * page the most visits, never its title (no page text is kept or sent to a
 * model; see `dataForSeoParsers.ts`) — one page per request as every SEO judgment is
 * (see `askEach` in `seoJudgments.ts` for why), most-visited pages first, and
 * the answer is kept by website and path (`sitePageTypes`) so a page is asked
 * about once, however often its rankings are rebuilt.
 *
 * Like every Decision it ships switched off. Off, this does nothing and the
 * pages the address cannot place show as "not sorted yet".
 */

const DECISION = "seo.page-type";

/** Pages asked about per run. */
const PAGES_PER_RUN = 40;

/** Runs one rebuild may chain, so a large site is worked through over a few rebuilds. */
const RUNS_PER_REBUILD = 25;

/** Requests in flight at once. */
const JUDGMENTS_AT_ONCE = 8;

/** Unsorted pages read to find the ones not yet asked about. */
const CANDIDATES_READ = 200;

const TYPE_BY_CHOICE: Record<string, PageType> = {
  home: "HOME",
  service: "SERVICE",
  product: "PRODUCT",
  category: "CATEGORY",
  article: "ARTICLE",
  "case-study": "CASE_STUDY",
  about: "ABOUT",
  contact: "CONTACT",
  location: "LOCATION",
  careers: "CAREERS",
  legal: "LEGAL",
  other: "OTHER",
};

const certaintyValidator = v.union(v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"));

export const judgePageTypes = internalAction({
  args: { websiteId: v.id("websites"), locationCode: v.number(), runsLeft: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const modes: Record<string, string> = await ctx.runQuery(internal.decisionRuns.resolveModesInternal, {
      decisionKeys: [DECISION],
    });
    if (modes[DECISION] === "OFF") return null;

    const work: { host: string; pages: Array<{ page: string; topKeyword: string }> } | null =
      await ctx.runQuery(internal.sitePageTypes.pagesToJudge, {
        websiteId: args.websiteId,
        locationCode: args.locationCode,
      });
    if (!work || work.pages.length === 0) return null;
    const business = await ctx.runQuery(internal.websiteCanonical.describeBusinessForJudging, {
      websiteId: args.websiteId,
    });

    const judged: Array<{ page: string; pageType: PageType; certainty?: "SURE" | "FAIRLY_SURE" | "NOT_SURE" }> = [];
    for (let start = 0; start < work.pages.length; start += JUDGMENTS_AT_ONCE) {
      await Promise.all(work.pages.slice(start, start + JUDGMENTS_AT_ONCE).map(async (page) => {
        let result: DecisionResult | undefined;
        try {
          result = (await runDecisions(ctx, {
            subject: { kind: "seo-pages", id: args.websiteId },
            state: {
              business: {
                address: work.host,
                ...(business?.sector ? { sells: business.sector } : {}),
                ...(business?.does ? { does: business.does } : {}),
              },
              page: { address: page.page, topSearch: page.topKeyword },
            },
            requests: [{
              key: DECISION,
              // Before this Decision a page the address could not place had no
              // type at all, so the rule it replaces is "cannot tell".
              fallback: () => ({ kind: "pick-one" as const, choice: "other" }),
            }],
          }))[DECISION];
        } catch {
          // One page left unsorted; the rest are still asked about.
          return;
        }
        if (!result || result.source === "RULES" || result.answer.kind !== "pick-one") return;
        judged.push({
          page: page.page,
          pageType: TYPE_BY_CHOICE[result.answer.choice] ?? "OTHER",
          ...(result.certainty ? { certainty: result.certainty } : {}),
        });
      }));
    }

    // Nothing reached a model: the provider is down. The next rebuild tries again.
    if (judged.length === 0) return null;
    await ctx.runMutation(internal.sitePageTypes.writePageTypes, {
      websiteId: args.websiteId,
      locationCode: args.locationCode,
      judged,
    });

    const runsLeft = (args.runsLeft ?? RUNS_PER_REBUILD) - 1;
    if (work.pages.length === PAGES_PER_RUN && runsLeft > 0) {
      await ctx.scheduler.runAfter(0, internal.sitePageTypes.judgePageTypes, {
        websiteId: args.websiteId,
        locationCode: args.locationCode,
        runsLeft,
      });
    }
    return null;
  },
});

/** The unsorted pages not yet asked about, most keywords first. */
export const pagesToJudge = internalQuery({
  args: { websiteId: v.id("websites"), locationCode: v.number() },
  returns: v.union(v.null(), v.object({
    host: v.string(),
    pages: v.array(v.object({ page: v.string(), topKeyword: v.string() })),
  })),
  handler: async (ctx, args) => {
    const website = await ctx.db.get(args.websiteId);
    if (!website) return null;
    const unsorted = await ctx.db
      .query("sitePageRanks")
      .withIndex("by_site_type_keywords", (q) =>
        q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode).eq("pageType", "UNJUDGED"))
      .order("desc")
      .take(CANDIDATES_READ);
    const pages = [];
    for (const row of unsorted) {
      const asked = await ctx.db
        .query("sitePageTypes")
        .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId).eq("page", row.page))
        .unique();
      if (asked) continue;
      pages.push({ page: row.page, topKeyword: row.topKeyword });
      if (pages.length >= PAGES_PER_RUN) break;
    }
    return { host: website.host, pages };
  },
});

/** Keep the answers, and label the pages' rows in this place straight away. */
export const writePageTypes = internalMutation({
  args: {
    websiteId: v.id("websites"),
    locationCode: v.number(),
    judged: v.array(v.object({ page: v.string(), pageType: pageTypeValidator, certainty: v.optional(certaintyValidator) })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const row of args.judged) {
      const existing = await ctx.db
        .query("sitePageTypes")
        .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId).eq("page", row.page))
        .unique();
      const fields = {
        websiteId: args.websiteId,
        page: row.page,
        pageType: row.pageType,
        ...(row.certainty ? { certainty: row.certainty } : {}),
        judgedAt: now,
      };
      if (existing) await ctx.db.replace(existing._id, fields);
      else await ctx.db.insert("sitePageTypes", fields);

      const ranked = await ctx.db
        .query("sitePageRanks")
        .withIndex("by_site_page", (q) =>
          q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode).eq("page", row.page))
        .unique();
      if (ranked && ranked.pageType === "UNJUDGED") await ctx.db.patch(ranked._id, { pageType: row.pageType });
    }
    // Top pages is filtered by type from its compact copy: rebuilt once the types land.
    if (args.judged.length > 0) await requestListCopy(ctx, "pages", pagesCopyKey(args.websiteId, args.locationCode));
    return null;
  },
});
