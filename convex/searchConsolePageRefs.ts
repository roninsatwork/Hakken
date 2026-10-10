import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { encodePagesFromAction, isPageRef } from "./holdPageRefs";

/**
 * Search Console's kept lists, from addresses to the website's page numbers
 * (`holdPageRefs.ts`), once: the lines kept before 2026-10-05 held the whole
 * address. The numbering itself is the website's, shared with Google
 * Analytics, since 2026-10-10 (google-analytics-plan.md §4.6).
 */

// ---------------------------------------------------------------------------
// Turning the addresses kept before 2026-10-05 into references, once
// ---------------------------------------------------------------------------

/** Kept records read per step: each up to a few thousand lines, so few. */
const RECORDS_PER_STEP = 3;

const addressedValidator = v.object({ recordId: v.id("searchConsoleLists"), keys: v.optional(v.array(v.string())), pages: v.optional(v.array(v.string())) });

/** The next few of a website's kept records, and those still holding an address with what they hold. */
export const keptWithAddresses = internalQuery({
  args: { holdId: v.id("companyWebsites"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ records: v.array(addressedValidator), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsoleLists")
      .withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", args.holdId))
      .paginate({ cursor: args.cursor, numItems: RECORDS_PER_STEP });
    const records = page.page.flatMap((record): Array<typeof addressedValidator.type> => {
      if (record.list === "pair" && record.pages?.some((value) => !isPageRef(value))) return [{ recordId: record._id, pages: record.pages }];
      // A page list's keys are addresses, never a keyword book's places (`searchConsoleKeywordBooks.ts`).
      if (record.list === "page" && typeof record.keys !== "string" && record.keys.some((value) => !isPageRef(value))) return [{ recordId: record._id, keys: record.keys }];
      return [];
    });
    return { records, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** A kept record's addresses replaced by their references; one rolled up or fetched again since is left alone. */
export const setRecordRefs = internalMutation({
  args: addressedValidator.fields,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record) return false;
    await ctx.db.patch(record._id, { ...(args.keys ? { keys: args.keys } : {}), ...(args.pages ? { pages: args.pages } : {}) });
    return true;
  },
});

/** One step of turning a website's kept addresses into references, from an action. Says where to go on. */
export async function turnKeptStep(
  ctx: ActionCtx,
  holdId: Id<"companyWebsites">,
  cursor: string | null,
): Promise<{ changed: number; continueCursor: string; isDone: boolean }> {
  const page: { records: Array<typeof addressedValidator.type>; continueCursor: string; isDone: boolean } =
    await ctx.runQuery(internal.searchConsolePageRefs.keptWithAddresses, { holdId, cursor });
  let changed = 0;
  for (const record of page.records) {
    const keys = record.keys ? await encodePagesFromAction(ctx, holdId, record.keys) : undefined;
    const pages = record.pages ? await encodePagesFromAction(ctx, holdId, record.pages) : undefined;
    const set: boolean = await ctx.runMutation(internal.searchConsolePageRefs.setRecordRefs, {
      recordId: record.recordId,
      ...(keys ? { keys } : {}),
      ...(pages ? { pages } : {}),
    });
    if (set) changed += 1;
  }
  return { changed, continueCursor: page.continueCursor, isDone: page.isDone };
}

/** How long one run of the turning works before it hands on to the next: an action stops at ten minutes. */
const TURN_RUN_MS = 6 * 60 * 1000;

/**
 * Run once on each deployment after 2026-10-05's change: every connected
 * website's kept addresses turned into references, a few records a step, in
 * runs that hand on to the next until all are done. Safe to run again — a
 * record already turned is left alone. (`searchConsoleTidy.ts` does this
 * among the rest of the day's changes.)
 */
export const encodeKeptPages = internalAction({
  args: { holds: v.optional(v.array(v.id("companyWebsites"))), cursor: v.optional(v.union(v.string(), v.null())), records: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const started = Date.now();
    const holds: Id<"companyWebsites">[] = args.holds
      ?? (await ctx.runQuery(internal.searchConsoleSync.connectionsWithFigures, {})).map((connection) => connection.holdId);
    let records = args.records ?? 0;
    let cursor = args.cursor ?? null;
    for (let at = 0; at < holds.length;) {
      if (Date.now() - started > TURN_RUN_MS) {
        await ctx.scheduler.runAfter(0, internal.searchConsolePageRefs.encodeKeptPages, { holds: holds.slice(at), cursor, records });
        return null;
      }
      const step = await turnKeptStep(ctx, holds[at], cursor);
      records += step.changed;
      if (step.isDone) {
        at += 1;
        cursor = null;
      } else {
        cursor = step.continueCursor;
      }
    }
    console.log(`Search Console page references: ${records} kept records turned, every connected website done.`);
    return null;
  },
});
