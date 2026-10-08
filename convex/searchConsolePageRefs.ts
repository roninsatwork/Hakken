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
 * the page's number in base 36, given by the action collecting the day
 * (`encodePagesFromAction`) and read back to the address by the action reading
 * the kept records (`readKept`, from the page list read once: `addressesOf`).
 * Everything between — the roll-ups, which add lines up by their page — works
 * on the references as they are, and everything after sees addresses.
 *
 * The addresses are held 250 to a record, in the order each was first seen: a
 * page's number is its place, its record times 250 and its place in the
 * record (core-data-normalisation-plan.md §5.7). Never re-sorted — a number,
 * once given, is on every kept line naming the page — so a new page goes on
 * the end. Held one row a page, morehandles.co.uk's 9,243 addresses took 2.1
 * MB, most of it each row's own keeping, and a second index holding every
 * address again. An address is found only from the list read whole: once a
 * run, by the action, which reads it whole to give numbers anyway.
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

/** Addresses a record holds: a few tens of kilobytes. */
export const PAGE_RECORD = 250;
/** Records read a step when an action reads a website's whole list. */
const RECORDS_PER_READ = 20;
/** New addresses added a call. */
const PAGES_PER_ADD = 1_000;
/** Records cleared a call when a website's Search Console goes: each up to 250 addresses. */
const RECORDS_PER_DELETE = 40;

/** A website's page list as an action holds it: each address by its number, and each number by its address. */
export type PageList = { addresses: string[]; numbers: Map<string, number> };

/** One page of a website's page list, record by record. */
export const pageListPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ records: v.array(v.object({ record: v.number(), addresses: v.array(v.string()) })), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsolePageAddresses")
      .withIndex("by_hold_record", (q) => q.eq("companyWebsiteId", args.holdId))
      .paginate({ cursor: args.cursor, numItems: RECORDS_PER_READ });
    return { records: page.page.map((one) => ({ record: one.record, addresses: one.addresses })), continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

async function readPageList(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<PageList> {
  const addresses: string[] = [];
  for (let cursor: string | null = null; ;) {
    const part: { records: Array<{ record: number; addresses: string[] }>; continueCursor: string; isDone: boolean } =
      await ctx.runQuery(internal.searchConsolePageRefs.pageListPart, { holdId, cursor });
    for (const one of part.records) one.addresses.forEach((address, place) => (addresses[one.record * PAGE_RECORD + place] = address));
    if (part.isDone) break;
    cursor = part.continueCursor;
  }
  return { addresses, numbers: new Map(addresses.map((address, number) => [address, number])) };
}

/** Each action's page lists, read once however many lists it reads or writes. */
const pageLists = new WeakMap<object, Map<string, Promise<PageList>>>();

/**
 * A website's page list, read once per action run, a few records a step: what
 * turns kept references back into addresses for the periods, and addresses
 * into references for a collected day. morehandles.co.uk's pages are a few
 * reads; looked up one by one inside each read of kept records, they outran a
 * query's second (2026-10-05).
 */
export async function addressesOf(ctx: ActionCtx, holdId: Id<"companyWebsites">, again = false): Promise<PageList> {
  const lists = pageLists.get(ctx) ?? new Map<string, Promise<PageList>>();
  pageLists.set(ctx, lists);
  const held = lists.get(holdId);
  if (held && !again) return await held;
  const reading = readPageList(ctx, holdId);
  lists.set(holdId, reading);
  return await reading;
}

/** References back to addresses, from a page list read whole; an address kept before references is returned as it is. */
export function decodeWith(list: PageList, values: readonly string[]): string[] {
  return values.map((value) => (isPageRef(value) ? list.addresses[numberOf(value)] ?? value : value));
}

/** References back to addresses inside a query, reading only the records they name. */
export async function decodePages(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, values: readonly string[]): Promise<string[]> {
  const records = new Map<number, string[]>();
  for (const value of values) {
    if (!isPageRef(value)) continue;
    const record = Math.floor(numberOf(value) / PAGE_RECORD);
    if (records.has(record)) continue;
    const held = await ctx.db
      .query("searchConsolePageAddresses")
      .withIndex("by_hold_record", (q) => q.eq("companyWebsiteId", holdId).eq("record", record))
      .first();
    records.set(record, held?.addresses ?? []);
  }
  return values.map((value) => {
    if (!isPageRef(value)) return value;
    const number = numberOf(value);
    return records.get(Math.floor(number / PAGE_RECORD))?.[number % PAGE_RECORD] ?? value;
  });
}

/** Every page address a website holds, removed with its Search Console data. A few records a call; true when none is left. */
export async function deletePageRefs(ctx: MutationCtx, holdId: Id<"companyWebsites">): Promise<boolean> {
  const records = await ctx.db.query("searchConsolePageAddresses").withIndex("by_hold_record", (q) => q.eq("companyWebsiteId", holdId)).take(RECORDS_PER_DELETE);
  for (const record of records) await ctx.db.delete(record._id);
  return records.length < RECORDS_PER_DELETE;
}

// ---------------------------------------------------------------------------
// From an action: the list read once, new addresses put on its end
// ---------------------------------------------------------------------------

/**
 * New addresses on the end of a website's list, numbered from `from` — when
 * the list still ends there. Otherwise null, and nothing written: another run
 * added pages since the action read the list, and might have added these.
 */
export const addPages = internalMutation({
  args: { holdId: v.id("companyWebsites"), from: v.number(), pages: v.array(v.string()) },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    if (args.pages.length > PAGES_PER_ADD) throw appError("INVALID_INPUT", `At most ${PAGES_PER_ADD} page addresses a call, not ${args.pages.length}.`);
    // Numbers given before the website's rows became records would be given twice (`turnRowsIntoRecords`).
    const rows = await ctx.db.query("searchConsolePageRefs").withIndex("by_hold_ref", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (rows) throw appError("CONFLICT", "This website's page list is being moved into records; its pages are numbered once that is done.");
    const last = await ctx.db
      .query("searchConsolePageAddresses")
      .withIndex("by_hold_record", (q) => q.eq("companyWebsiteId", args.holdId))
      .order("desc")
      .first();
    const count = last ? last.record * PAGE_RECORD + last.addresses.length : 0;
    if (count !== args.from) return null;
    const pages = [...args.pages];
    if (last && last.addresses.length < PAGE_RECORD) {
      await ctx.db.patch(last._id, { addresses: [...last.addresses, ...pages.splice(0, PAGE_RECORD - last.addresses.length)] });
    }
    for (let record = Math.ceil((count + args.pages.length - pages.length) / PAGE_RECORD); pages.length > 0; record += 1) {
      await ctx.db.insert("searchConsolePageAddresses", { companyWebsiteId: args.holdId, record, addresses: pages.splice(0, PAGE_RECORD) });
    }
    return args.from;
  },
});

/**
 * Addresses as references from an action: the website's list read once a run,
 * and the addresses it does not hold put on its end, a thousand a call. When
 * another run has added to the list meanwhile, it is read again and the
 * addresses still missing added after.
 */
export async function encodePagesFromAction(ctx: ActionCtx, holdId: Id<"companyWebsites">, pages: readonly string[]): Promise<string[]> {
  let list = await addressesOf(ctx, holdId);
  for (let tries = 0; ; tries += 1) {
    const missing = [...new Set(pages)].filter((page) => !isPageRef(page) && !list.numbers.has(page));
    if (missing.length === 0) break;
    const chunk = missing.slice(0, PAGES_PER_ADD);
    const from: number | null = await ctx.runMutation(internal.searchConsolePageRefs.addPages, { holdId, from: list.addresses.length, pages: chunk });
    if (from === null) {
      if (tries >= 5) throw appError("CONFLICT", "The website's page list kept changing while its pages were being numbered.");
      list = await addressesOf(ctx, holdId, true);
      continue;
    }
    chunk.forEach((page, place) => {
      list.addresses[from + place] = page;
      list.numbers.set(page, from + place);
    });
  }
  return pages.map((page) => (isPageRef(page) ? page : refOf(list.numbers.get(page)!)));
}


// ---------------------------------------------------------------------------
// One row a page into records of 250, once (core-data plan §5.7)
// ---------------------------------------------------------------------------

/**
 * A website's page rows as records, every number kept, in one go: the rows
 * read in number order, written 250 to a record, and removed. A number with no
 * row — none is given that way, but the move cannot tell — keeps its place
 * empty. Run once per website on each deployment; a website already moved has
 * no rows and is left alone.
 */
/** Rows moved in one go: under the 16,000 writes a mutation may make, with the records. */
const MOVE_MOST = 15_000;

export const turnRowsIntoRecords = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.object({ rows: v.number(), records: v.number() }),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("searchConsolePageRefs").withIndex("by_hold_ref", (q) => q.eq("companyWebsiteId", args.holdId)).take(MOVE_MOST + 1);
    if (rows.length === 0) return { rows: 0, records: 0 };
    if (rows.length > MOVE_MOST) throw appError("INVALID_INPUT", `More than ${MOVE_MOST} page rows: too many to move in one go.`);
    const held = await ctx.db.query("searchConsolePageAddresses").withIndex("by_hold_record", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (held) throw appError("CONFLICT", "This website has page records and page rows both; nothing was moved.");
    const addresses: string[] = Array.from({ length: rows.at(-1)!.ref + 1 }, () => "");
    for (const row of rows) addresses[row.ref] = row.page;
    let records = 0;
    for (let start = 0; start < addresses.length; start += PAGE_RECORD, records += 1) {
      await ctx.db.insert("searchConsolePageAddresses", { companyWebsiteId: args.holdId, record: start / PAGE_RECORD, addresses: addresses.slice(start, start + PAGE_RECORD) });
    }
    for (const row of rows) await ctx.db.delete(row._id);
    return { rows: rows.length, records };
  },
});

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
