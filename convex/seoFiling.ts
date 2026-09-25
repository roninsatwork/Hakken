import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { judgeNewKeywords } from "./seoJudgments";
import { getErrorMessage } from "./utils/lang";

/**
 * Filing's safety net (collection reliability plan, 1.11, 2026-09-25): each
 * answer is marked when it is filed, a filing that lost a clash is filed again
 * shortly, the hourly check files again any answer recorded and never filed
 * (`seoCollectionSweep.ts`), and keyword judging runs on its own after the
 * filing, so a judging failure never marks filed data as failed. The filing
 * itself is `seoCollectionParse.ts`.
 */

/** How a filing failure is written on its request, and recognised again. */
export const PARSE_FAILED = "Parse failed:";

/** A filing begins: counted, and whatever the last try said cleared, so this one's outcome is its own. */
export const startFiling = internalMutation({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pull = await ctx.db.get(args.pullId);
    if (!pull) return null;
    await ctx.db.patch(args.pullId, {
      fileAttempts: (pull.fileAttempts ?? 0) + 1,
      ...(pull.error?.startsWith(PARSE_FAILED) ? { error: undefined } : {}),
    });
    return null;
  },
});

/**
 * A filing ends. Filed, it is marked so: the hourly check re-files an answer
 * recorded and never marked (collection reliability plan, 1.11 — before, a
 * filing that failed for any reason but a clash was left half-done, and
 * nothing looked for it again). Failed on a clash, it is tried again shortly.
 */
export const finishFiling = internalMutation({
  args: { pullId: v.id("seoDataPulls"), retry: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pull = await ctx.db.get(args.pullId);
    if (!pull) return null;
    if (!pull.error?.startsWith(PARSE_FAILED)) {
      await ctx.db.patch(args.pullId, { filedAt: Date.now() });
      return null;
    }
    if (!CLASH.test(pull.error) || args.retry >= REFILE_TRIES) return null;
    const wait = 20_000 + Math.floor(Math.random() * 40_000);
    await ctx.scheduler.runAfter(wait, internal.seoCollectionParse.parseSeoResult, { pullId: args.pullId, retry: args.retry + 1 });
    return null;
  },
});

/**
 * Judge the searches a filed answer brought — after the filing, on its own.
 * Inside the filing's error handling, a judging call that failed marked
 * correctly filed data "Parse failed", and a clash there filed the whole
 * answer again (collection reliability plan, 1.11). Only searches never judged
 * are asked about, so a second run costs nothing twice.
 */
export const judgeKeywordsLater = internalAction({
  args: {
    pullId: v.id("seoDataPulls"),
    companyId: v.optional(v.id("companies")),
    host: v.optional(v.string()),
    /** The site the searches came from, so "irrelevant to this business" can be judged. */
    websiteId: v.optional(v.id("websites")),
    keywords: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      const business = args.websiteId
        ? await ctx.runQuery(internal.websiteCanonical.describeBusinessForJudging, { websiteId: args.websiteId })
        : null;
      await judgeNewKeywords(ctx, {
        ...(args.companyId ? { companyId: args.companyId } : {}),
        pullId: args.pullId,
        ...(args.host !== undefined ? { host: args.host } : {}),
        ...(business ? { business } : {}),
        keywords: args.keywords,
      });
    } catch (error) {
      // The searches stay unjudged and are asked about the next time they appear.
      console.error("Judging the searches of a filed answer failed:", args.pullId, getErrorMessage(error));
    }
    return null;
  },
});

/**
 * A filing's clash, as Convex words it: another write changed the same rows
 * while this one ran, on every retry it made. Nothing is wrong with the answer
 * or the parser — the other write simply got there first.
 */
const CLASH = /changed while this mutation was being run|OptimisticConcurrencyControlFailure/;

/** Times a clashed filing is tried again, each a random 20 to 60 seconds after the last. */
const REFILE_TRIES = 3;
