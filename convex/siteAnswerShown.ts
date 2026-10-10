import { v } from "convex/values";
import { seenValidator } from "./utils/hakkenSees";
import { answerSees } from "./sees/aiAnswers";
import type { Id } from "./_generated/dataModel";
import { aiCitationOperationId, AI_MODE_ENGINE, aiEngineValidator, answerPlace } from "./seoAiEngines";
import { listHold, requireMySite } from "./siteAccess";
import { holdBrandNames } from "./holdProfiles";
import { holdQuestion } from "./holdLists";
import { tenantQuery } from "./tenantFunctions";
import { answerById, answerIdValidator } from "./siteAnswers";
import { readSearchPhrase } from "./websiteCanonical";

/**
 * What an answer's own screen shows beside the words (docs/plans/active/
 * discovery-local-reputation-ai-plan.md, step 3, D5; drawn as "AI answers ·
 * one answer, five ways"): how the question was asked — through an app, a
 * model or Google AI Mode's page — the same question's answer from each
 * other assistant that day, to switch between, and what an app put on
 * screen: the businesses, the pages it read and the searches it ran, each
 * search with where the website ranks for it and whether it is tracked.
 *
 * Read only through a question on the site's own list, as `answerRecord` is.
 */
const askedAsValidator = v.union(v.literal("APP"), v.literal("MODEL"), v.literal("PAGE"));

export const answerShown = tenantQuery({
  args: { siteId: v.id("companyWebsites"), answerId: answerIdValidator },
  returns: v.union(v.null(), v.object({
    askedAs: askedAsValidator,
    /** The question's answer from each of its assistants on the same day: null where one gave none. */
    others: v.array(v.object({ engine: aiEngineValidator, answerId: v.union(v.id("aiAnswerTexts"), v.null()), askedAs: askedAsValidator })),
    /** Where the website came among those the answer named, and of how many. */
    named: v.object({ place: v.union(v.number(), v.null()), of: v.number() }),
    businesses: v.array(v.object({
      name: v.string(),
      host: v.union(v.string(), v.null()),
      rating: v.union(v.number(), v.null()),
      reviews: v.union(v.number(), v.null()),
      you: v.boolean(),
    })),
    read: v.array(v.object({ url: v.string(), host: v.string(), yours: v.boolean(), cited: v.boolean() })),
    searches: v.array(v.object({ query: v.string(), text: v.string(), position: v.union(v.number(), v.null()), tracked: v.boolean() })),
    seen: seenValidator,
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const found = await answerById(ctx, args.answerId);
    const row = found?.text ?? found?.answer;
    if (!found || !row) return null;
    const question = await holdQuestion(ctx, listHold(site), row.prompt);
    if (!question || !question.engines.includes(row.engine) || row.locationCode !== answerPlace(row.engine, site.place)) return null;

    const askedAsOf = async (pullId: Id<"seoDataPulls">) => {
      const operationId = (await ctx.db.get(pullId))?.operationId ?? "";
      return operationId.startsWith("ai_app_") ? "APP" as const : operationId === aiCitationOperationId(AI_MODE_ENGINE) ? "PAGE" as const : "MODEL" as const;
    };
    const askedAs = await askedAsOf(row.pullId);
    const others = [];
    for (const engine of question.engines) {
      const index = await ctx.db
        .query("aiAnswerIndex")
        .withIndex("by_question", (q) => q.eq("prompt", row.prompt).eq("engine", engine).eq("locationCode", answerPlace(engine, site.place)).eq("day", row.day))
        .first();
      others.push({ engine, answerId: (index?.textId ?? null) as Id<"aiAnswerTexts"> | null, askedAs: index ? await askedAsOf(index.pullId) : "MODEL" as const });
    }
    const websiteId = site.website._id;
    const named = found.answer?.named ?? [];
    const host = site.website.host;
    const ownHost = (candidate: string | null | undefined) => Boolean(candidate && (candidate === host || candidate.endsWith(`.${host}`)));
    const names = (await holdBrandNames(ctx, site.hold._id)).map((entry) => entry.name.toLowerCase());
    const extras = await ctx.db.query("aiAnswerExtras").withIndex("by_pull", (q) => q.eq("pullId", row.pullId)).first();
    const cited = new Set((found.text?.sources ?? []).map((url) => url.replace(/\/$/, "")));
    const hostOf = (url: string) => {
      try {
        return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        return url;
      }
    };
    const searches = [];
    for (const raw of extras?.searches ?? []) {
      const phrase = readSearchPhrase(raw);
      const [rank, tracked] = await Promise.all([
        ctx.db.query("siteKeywordRanks").withIndex("by_site_keyword", (q) => q.eq("websiteId", websiteId).eq("locationCode", site.place).eq("keyword", phrase.keyword)).first(),
        ctx.db.query("websiteKeywords").withIndex("by_hold_keyword", (q) => q.eq("companyWebsiteId", site.hold._id).eq("keyword", phrase.keyword)).first(),
      ]);
      searches.push({ query: phrase.keyword, text: phrase.text, position: rank?.position ?? null, tracked: tracked?.isActive === true });
    }
    const shown = {
      askedAs,
      others,
      named: { place: named.includes(websiteId) ? named.indexOf(websiteId) + 1 : null, of: named.length },
      businesses: (extras?.businesses ?? []).map((business) => ({
        name: business.name,
        host: business.host ?? null,
        rating: business.rating ?? null,
        reviews: business.reviews ?? null,
        you: ownHost(business.host) || names.some((name) => name.length > 2 && business.name.toLowerCase().includes(name)),
      })),
      read: (extras?.read ?? []).map((url) => ({ url, host: hostOf(url), yours: ownHost(hostOf(url)), cited: cited.has(url.replace(/\/$/, "")) })),
      searches,
    };
    return { ...shown, seen: answerSees(shown) };
  },
});
