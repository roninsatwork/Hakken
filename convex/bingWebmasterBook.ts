import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { appError } from "./utils/appError";

/**
 * Each keyword Bing showed a website for, kept once (docs/plans/active/
 * bing-webmaster-plan.md BW2, §4.3): weeks and periods name a keyword by its
 * place here, so a keyword is written once however many weeks hold it.
 *
 * Words are only ever added, at the end, so a place never changes and a
 * week written a year ago still names the same keyword. A place is its
 * chunk × 4,000 plus its place in the chunk.
 */

export const BING_BOOK_CHUNK = 4_000;

/** Keywords added per call from an action. */
const ADD_PER_CALL = 2_000;

export const bookChunk = internalQuery({
  args: { holdId: v.id("companyWebsites"), chunk: v.number() },
  returns: v.union(v.array(v.string()), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("bingKeywordBooks")
      .withIndex("by_hold_chunk", (q) => q.eq("companyWebsiteId", args.holdId).eq("chunk", args.chunk))
      .first();
    return row?.keywords ?? null;
  },
});

/** The website's whole book, from an action: every keyword, at its place. */
export async function wholeBingBook(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<string[]> {
  const book: string[] = [];
  for (let chunk = 0; ; chunk += 1) {
    const keywords = await ctx.runQuery(internal.bingWebmasterBook.bookChunk, { holdId, chunk });
    if (!keywords) break;
    book.push(...keywords);
    if (keywords.length < BING_BOOK_CHUNK) break;
  }
  return book;
}

/**
 * New keywords at the end of the book, when the book is still the size the
 * action read; null when it moved on meanwhile, so the action reads it again.
 */
export const addToBingBook = internalMutation({
  args: { holdId: v.id("companyWebsites"), size: v.number(), keywords: v.array(v.string()) },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const lastChunk = Math.floor(Math.max(args.size - 1, 0) / BING_BOOK_CHUNK);
    const last = await ctx.db
      .query("bingKeywordBooks")
      .withIndex("by_hold_chunk", (q) => q.eq("companyWebsiteId", args.holdId).eq("chunk", lastChunk))
      .first();
    const held = last ? lastChunk * BING_BOOK_CHUNK + last.keywords.length : 0;
    if (held !== args.size) return null;
    let at = args.size;
    let rest = args.keywords;
    while (rest.length > 0) {
      const chunk = Math.floor(at / BING_BOOK_CHUNK);
      const room = BING_BOOK_CHUNK - (at % BING_BOOK_CHUNK);
      const taken = rest.slice(0, room);
      const row = await ctx.db
        .query("bingKeywordBooks")
        .withIndex("by_hold_chunk", (q) => q.eq("companyWebsiteId", args.holdId).eq("chunk", chunk))
        .first();
      if (row) await ctx.db.patch(row._id, { keywords: [...row.keywords, ...taken] });
      else await ctx.db.insert("bingKeywordBooks", { companyWebsiteId: args.holdId, chunk, keywords: taken });
      at += taken.length;
      rest = rest.slice(taken.length);
    }
    return args.size;
  },
});

/** Each keyword's place in the website's book, adding the ones it has not got. */
export async function bingKeywordPlaces(ctx: ActionCtx, holdId: Id<"companyWebsites">, keywords: readonly string[]): Promise<Map<string, number>> {
  for (let tries = 0; ; tries += 1) {
    const book = await wholeBingBook(ctx, holdId);
    const places = new Map<string, number>();
    for (const [place, keyword] of book.entries()) if (!places.has(keyword)) places.set(keyword, place);
    const missing = [...new Set(keywords)].filter((keyword) => !places.has(keyword));
    if (missing.length === 0) return places;
    let size = book.length;
    let moved = false;
    for (let start = 0; start < missing.length; start += ADD_PER_CALL) {
      const chunk = missing.slice(start, start + ADD_PER_CALL);
      const added = await ctx.runMutation(internal.bingWebmasterBook.addToBingBook, { holdId, size, keywords: chunk });
      if (added === null) {
        moved = true;
        break;
      }
      for (const [index, keyword] of chunk.entries()) places.set(keyword, size + index);
      size += chunk.length;
    }
    if (!moved) return places;
    if (tries >= 4) throw appError("CONFLICT", "The website's Bing keyword book kept moving while keywords were added.");
  }
}

/** Keywords named by their places, inside a query, reading only the chunks they fall in. */
export async function bingKeywordsAt(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, places: readonly number[]): Promise<Map<number, string>> {
  const chunks = new Map<number, string[]>();
  const named = new Map<number, string>();
  for (const place of places) {
    const chunk = Math.floor(place / BING_BOOK_CHUNK);
    if (!chunks.has(chunk)) {
      const row = await ctx.db
        .query("bingKeywordBooks")
        .withIndex("by_hold_chunk", (q) => q.eq("companyWebsiteId", holdId).eq("chunk", chunk))
        .first();
      chunks.set(chunk, row?.keywords ?? []);
    }
    const keyword = chunks.get(chunk)![place % BING_BOOK_CHUNK];
    if (keyword !== undefined) named.set(place, keyword);
  }
  return named;
}

/** The whole book inside a query: a search over every keyword reads it whole. */
export async function wholeBingBookInQuery(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">): Promise<string[]> {
  const rows = await ctx.db
    .query("bingKeywordBooks")
    .withIndex("by_hold_chunk", (q) => q.eq("companyWebsiteId", holdId))
    .take(250);
  return rows.sort((left, right) => left.chunk - right.chunk).flatMap((row) => row.keywords);
}
