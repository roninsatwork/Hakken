import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { holdFor } from "./assistantReads";
import { hakkenTaskTargetValidator } from "./hakkenTaskSchema";
import { readCreditPrice } from "./creditLedger";
import { readFanOutLimits } from "./fanOutLimits";
import { holdQuestions, holdSearches } from "./holdLists";
import { creditsForUnits } from "./creditKinds";
import { readMentions } from "./siteAi";
import { listPlace } from "./siteListAi";
import { newestPoints } from "./positionHistory";
import type { Stance } from "./utils/hakkenWatches";

/**
 * What an alert on AI answers or Google rankings reads (docs/plans/active/
 * hakken-tasks-plan.md, item 4.3): one of the company's tracked questions or
 * searches found from a person's words, an engine's newest answer to it, and
 * a search's newest position. One it does not track yet can be added on the
 * alert's yes — anyone in the company may (Anthony, 2026-10-07), within the
 * website's limit — so it comes back with what each check would cost, in
 * credits at today's prices; adding it is the yes's (`hakkenTasks.answerProposal`).
 */

const MOST_TRACKED = 500;

/** The same words, as people mean them: case, spaces and quotation marks aside. */
const plain = (text: string) => text.toLowerCase().replace(/[“”"'‘’?]/g, "").replace(/\s+/g, " ").trim();

type Tracked =
  | { ok: true; target: { companyWebsiteId: Id<"companyWebsites">; website: string }; text: string; engines?: string[]; adds?: { credits: number } }
  | { ok: false; problem: string };

const trackedValidator = v.union(
  v.object({
    ok: v.literal(true), target: hakkenTaskTargetValidator, text: v.string(), engines: v.optional(v.array(v.string())),
    /** Not tracked yet: added on the yes, at about these credits each time it is checked. */
    adds: v.optional(v.object({ credits: v.number() })),
  }),
  v.object({ ok: v.literal(false), problem: v.string() }),
);

/** A Google check reads about a hundred results: what one costs at the rankings price. */
const RESULTS_PER_CHECK = 100;

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
    if (match) return { ok: true, target: { companyWebsiteId: hold._id, website }, text: match.prompt, engines: match.engines };
    // Not tracked yet: it can be added on the yes, asked of the alert's engine alone.
    const { promptsPerSite } = await readFanOutLimits(ctx, hold.companyId, hold._id);
    if ((await holdQuestions(ctx, hold._id, MOST_TRACKED)).length >= promptsPerSite) {
      return { ok: false, problem: `${website} already tracks its most questions (${promptsPerSite}), its limit, so a new one can't be added. Its tracked questions are: ${questions.slice(0, 12).map((question) => `“${question.prompt}”`).join(", ")}.` };
    }
    const price = await readCreditPrice(ctx, "aiAnswers");
    return { ok: true, target: { companyWebsiteId: hold._id, website }, text: args.question.trim().replace(/^[“"]|[”"]$/g, ""), adds: { credits: creditsForUnits(price, 1) } };
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
    if (match) return { ok: true, target: { companyWebsiteId: hold._id, website }, text: match.keyword };
    // Not tracked yet: it can be added on the yes.
    const { trackedPerSite } = await readFanOutLimits(ctx, hold.companyId, hold._id);
    if ((await holdSearches(ctx, hold._id, MOST_TRACKED)).length >= trackedPerSite) {
      return { ok: false, problem: `${website} already tracks its most Google searches (${trackedPerSite}), its limit, so a new one can't be added.` };
    }
    const price = await readCreditPrice(ctx, "rankings");
    return { ok: true, target: { companyWebsiteId: hold._id, website }, text: args.search.trim().toLowerCase(), adds: { credits: creditsForUnits(price, RESULTS_PER_CHECK) } };
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
    const [newest] = await newestPoints(ctx, { websiteId: hold.websiteId, keyword: args.keyword, locationCode: listPlace(hold) }, 1);
    return newest ? { day: newest.day, position: newest.position } : null;
  },
});
