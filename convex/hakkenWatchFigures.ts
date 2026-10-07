import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { holdFor } from "./assistantReads";
import { hakkenTaskTargetValidator } from "./hakkenTaskSchema";
import { holdQuestions, holdSearches } from "./holdLists";
import { readMentions } from "./siteAi";
import { listPlace } from "./siteListAi";
import type { Stance } from "./utils/hakkenWatches";

/**
 * What an alert on AI answers or Google rankings reads (docs/plans/active/
 * hakken-tasks-plan.md, item 4.3): one of the company's tracked questions or
 * searches found from a person's words, an engine's newest answer to it, and
 * a search's newest position. Only what the company tracks: watching a
 * question or search it does not track would spend, so it is not done here.
 */

const MOST_TRACKED = 500;

/** The same words, as people mean them: case, spaces and quotation marks aside. */
const plain = (text: string) => text.toLowerCase().replace(/[“”"'‘’?]/g, "").replace(/\s+/g, " ").trim();

type Tracked = { ok: true; target: { companyWebsiteId: Id<"companyWebsites">; website: string }; text: string; engines?: string[] } | { ok: false; problem: string };

const trackedValidator = v.union(
  v.object({ ok: v.literal(true), target: hakkenTaskTargetValidator, text: v.string(), engines: v.optional(v.array(v.string())) }),
  v.object({ ok: v.literal(false), problem: v.string() }),
);

/** One of the company's tracked questions about a website, from the words a person used for it. */
export const trackedQuestionInternal = internalQuery({
  args: { companyId: v.id("companies"), website: v.string(), question: v.string() },
  returns: trackedValidator,
  handler: async (ctx, args): Promise<Tracked> => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false, problem: found.problem ?? `${args.website} isn't one of this company's websites.` };
    const hold = found.held.hold;
    const website = found.held.summary.host;
    const questions = await holdQuestions(ctx, hold._id, MOST_TRACKED, { activeOnly: true });
    const wanted = plain(args.question);
    const match = questions.find((question) => plain(question.prompt) === wanted) ?? questions.find((question) => plain(question.prompt).includes(wanted) || wanted.includes(plain(question.prompt)));
    if (!match) {
      return {
        ok: false,
        problem: `“${args.question}” isn't one of ${website}'s tracked questions, and alerts on AI answers watch tracked questions only. Its tracked questions are: ${questions.slice(0, 12).map((question) => `“${question.prompt}”`).join(", ") || "none yet"}.`,
      };
    }
    return { ok: true, target: { companyWebsiteId: hold._id, website }, text: match.prompt, engines: match.engines };
  },
});

/** One of the company's tracked Google searches for a website, from the words a person used for it. */
export const trackedSearchInternal = internalQuery({
  args: { companyId: v.id("companies"), website: v.string(), search: v.string() },
  returns: trackedValidator,
  handler: async (ctx, args): Promise<Tracked> => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false, problem: found.problem ?? `${args.website} isn't one of this company's websites.` };
    const hold = found.held.hold;
    const website = found.held.summary.host;
    const searches = await holdSearches(ctx, hold._id, MOST_TRACKED, { activeOnly: true });
    const wanted = plain(args.search);
    const match = searches.find((search) => plain(search.keyword) === wanted) ?? searches.find((search) => plain(search.keyword).includes(wanted));
    if (!match) {
      return {
        ok: false,
        problem: `“${args.search}” isn't one of ${website}'s tracked Google searches, and ranking alerts watch tracked searches only. Some of its tracked searches: ${searches.slice(0, 12).map((search) => `“${search.keyword}”`).join(", ") || "none yet"}.`,
      };
    }
    return { ok: true, target: { companyWebsiteId: hold._id, website }, text: match.keyword };
  },
});

/** An engine's newest answer to one of the company's tracked questions, and how it treated the website; null before one has answered. */
export const answerNowInternal = internalQuery({
  args: { companyId: v.id("companies"), companyWebsiteId: v.id("companyWebsites"), prompt: v.string(), engine: v.string() },
  returns: v.union(v.null(), v.object({ day: v.string(), stance: v.union(v.literal("RECOMMENDED"), v.literal("NAMED"), v.literal("WARNED_AGAINST"), v.literal("NOT_NAMED")) })),
  handler: async (ctx, args): Promise<{ day: string; stance: Stance } | null> => {
    const rows = await readMentions({ db: ctx.db, companyId: args.companyId }, args.companyWebsiteId);
    const row = rows.find((entry) => entry.prompt === args.prompt && entry.engine === args.engine);
    return row?.lastAskedDay && row.lastStance ? { day: row.lastAskedDay, stance: row.lastStance } : null;
  },
});

/** A tracked search's newest Google position for the website, from where its list is checked; null before it has been checked. */
export const rankingNowInternal = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), keyword: v.string() },
  returns: v.union(v.null(), v.object({ day: v.string(), position: v.union(v.number(), v.null()) })),
  handler: async (ctx, args): Promise<{ day: string; position: number | null } | null> => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) return null;
    const newest = await ctx.db
      .query("seoKeywordPositions")
      .withIndex("by_website_keyword_place_day", (q) => q.eq("websiteId", hold.websiteId).eq("keyword", args.keyword).eq("locationCode", listPlace(hold)))
      .order("desc")
      .first();
    return newest ? { day: newest.day, position: newest.position ?? null } : null;
  },
});
