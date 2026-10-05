import { v } from "convex/values";

import { internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Each page address kept once per website, and Search Console's kept lists
 * pointing to it by number (docs/plans/active/finish-off-plan.md, item 2A).
 *
 * A kept line repeated the page's whole address — about 85 characters of
 * `https://www.morehandles.co.uk/valli-yabu-…-pair.html` — on every line of
 * every day: two thirds of a busy website's search-and-page lines. Now a
 * `pair` list's `pages` and a `page` list's `keys` hold a reference, `~` and
 * the page's number in base 36, written when a list is saved (`writeList`) and
 * read back to the address when the kept records are read (`keptBetween`).
 * Everything between — the roll-ups, which add lines up by their page — works
 * on the references as they are, and everything after sees addresses.
 *
 * A value without the `~` is an address kept before 2026-10-05: read as it is,
 * and turned into a reference by `encodeKeptPages`.
 */

const REF_MARK = "~";

export function isPageRef(value: string): boolean {
  return value.startsWith(REF_MARK);
}

function refOf(number: number): string {
  return `${REF_MARK}${number.toString(36)}`;
}

function numberOf(ref: string): number {
  return Number.parseInt(ref.slice(REF_MARK.length), 36);
}

/** Addresses as references, a new number for each address the website has not had before. */
export async function encodePages(ctx: MutationCtx, holdId: Id<"companyWebsites">, pages: readonly string[]): Promise<string[]> {
  const known = new Map<string, string>();
  let next: number | null = null;
  for (const page of new Set(pages)) {
    if (isPageRef(page)) continue;
    const held = await ctx.db
      .query("searchConsolePageRefs")
      .withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId).eq("page", page))
      .first();
    if (held) {
      known.set(page, refOf(held.ref));
      continue;
    }
    if (next === null) {
      const last = await ctx.db
        .query("searchConsolePageRefs")
        .withIndex("by_hold_ref", (q) => q.eq("companyWebsiteId", holdId))
        .order("desc")
        .first();
      next = (last?.ref ?? -1) + 1;
    }
    await ctx.db.insert("searchConsolePageRefs", { companyWebsiteId: holdId, page, ref: next });
    known.set(page, refOf(next));
    next += 1;
  }
  return pages.map((page) => known.get(page) ?? page);
}

/** References back to addresses; an address kept before references is returned as it is. */
export async function decodePages(ctx: QueryCtx, holdId: Id<"companyWebsites">, values: readonly string[]): Promise<string[]> {
  const found = new Map<string, string>();
  for (const value of new Set(values)) {
    if (!isPageRef(value)) continue;
    const held = await ctx.db
      .query("searchConsolePageRefs")
      .withIndex("by_hold_ref", (q) => q.eq("companyWebsiteId", holdId).eq("ref", numberOf(value)))
      .first();
    if (held) found.set(value, held.page);
  }
  return values.map((value) => found.get(value) ?? value);
}

/** Every page reference a website holds, removed with its Search Console data. A page at a time; true when none is left. */
export async function deletePageRefs(ctx: MutationCtx, holdId: Id<"companyWebsites">, most: number): Promise<boolean> {
  const rows = await ctx.db.query("searchConsolePageRefs").withIndex("by_hold_ref", (q) => q.eq("companyWebsiteId", holdId)).take(most);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length < most;
}

// ---------------------------------------------------------------------------
// Turning the addresses kept before 2026-10-05 into references, once
// ---------------------------------------------------------------------------

/** Kept records turned per mutation: each up to 8,000 lines, so few. */
const RECORDS_PER_STEP = 3;

/**
 * One step of turning a website's kept addresses into references: the next
 * few of its kept records, wherever a `pair` or `page` list still holds an
 * address. Says where to go on, or that the website is done.
 */
export const encodeKeptPagesStep = internalMutation({
  args: { holdId: v.id("companyWebsites"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ changed: v.number(), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsoleLists")
      .withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", args.holdId))
      .paginate({ cursor: args.cursor, numItems: RECORDS_PER_STEP });
    let changed = 0;
    for (const record of page.page) {
      if (record.list === "pair" && record.pages?.some((value) => !isPageRef(value))) {
        await ctx.db.patch(record._id, { pages: await encodePages(ctx, args.holdId, record.pages) });
        changed += 1;
      } else if (record.list === "page" && record.keys.some((value) => !isPageRef(value))) {
        await ctx.db.patch(record._id, { keys: await encodePages(ctx, args.holdId, record.keys) });
        changed += 1;
      }
    }
    return { changed, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** How long one run of the turning works before it hands on to the next: an action stops at ten minutes. */
const TURN_RUN_MS = 6 * 60 * 1000;

/**
 * Run once on each deployment after 2026-10-05's change: every connected
 * website's kept addresses turned into references, a few records a step, in
 * runs that hand on to the next until all are done. Safe to run again — a
 * record already turned is left alone.
 */
export const encodeKeptPages = internalAction({
  args: { holds: v.optional(v.array(v.id("companyWebsites"))), cursor: v.optional(v.union(v.string(), v.null())), records: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const started = Date.now();
    const holds: Id<"companyWebsites">[] = args.holds ?? await ctx.runQuery(internal.searchConsoleSync.connectedHolds, {});
    let records = args.records ?? 0;
    let cursor = args.cursor ?? null;
    for (let at = 0; at < holds.length;) {
      if (Date.now() - started > TURN_RUN_MS) {
        await ctx.scheduler.runAfter(0, internal.searchConsolePageRefs.encodeKeptPages, { holds: holds.slice(at), cursor, records });
        return null;
      }
      const step: { changed: number; continueCursor: string; isDone: boolean } = await ctx.runMutation(internal.searchConsolePageRefs.encodeKeptPagesStep, { holdId: holds[at], cursor });
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
