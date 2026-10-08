import { v } from "convex/values";

import { internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { packNumbers, unpackNumbers } from "./utils/searchConsolePacks";

/**
 * Each keyword a website's daily lines hold, kept once a month
 * (keep-less-history-plan.md, part 8.3; 2026-10-08).
 *
 * The 60 days of search-and-page lines named each keyword in full on every
 * day Google showed it: morehandles.co.uk's 407,000 lines held 33,600
 * keywords, 10.9 MB of their 14.8. A `pair` line's `keys` now hold each
 * keyword's place in its month's book, packed as text (`packNumbers`), and
 * the book holds the keyword once.
 *
 * A book a month — all countries' and each country kept ready's apart — goes
 * with its month's lines (`dropOldBooks`, after `dropOldLines`), so no book
 * holds more than a month of keywords and none outlives its lines. Only the
 * nightly build reads the lines (`readKept`), by action, each book read once a
 * run; no screen does. A line kept before 2026-10-08 names its keywords in
 * full, and is read as it is.
 */

/** Keywords in one record of a book: a record holds 8,192 items at most. */
export const BOOK_CHUNK = 4_000;

/** Keywords added to a book per call from an action. */
const ADD_PER_STEP = 2_000;

/** Book records cleared per call. */
const DROP_PER_STEP = 20;

/** Records of one month's book read inside a query: a million keywords, past any website's month. */
const BOOK_CHUNKS_MOST = 250;

/** The month whose book a day's line points to: "2026-09". */
export const monthOfDay = (day: string): string => day.slice(0, 7);

const scopeArgs = { holdId: v.id("companyWebsites"), country: v.optional(v.string()), month: v.string() };
const countryOf = (country: string | undefined) => (country === undefined ? {} : { country });

/** One record of a month's book; null past its last. */
export const bookChunk = internalQuery({
  args: { ...scopeArgs, chunk: v.number() },
  returns: v.union(v.null(), v.array(v.string())),
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("searchConsoleKeywordBooks")
      .withIndex("by_hold_country_month_chunk", (q) => q
        .eq("companyWebsiteId", args.holdId).eq("country", args.country).eq("month", args.month).eq("chunk", args.chunk))
      .unique();
    return record?.keywords ?? null;
  },
});

/**
 * Keywords added to the end of a month's book: their places. Two runs adding
 * the same keyword at once each add it — read back the same either way.
 */
export const addToBook = internalMutation({
  args: { ...scopeArgs, keywords: v.array(v.string()) },
  returns: v.array(v.number()),
  handler: async (ctx, args) => {
    const last = await ctx.db
      .query("searchConsoleKeywordBooks")
      .withIndex("by_hold_country_month_chunk", (q) => q.eq("companyWebsiteId", args.holdId).eq("country", args.country).eq("month", args.month))
      .order("desc")
      .first();
    let chunk = last?.chunk ?? 0;
    let held = last ? [...last.keywords] : [];
    let recordId = last?._id ?? null;
    const save = async () => {
      if (recordId) await ctx.db.patch(recordId, { keywords: held });
      else if (held.length > 0) await ctx.db.insert("searchConsoleKeywordBooks", { companyWebsiteId: args.holdId, ...countryOf(args.country), month: args.month, chunk, keywords: held });
    };
    const places: number[] = [];
    for (const keyword of args.keywords) {
      if (held.length >= BOOK_CHUNK) {
        await save();
        chunk += 1;
        held = [];
        recordId = null;
      }
      places.push(chunk * BOOK_CHUNK + held.length);
      held.push(keyword);
    }
    await save();
    return places;
  },
});

/** A scope's books before a month cleared, a few records a call: true while more are left. */
export const dropOldBooks = internalMutation({
  args: { holdId: v.id("companyWebsites"), country: v.optional(v.string()), before: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("searchConsoleKeywordBooks")
      .withIndex("by_hold_country_month_chunk", (q) => q.eq("companyWebsiteId", args.holdId).eq("country", args.country).lt("month", args.before))
      .take(DROP_PER_STEP);
    for (const record of old) await ctx.db.delete(record._id);
    return old.length === DROP_PER_STEP;
  },
});

/** A website's books — or one country's — cleared with its figures, a few records a call: true once none is left. */
export async function deleteBooks(ctx: MutationCtx, holdId: Id<"companyWebsites">, scope: { country: string } | "ALL", most: number): Promise<boolean> {
  const records = await ctx.db
    .query("searchConsoleKeywordBooks")
    .withIndex("by_hold_country_month_chunk", (q) => (scope === "ALL" ? q.eq("companyWebsiteId", holdId) : q.eq("companyWebsiteId", holdId).eq("country", scope.country)))
    .take(most);
  for (const record of records) await ctx.db.delete(record._id);
  return records.length < most;
}

// ---------------------------------------------------------------------------
// Read and written by action: each book read once a run
// ---------------------------------------------------------------------------

type Book = { keywords: string[]; places: Map<string, number>; adding: Promise<unknown> };

/** Each action's books, read once however many lines it writes or reads. */
const booksOf = new WeakMap<object, Map<string, Promise<Book>>>();

async function readBook(ctx: ActionCtx, holdId: Id<"companyWebsites">, country: string | undefined, month: string): Promise<Book> {
  const keywords: string[] = [];
  for (let chunk = 0; ; chunk += 1) {
    const part: string[] | null = await ctx.runQuery(internal.searchConsoleKeywordBooks.bookChunk, { holdId, ...countryOf(country), month, chunk });
    if (part === null) break;
    keywords.push(...part);
    if (part.length < BOOK_CHUNK) break;
  }
  const places = new Map<string, number>();
  keywords.forEach((keyword, place) => {
    if (!places.has(keyword)) places.set(keyword, place);
  });
  return { keywords, places, adding: Promise.resolve() };
}

function bookOf(ctx: ActionCtx, holdId: Id<"companyWebsites">, country: string | undefined, month: string, fresh = false): Promise<Book> {
  const books = booksOf.get(ctx) ?? new Map<string, Promise<Book>>();
  booksOf.set(ctx, books);
  const key = `${holdId}|${country ?? ""}|${month}`;
  const held = books.get(key);
  if (held && !fresh) return held;
  const reading = readBook(ctx, holdId, country, month);
  books.set(key, reading);
  return reading;
}

/** A day's keywords as their places in its month's book, packed as text: any new to the book added first. */
export async function keywordPlaces(
  ctx: ActionCtx,
  holdId: Id<"companyWebsites">,
  country: string | undefined,
  day: string,
  keywords: readonly string[],
): Promise<string> {
  const month = monthOfDay(day);
  const book = await bookOf(ctx, holdId, country, month);
  // One addition to a book at a time, however many lists a step writes at once.
  const adding = book.adding.then(async () => {
    const missing = [...new Set(keywords)].filter((keyword) => !book.places.has(keyword));
    for (let start = 0; start < missing.length; start += ADD_PER_STEP) {
      const step = missing.slice(start, start + ADD_PER_STEP);
      const places: number[] = await ctx.runMutation(internal.searchConsoleKeywordBooks.addToBook, { holdId, ...countryOf(country), month, keywords: step });
      step.forEach((keyword, index) => {
        book.places.set(keyword, places[index]);
        book.keywords[places[index]] = keyword;
      });
    }
  });
  book.adding = adding.catch(() => undefined);
  await adding;
  return packNumbers(keywords.map((keyword) => book.places.get(keyword) ?? 0));
}

/** A line's keywords: read from its month's book when kept as places, as they are when kept in full. */
export async function lineKeywords(
  ctx: ActionCtx,
  holdId: Id<"companyWebsites">,
  country: string | undefined,
  day: string,
  keys: string | string[],
): Promise<string[]> {
  if (typeof keys !== "string") return keys;
  const places = unpackNumbers(keys);
  let book = await bookOf(ctx, holdId, country, monthOfDay(day));
  // A line written after the book was read this run: read it again.
  if (places.some((place) => place >= book.keywords.length)) book = await bookOf(ctx, holdId, country, monthOfDay(day), true);
  return places.map((place) => book.keywords[place] ?? "");
}

/** A line's keywords read inside a query, for the tidy's own steps: its month's book read whole. */
export async function lineKeywordsInQuery(
  ctx: { db: QueryCtx["db"] },
  holdId: Id<"companyWebsites">,
  country: string | undefined,
  day: string,
  keys: string | string[],
): Promise<string[]> {
  if (typeof keys !== "string") return keys;
  const records = await ctx.db
    .query("searchConsoleKeywordBooks")
    .withIndex("by_hold_country_month_chunk", (q) => q.eq("companyWebsiteId", holdId).eq("country", country).eq("month", monthOfDay(day)))
    .take(BOOK_CHUNKS_MOST);
  const keywords = records.sort((left, right) => left.chunk - right.chunk).flatMap((record) => record.keywords);
  return unpackNumbers(keys).map((place) => keywords[place] ?? "");
}
