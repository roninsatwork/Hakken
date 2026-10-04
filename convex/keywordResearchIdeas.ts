import { v } from "convex/values";
import { lookupIdeasShape } from "./keywordResearchShapes";
import { tenantMutation, tenantQuery, requireTenant } from "./tenantFunctions";
import { isOversightRole } from "./authz";
import { readFanOutLimits } from "./fanOutLimits";
import { freshnessOf, newestSerp } from "./keywordResearchData";
import { ownWebsites, partIsBuying, requireLookup, startResearchRun, watchedIn, type ResearchJob } from "./keywordResearch";
import { hostOf } from "./keywordResearchCalls";
import { findResearchCountry } from "./utils/researchCountries";

/**
 * Keyword ideas (board 5; docs/plans/active/keyword-research-plan.md):
 * terms match and questions, bought the first time Ideas is opened, and what
 * the top pages also rank for, bought with Google's results in full — as
 * many of each kind as the company's limit (Anthony: "100 each"). Each idea
 * shows where the website measured stands for it, from what Websites holds.
 */

const KINDS = ["TERMS", "QUESTIONS", "ALSO_RANK"] as const;
const kindValidator = v.union(v.literal("TERMS"), v.literal("QUESTIONS"), v.literal("ALSO_RANK"));

/** Ideas opened: what is not held and fresh is bought — the two kinds of idea, and the top ten in full for "also rank for". */
export const openIdeas = tenantMutation({
  args: { lookupId: v.id("keywordLookups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lookup = await requireLookup(ctx, args.lookupId);
    if (isOversightRole(ctx.user.role) || lookup.overview !== "READY") return null;
    if (lookup.ideas === "WAITING" && (await partIsBuying(ctx, lookup._id, "IDEAS"))) return null;
    // Google's results in full, being bought already, bring "also rank for" with them.
    const resultsBuying = lookup.results === "WAITING" && (await partIsBuying(ctx, lookup._id, "RESULTS"));
    const companyId = requireTenant(ctx);
    const limits = await readFanOutLimits(ctx, companyId);
    const fresh = freshnessOf(limits.researchReuseDays);
    const usable = (row: { boughtAt: number; sandbox: boolean; limit?: number } | null) =>
      Boolean(row && row.boughtAt >= fresh.since && (fresh.sandbox || !row.sandbox) && (row.limit ?? Infinity) >= limits.researchIdeasPerKind);
    const newest = async (kind: (typeof KINDS)[number]) => await ctx.db
      .query("researchIdeas")
      .withIndex("by_keyword_place_kind", (q) => q.eq("keyword", lookup.keyword).eq("locationCode", lookup.locationCode).eq("kind", kind))
      .order("desc")
      .first();
    const needIdeas = !(usable(await newest("TERMS")) && usable(await newest("QUESTIONS")));
    const serp = await newestSerp(ctx, lookup.keyword, lookup.locationCode);
    const needDetails = !resultsBuying
      && !(serp?.detailsBoughtAt && usable({ boughtAt: serp.detailsBoughtAt, sandbox: serp.sandbox }) && usable(await newest("ALSO_RANK")));
    if (!needIdeas && !needDetails) {
      await ctx.db.patch(lookup._id, { ideas: "READY", ...(serp?.detailsBoughtAt && !resultsBuying ? { results: "READY" as const } : {}) });
      return null;
    }
    const jobs: ResearchJob[] = [
      ...(needIdeas ? [{ lookup, part: "IDEAS" as const }] : []),
      ...(needDetails ? [{ lookup, part: "RESULTS" as const }] : []),
    ];
    await startResearchRun(ctx, companyId, `keyword ideas for "${lookup.text}"`, jobs);
    await ctx.db.patch(lookup._id, {
      ideas: needIdeas ? "WAITING" : "READY",
      ...(needDetails ? { results: "WAITING" as const } : {}),
      problem: undefined,
    });
    return null;
  },
});

/** One kind of idea for a lookup, with each idea's position for the website measured, and how many of each kind there are. */
export const lookupIdeas = tenantQuery({
  args: { lookupId: v.id("keywordLookups"), kind: kindValidator },
  returns: lookupIdeasShape,
  handler: async (ctx, args) => {
    const companyId = ctx.companyId;
    const lookup = await ctx.db.get(args.lookupId);
    if (!companyId || !lookup || lookup.companyId !== companyId) return null;
    const newest = async (kind: (typeof KINDS)[number]) => await ctx.db
      .query("researchIdeas")
      .withIndex("by_keyword_place_kind", (q) => q.eq("keyword", lookup.keyword).eq("locationCode", lookup.locationCode).eq("kind", kind))
      .order("desc")
      .first();
    const held = Object.fromEntries(await Promise.all(KINDS.map(async (kind) => [kind, await newest(kind)] as const)));
    const chosen = held[args.kind];
    const measured = lookup.companyWebsiteId ? (await ownWebsites(ctx, companyId)).find((row) => row.siteId === lookup.companyWebsiteId) ?? null : null;
    // Positions are the website's own, from where it is watched: none to show for a lookup in another country.
    const website = watchedIn(measured, lookup.locationCode) ? measured : null;
    const place = website?.place ?? lookup.locationCode;
    const rows = await Promise.all((chosen?.rows ?? []).map(async (row) => {
      const ranked = website
        ? await ctx.db.query("siteKeywordRanks").withIndex("by_site_keyword", (q) => q.eq("websiteId", website.websiteId).eq("locationCode", place).eq("keyword", row.keyword)).first()
        : null;
      return { ...row, position: ranked?.position ?? null, page: ranked?.url ?? null };
    }));
    return {
      lookupId: lookup._id,
      keyword: lookup.text,
      country: findResearchCountry(lookup.locationCode)?.label ?? "",
      host: website ? hostOf(website.host) : null,
      siteId: website?.siteId ?? null,
      kind: args.kind,
      state: args.kind === "ALSO_RANK" ? lookup.results ?? null : lookup.ideas ?? null,
      problem: lookup.problem ?? null,
      boughtAt: chosen?.boughtAt ?? null,
      sample: Boolean(chosen?.sandbox),
      counts: Object.fromEntries(KINDS.map((kind) => [kind, held[kind] ? held[kind]!.total ?? held[kind]!.rows.length : null])) as Record<(typeof KINDS)[number], number | null>,
      rows,
    };
  },
});
