import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { appError } from "./utils/appError";

/**
 * Each page address kept once per website, and Search Console's kept lists
 * pointing to it by number (docs/plans/active/finish-off-plan.md, item 2A).
 *
 * A kept line repeated the page's whole address — about 85 characters of
 * `https://www.morehandles.co.uk/valli-yabu-…-pair.html` — on every line of
 * every day: two thirds of a busy website's search-and-page lines. Now a
 * `pair` list's `pages` and a `page` list's `keys` hold a reference, `~` and
 * the page's number in base 36, written when a list is saved (`writeList`) and
 * read back to the address by the action reading the kept records
 * (`readKept`, from the page list read once: `addressesOf`).
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
export async function decodePages(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, values: readonly string[]): Promise<string[]> {
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

/** Page references read per step when an action reads a website's whole page list: small rows. */
const REFS_PER_READ = 4_000;

/** One page of a website's page list, reference by reference. */
export const pageListPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ refs: v.array(v.number()), pages: v.array(v.string()), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsolePageRefs")
      .withIndex("by_hold_ref", (q) => q.eq("companyWebsiteId", args.holdId))
      .paginate({ cursor: args.cursor, numItems: REFS_PER_READ });
    return { refs: page.page.map((row) => row.ref), pages: page.page.map((row) => row.page), continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** Each action's page lists, read once however many lists it decodes. */
const addressBooks = new WeakMap<object, Map<string, Promise<Map<string, string>>>>();

/**
 * A website's page list — reference to address — read once per action run,
 * a few thousand a step: what turns kept references back into addresses for
 * the periods. morehandles.co.uk's 26,000 pages are a few reads; looked up
 * one by one inside each read of kept records, they outran a query's second
 * (2026-10-05).
 */
export async function addressesOf(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<Map<string, string>> {
  const books = addressBooks.get(ctx) ?? new Map<string, Promise<Map<string, string>>>();
  addressBooks.set(ctx, books);
  const held = books.get(holdId);
  if (held) return await held;
  const reading = (async () => {
    const book = new Map<string, string>();
    for (let cursor: string | null = null; ;) {
      const part: { refs: number[]; pages: string[]; continueCursor: string; isDone: boolean } =
        await ctx.runQuery(internal.searchConsolePageRefs.pageListPart, { holdId, cursor });
      part.refs.forEach((ref, index) => book.set(refOf(ref), part.pages[index]));
      if (part.isDone) return book;
      cursor = part.continueCursor;
    }
  })();
  books.set(holdId, reading);
  return await reading;
}

/** References back to addresses from a page list read whole; an address kept before references is returned as it is. */
export function decodeWith(book: ReadonlyMap<string, string>, values: readonly string[]): string[] {
  return values.map((value) => (isPageRef(value) ? book.get(value) ?? value : value));
}

/** Every page reference a website holds, removed with its Search Console data. A page at a time; true when none is left. */
export async function deletePageRefs(ctx: MutationCtx, holdId: Id<"companyWebsites">, most: number): Promise<boolean> {
  const rows = await ctx.db.query("searchConsolePageRefs").withIndex("by_hold_ref", (q) => q.eq("companyWebsiteId", holdId)).take(most);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length < most;
}

// ---------------------------------------------------------------------------
// From an action: a few hundred look-ups a step, remembered for the run
// ---------------------------------------------------------------------------

/**
 * Addresses given references in one step, at most: each is a look-up, and a
 * step stops at a few thousand. A busy website's day holds thousands of
 * addresses — morehandles.co.uk's conversion stopped on 2026-10-05 at three
 * kept records a step — so an action asks for them this many at a time.
 */
const REFS_PER_STEP = 500;

/** References for up to `REFS_PER_STEP` addresses, new numbers for those the website has not had. */
export const refsForPages = internalMutation({
  args: { holdId: v.id("companyWebsites"), pages: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    if (args.pages.length > REFS_PER_STEP) throw appError("INVALID_INPUT", `At most ${REFS_PER_STEP} page addresses a step, not ${args.pages.length}.`);
    return await encodePages(ctx, args.holdId, args.pages);
  },
});

/**
 * Addresses as references from an action: the ones not yet known asked for a
 * few hundred at a time, and remembered in `known` for the rest of the run —
 * a website's pages repeat from day to day.
 */
export async function encodePagesFromAction(
  ctx: ActionCtx,
  holdId: Id<"companyWebsites">,
  pages: readonly string[],
  known: Map<string, string>,
): Promise<string[]> {
  const missing = [...new Set(pages)].filter((page) => !isPageRef(page) && !known.has(page));
  for (let start = 0; start < missing.length; start += REFS_PER_STEP) {
    const chunk = missing.slice(start, start + REFS_PER_STEP);
    const refs: string[] = await ctx.runMutation(internal.searchConsolePageRefs.refsForPages, { holdId, pages: chunk });
    chunk.forEach((page, index) => known.set(page, refs[index]));
  }
  return pages.map((page) => known.get(page) ?? page);
}

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
  known: Map<string, string>,
): Promise<{ changed: number; continueCursor: string; isDone: boolean }> {
  const page: { records: Array<typeof addressedValidator.type>; continueCursor: string; isDone: boolean } =
    await ctx.runQuery(internal.searchConsolePageRefs.keptWithAddresses, { holdId, cursor });
  let changed = 0;
  for (const record of page.records) {
    const keys = record.keys ? await encodePagesFromAction(ctx, holdId, record.keys, known) : undefined;
    const pages = record.pages ? await encodePagesFromAction(ctx, holdId, record.pages, known) : undefined;
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
    let known = new Map<string, string>();
    for (let at = 0; at < holds.length;) {
      if (Date.now() - started > TURN_RUN_MS) {
        await ctx.scheduler.runAfter(0, internal.searchConsolePageRefs.encodeKeptPages, { holds: holds.slice(at), cursor, records });
        return null;
      }
      const step = await turnKeptStep(ctx, holds[at], cursor, known);
      records += step.changed;
      if (step.isDone) {
        at += 1;
        cursor = null;
        known = new Map();
      } else {
        cursor = step.continueCursor;
      }
    }
    console.log(`Search Console page references: ${records} kept records turned, every connected website done.`);
    return null;
  },
});
