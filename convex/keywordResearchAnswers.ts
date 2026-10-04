import { v } from "convex/values";
import { lookupAnswersShape } from "./keywordResearchShapes";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireTenant, tenantMutation, tenantQuery } from "./tenantFunctions";
import { isOversightRole } from "./authz";
import { readFanOutLimits } from "./fanOutLimits";
import { companyHolds } from "./siteAccess";
import { freshnessOf } from "./keywordResearchData";
import { ownWebsites, partIsBuying, requireLookup, startResearchRun, watchedIn } from "./keywordResearch";
import { findResearchCountry } from "./utils/researchCountries";
import { researchProblemOf } from "./utils/researchProblems";

/**
 * What the AI says (board 4; docs/plans/active/keyword-research-plan.md): the
 * question behind a keyword asked of four AI assistants, who each names, and
 * whether the website measured is one of them; and the searches Google ran to
 * write its AI Overview, with the website's page for each where it ranks.
 * Bought the first time it is opened (about 20 cents: the four answers and
 * the AI Overview's searches), and again on Ask again.
 */

async function newestAnswers(ctx: { db: QueryCtx["db"] }, keyword: string, locationCode: number): Promise<Doc<"researchAnswers"> | null> {
  return await ctx.db
    .query("researchAnswers")
    .withIndex("by_keyword_place", (q) => q.eq("keyword", keyword).eq("locationCode", locationCode))
    .order("desc")
    .first();
}

/** What the AI says opened: bought the first time, and again once older than the company's days. Ask again buys afresh. */
export const openAnswers = tenantMutation({
  args: { lookupId: v.id("keywordLookups"), again: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lookup = await requireLookup(ctx, args.lookupId);
    if (isOversightRole(ctx.user.role) || lookup.overview !== "READY") return null;
    if (lookup.answers === "WAITING" && (await partIsBuying(ctx, lookup._id, "ANSWERS"))) return null;
    const companyId = requireTenant(ctx);
    if (!args.again) {
      const limits = await readFanOutLimits(ctx, companyId);
      const fresh = freshnessOf(limits.researchReuseDays);
      const held = await newestAnswers(ctx, lookup.keyword, lookup.locationCode);
      if (held && held.boughtAt >= fresh.since && (fresh.sandbox || !held.sandbox)) {
        if (lookup.answers !== "READY") await ctx.db.patch(lookup._id, { answers: "READY" });
        return null;
      }
    }
    await startResearchRun(ctx, companyId, `what the AI says about "${lookup.text}"`, [{ lookup, part: "ANSWERS", again: args.again === true }]);
    await ctx.db.patch(lookup._id, { answers: "WAITING", problem: undefined });
    return null;
  },
});

type Who = "YOU" | "RIVAL" | null;

/** Board 4: the question, each assistant's answer with who it names, the figures across the four, and Google's AI Overview searches. */
export const lookupAnswers = tenantQuery({
  args: { lookupId: v.id("keywordLookups") },
  returns: lookupAnswersShape,
  handler: async (ctx, args) => {
    const companyId = ctx.companyId;
    const lookup = await ctx.db.get(args.lookupId);
    if (!companyId || !lookup || lookup.companyId !== companyId) return null;
    const [held, websites, holds] = await Promise.all([
      newestAnswers(ctx, lookup.keyword, lookup.locationCode),
      ownWebsites(ctx, companyId),
      companyHolds(ctx, companyId),
    ]);
    const website = lookup.companyWebsiteId ? websites.find((row) => row.siteId === lookup.companyWebsiteId) ?? null : null;
    const rivals = website ? holds.filter((row) => row.summary.relationship === "TRACKED" && row.summary.ofSiteId === website.siteId) : [];
    const rivalIds = new Set<Id<"websites">>(rivals.map((row) => row.website._id));
    const hostOfWebsite = new Map<Id<"websites">, string>([
      ...(website ? [[website.websiteId, website.host] as const] : []),
      ...rivals.map((row) => [row.website._id, row.website.displayHost] as const),
    ]);
    const whoOf = (websiteId: Id<"websites">): Who => (website && websiteId === website.websiteId ? "YOU" : rivalIds.has(websiteId) ? "RIVAL" : null);
    const ownHost = website?.host.toLowerCase().replace(/^www\./, "") ?? null;

    const engines = (held?.engines ?? []).map((engine) => {
      const named = engine.named.map((entry) => ({ host: hostOfWebsite.get(entry.websiteId) ?? entry.host, who: whoOf(entry.websiteId) }));
      const yourPlace = named.findIndex((entry) => entry.who === "YOU");
      return {
        engine: engine.engine,
        answered: engine.answered,
        answer: engine.answer,
        named,
        /** Where the website comes among the businesses this answer names, or null. */
        yourPlace: yourPlace >= 0 ? yourPlace + 1 : null,
        rivalsNamed: named.filter((entry) => entry.who === "RIVAL").map((entry) => entry.host),
        cited: engine.cited,
        citedYours: ownHost ? engine.cited.filter((source) => source.host === ownHost).length : 0,
      };
    });
    const answered = engines.filter((engine) => engine.answered);
    const namedBy = new Map<string, { host: string; who: Who; count: number }>();
    for (const engine of answered) {
      for (const entry of new Map(engine.named.map((named) => [named.host, named])).values()) {
        const row = namedBy.get(entry.host) ?? { host: entry.host, who: entry.who, count: 0 };
        row.count += 1;
        namedBy.set(entry.host, row);
      }
    }
    const mostNamed = [...namedBy.values()].sort((left, right) => right.count - left.count || left.host.localeCompare(right.host));
    const rivalMost = mostNamed.find((row) => row.who === "RIVAL") ?? null;

    // The website's page for each AI Overview search, where it ranks for that search, from what Websites holds.
    const searches = await Promise.all((held?.overviewSearches ?? []).map(async (search) => {
      // The website's positions are from where it is watched: none for a lookup in another country.
      const ranked = website && watchedIn(website, lookup.locationCode)
        ? await ctx.db.query("siteKeywordRanks").withIndex("by_site_keyword", (q) => q.eq("websiteId", website.websiteId).eq("locationCode", website.place ?? lookup.locationCode).eq("keyword", search.query.toLowerCase())).first()
        : null;
      return { query: search.query, times: search.times, page: ranked?.url ?? null };
    }));

    return {
      lookupId: lookup._id,
      keyword: lookup.text,
      country: findResearchCountry(lookup.locationCode)?.label ?? "",
      host: website?.host ?? null,
      state: lookup.answers ?? null,
      problem: researchProblemOf(lookup.problem),
      askedAt: held?.boughtAt ?? null,
      sample: Boolean(held?.sandbox),
      question: held?.question ?? null,
      figures: held
        ? {
            answered: answered.length,
            nameYou: answered.filter((engine) => engine.yourPlace !== null).length,
            nameARival: answered.filter((engine) => engine.rivalsNamed.length > 0).length,
            rivalMost: rivalMost?.host ?? null,
            businessesNamed: namedBy.size,
            pagesCited: answered.reduce((sum, engine) => sum + engine.cited.length, 0),
            pagesCitedYours: answered.reduce((sum, engine) => sum + engine.citedYours, 0),
          }
        : null,
      engines,
      mostNamed,
      searches,
      canAsk: !isOversightRole(ctx.user.role),
    };
  },
});
