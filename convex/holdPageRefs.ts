import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { appError } from "./utils/appError";

/**
 * Each page address kept once per website, numbered once, and every list that
 * names a page pointing to it by that number — Search Console's kept lists
 * and Google Analytics' alike (google-analytics-plan.md §4.6; the name agreed
 * in §10, Q11). Search Console and Analytics then name the same page by the
 * same number: what Reports will join on.
 *
 * A kept line repeated the page's whole address — about 85 characters of
 * `https://www.morehandles.co.uk/valli-yabu-…-pair.html` — on every line of
 * every day: two thirds of a busy website's search-and-page lines
 * (finish-off-plan.md, item 2A). Now a list holds a reference, `~` and the
 * page's number in base 36, given by the action collecting the day
 * (`encodePagesFromAction`) and read back to the address by the action reading
 * the kept records (`addressesOf`), or inside a query (`decodePages`).
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
 * The numbering lives as long as the website is held: clearing one section's
 * figures leaves it, since the other section's lists still point to it, and it
 * goes only with the website (`googleConnection.forgetHold`).
 *
 * A value without the `~` is an address kept before 2026-10-05: read as it is.
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
/** Records cleared a call when the website goes: each up to 250 addresses. */
const RECORDS_PER_DELETE = 40;

/** A website's page list as an action holds it: each address by its number, and each number by its address. */
export type PageList = { addresses: string[]; numbers: Map<string, number> };

/** One page of a website's page list, record by record. */
export const pageListPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ records: v.array(v.object({ record: v.number(), addresses: v.array(v.string()) })), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("holdPageAddresses")
      .withIndex("by_hold_record", (q) => q.eq("companyWebsiteId", args.holdId))
      .paginate({ cursor: args.cursor, numItems: RECORDS_PER_READ });
    return { records: page.page.map((one) => ({ record: one.record, addresses: one.addresses })), continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

async function readPageList(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<PageList> {
  const addresses: string[] = [];
  for (let cursor: string | null = null; ;) {
    const part: { records: Array<{ record: number; addresses: string[] }>; continueCursor: string; isDone: boolean } =
      await ctx.runQuery(internal.holdPageRefs.pageListPart, { holdId, cursor });
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
      .query("holdPageAddresses")
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

/** Every page address a website holds, removed with the website (`googleConnection.forgetHold`). A few records a call; true when none is left. */
export async function deletePageRefs(ctx: MutationCtx, holdId: Id<"companyWebsites">): Promise<boolean> {
  const records = await ctx.db.query("holdPageAddresses").withIndex("by_hold_record", (q) => q.eq("companyWebsiteId", holdId)).take(RECORDS_PER_DELETE);
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
    const last = await ctx.db
      .query("holdPageAddresses")
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
      await ctx.db.insert("holdPageAddresses", { companyWebsiteId: args.holdId, record, addresses: pages.splice(0, PAGE_RECORD) });
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
    const from: number | null = await ctx.runMutation(internal.holdPageRefs.addPages, { holdId, from: list.addresses.length, pages: chunk });
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



/** A website no longer held: its page numbers go, a few records a call, until none is left. */
export const purgeHold = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await deletePageRefs(ctx, args.companyWebsiteId))) {
      await ctx.scheduler.runAfter(0, internal.holdPageRefs.purgeHold, args);
    }
    return null;
  },
});
