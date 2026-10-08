import { v } from "convex/values";

import { internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { searchTypeValidator, type SearchConsolePeriod, type SearchConsolePeriodList, type SearchType } from "./searchConsoleSchema";
import { compareTerms, recordFor, termToken, tokenPlace, type BookKind } from "./utils/searchConsoleTerms";
import type { PeriodRow } from "./searchConsolePeriodReads";
import type { ListRow } from "./utils/searchConsoleViews";

/**
 * The book each build of a website's ready-made lists writes beside them
 * (docs/plans/active/core-data-normalisation-plan.md, §5.1): every keyword
 * and every page address those lists hold, once, sorted A to Z, in records of
 * 250 — and a header record listing each record's first entry. The lists hold
 * places in it, packed; an entry's place is its record times 250 and its
 * place in the record.
 *
 * Sorted, so a place is the A-to-Z order (`compareTerms`, the screens' own):
 * the screens sort by it without the text. Read three ways — a row on screen
 * by its record, a text by the header (one look-up), and a whole book for a
 * search — none needing the text of every row a list holds.
 *
 * One book a build, per hold, country and kind of result (`builtAt` names the
 * build, as on every part it wrote); the night's and the week's alive at once,
 * each going once no list names it (`dropUnusedBooks`).
 */

/** Entries a record holds: small, so naming a screen's rows reads a few small records. */
export const BOOK_RECORD = 250;
/** The header's record number: each record's first entry, in order. */
export const BOOK_HEADER = -1;
/** Records written per call: a few hundred kilobytes. */
const RECORDS_PER_WRITE = 20;
/** Records of one book read at once: a million entries, past any website's. */
const BOOK_RECORDS_MOST = 4_000;
/** Book records cleared per call. */
const DROP_PER_STEP = 40;
/** Rows named a record at a time; past it, from the books read whole. */
const NAMED_ONE_BY_ONE = 500;

export type BookScope = { companyWebsiteId: Id<"companyWebsites">; country?: string; searchType: SearchType; builtAt: number };

const bookKindValidator = v.union(v.literal("query"), v.literal("page"));
const scopeArgs = {
  companyWebsiteId: v.id("companyWebsites"),
  country: v.optional(v.string()),
  searchType: searchTypeValidator,
  builtAt: v.number(),
  kind: bookKindValidator,
};
const countryOf = (country: string | undefined) => (country === undefined ? {} : { country });

/** A few records of a build's book. */
export const writeBookRecords = internalMutation({
  args: { ...scopeArgs, records: v.array(v.object({ record: v.number(), terms: v.array(v.string()) })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { records, ...scope } = args;
    for (const { record, terms } of records) await ctx.db.insert("searchConsolePeriodBooks", { ...scope, record, terms });
    return null;
  },
});

/**
 * A build's book of one kind, written from the action building it: the texts
 * sorted A to Z, once each, then the header. Its places, by text, for the
 * lists that follow.
 */
export async function writeBook(ctx: ActionCtx, scope: BookScope, kind: BookKind, texts: Iterable<string>): Promise<Map<string, number>> {
  const { records, places } = bookRecords(texts);
  const where = { ...scope, ...countryOf(scope.country), kind };
  const entries = records.slice(0, -1);
  for (let start = 0; start < entries.length; start += RECORDS_PER_WRITE) {
    await ctx.runMutation(internal.searchConsolePeriodBooks.writeBookRecords, { ...where, records: entries.slice(start, start + RECORDS_PER_WRITE) });
  }
  // The header last: a book is read only once whole.
  await ctx.runMutation(internal.searchConsolePeriodBooks.writeBookRecords, { ...where, records: [records.at(-1)!] });
  return places;
}

/** A book's records — its texts sorted A to Z, once each, in records of 250, the header last — and each text's place. */
export function bookRecords(texts: Iterable<string>): { records: Array<{ record: number; terms: string[] }>; places: Map<string, number> } {
  const sorted = [...new Set(texts)].sort(compareTerms);
  const records: Array<{ record: number; terms: string[] }> = [];
  for (let start = 0; start < sorted.length; start += BOOK_RECORD) records.push({ record: start / BOOK_RECORD, terms: sorted.slice(start, start + BOOK_RECORD) });
  records.push({ record: BOOK_HEADER, terms: records.map((one) => one.terms[0]) });
  return { records, places: new Map(sorted.map((text, place) => [text, place])) };
}

function bookIndex(ctx: { db: QueryCtx["db"] }, scope: BookScope, kind: BookKind) {
  return ctx.db
    .query("searchConsolePeriodBooks")
    .withIndex("by_hold_build_kind_record", (q) => q
      .eq("companyWebsiteId", scope.companyWebsiteId).eq("country", scope.country).eq("searchType", scope.searchType)
      .eq("builtAt", scope.builtAt).eq("kind", kind));
}

async function bookRecord(ctx: { db: QueryCtx["db"] }, scope: BookScope, kind: BookKind, record: number): Promise<string[]> {
  const held = await ctx.db
    .query("searchConsolePeriodBooks")
    .withIndex("by_hold_build_kind_record", (q) => q
      .eq("companyWebsiteId", scope.companyWebsiteId).eq("country", scope.country).eq("searchType", scope.searchType)
      .eq("builtAt", scope.builtAt).eq("kind", kind).eq("record", record))
    .first();
  return held?.terms ?? [];
}

/** A whole book of one kind, every entry in place order: for a search, or a list read whole. */
export async function wholeBook(ctx: { db: QueryCtx["db"] }, scope: BookScope, kind: BookKind): Promise<string[]> {
  const records = await bookIndex(ctx, scope, kind).take(BOOK_RECORDS_MOST + 1);
  return records.filter((one) => one.record !== BOOK_HEADER).sort((left, right) => left.record - right.record).flatMap((one) => one.terms);
}

/**
 * Names for one request: tokens to their texts and texts to their tokens, each
 * book record read once however many rows ask (`termToken`).
 */
export class BookNames {
  private readonly records = new Map<string, Promise<string[]>>();

  constructor(readonly ctx: { db: QueryCtx["db"] }, readonly scope: BookScope) {}

  private record(kind: BookKind, record: number): Promise<string[]> {
    const key = `${kind}:${record}`;
    const held = this.records.get(key);
    if (held) return held;
    const reading = bookRecord(this.ctx, this.scope, kind, record);
    this.records.set(key, reading);
    return reading;
  }

  /** A token's text; text as it is. */
  async textOf(value: string): Promise<string> {
    const at = tokenPlace(value);
    if (!at) return value;
    const terms = await this.record(at.kind, Math.floor(at.place / BOOK_RECORD));
    return terms[at.place % BOOK_RECORD] ?? "";
  }

  /** Many tokens' texts at once, by token. */
  async textsOf(values: Iterable<string>): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const value of new Set(values)) out.set(value, await this.textOf(value));
    return out;
  }

  /** A text's token in a book; the text itself when the book does not hold it. */
  async tokenOf(kind: BookKind, text: string): Promise<string> {
    const firsts = await this.record(kind, BOOK_HEADER);
    if (firsts.length === 0) return text;
    const record = recordFor(firsts, text);
    const terms = await this.record(kind, record);
    let low = 0;
    let high = terms.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const order = compareTerms(terms[middle], text);
      if (order === 0) return termToken(kind, record * BOOK_RECORD + middle);
      if (order < 0) low = middle + 1;
      else high = middle - 1;
    }
    return text;
  }
}

type Slot = Omit<BookScope, "builtAt"> & { list: SearchConsolePeriodList; period: SearchConsolePeriod; which: "NOW" | "BEFORE" };

const slotIndex = (ctx: { db: QueryCtx["db"] }, slot: Slot) => ctx.db
  .query("searchConsolePeriodUses")
  .withIndex("by_hold_slot", (q) => q
    .eq("companyWebsiteId", slot.companyWebsiteId).eq("country", slot.country).eq("searchType", slot.searchType)
    .eq("list", slot.list).eq("period", slot.period).eq("which", slot.which));

/** A list now read from a build: noted with its first part (`writePeriodPart`). */
export async function noteListBuild(ctx: MutationCtx, slot: Slot, builtAt: number): Promise<void> {
  const held = await slotIndex(ctx, slot).first();
  if (held) await ctx.db.patch(held._id, { builtAt });
  else await ctx.db.insert("searchConsolePeriodUses", { ...slot, ...countryOf(slot.country), builtAt });
}

/** A list emptied: it names no build. */
export async function forgetListBuild(ctx: MutationCtx, slot: Slot): Promise<void> {
  const held = await slotIndex(ctx, slot).first();
  if (held) await ctx.db.delete(held._id);
}

/** The builds a scope's lists are read from. */
async function buildsInUse(ctx: { db: QueryCtx["db"] }, scope: Omit<BookScope, "builtAt">): Promise<Set<number>> {
  const uses = await ctx.db
    .query("searchConsolePeriodUses")
    .withIndex("by_hold_slot", (q) => q.eq("companyWebsiteId", scope.companyWebsiteId).eq("country", scope.country).eq("searchType", scope.searchType))
    .take(200);
  return new Set(uses.map((use) => use.builtAt));
}

/** A scope's books no list names, a few records a call: true while more are left. */
export const dropUnusedBooks = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), country: v.optional(v.string()), searchType: searchTypeValidator },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const inUse = await buildsInUse(ctx, args);
    const records = await ctx.db
      .query("searchConsolePeriodBooks")
      .withIndex("by_hold_build_kind_record", (q) => q
        .eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", args.searchType))
      .take(BOOK_RECORDS_MOST);
    const unused = records.filter((record) => !inUse.has(record.builtAt)).slice(0, DROP_PER_STEP);
    for (const record of unused) await ctx.db.delete(record._id);
    return unused.length === DROP_PER_STEP;
  },
});

/** A website's books and their lists' builds — or one country's — cleared with its figures, a few a call: true once none is left. */
export async function deletePeriodBooks(ctx: MutationCtx, holdId: Id<"companyWebsites">, scope: { country: string } | "ALL", most: number): Promise<boolean> {
  const records = await ctx.db
    .query("searchConsolePeriodBooks")
    .withIndex("by_hold_build_kind_record", (q) => (scope === "ALL" ? q.eq("companyWebsiteId", holdId) : q.eq("companyWebsiteId", holdId).eq("country", scope.country)))
    .take(most);
  for (const record of records) await ctx.db.delete(record._id);
  const uses = await ctx.db
    .query("searchConsolePeriodUses")
    .withIndex("by_hold_slot", (q) => (scope === "ALL" ? q.eq("companyWebsiteId", holdId) : q.eq("companyWebsiteId", holdId).eq("country", scope.country)))
    .take(most);
  for (const use of uses) await ctx.db.delete(use._id);
  return records.length < most && uses.length < most;
}

/** A page of a book's records, for an action reading a whole book across reads. */
export const bookPart = internalQuery({
  args: { ...scopeArgs, cursor: v.union(v.string(), v.null()) },
  returns: v.object({ records: v.array(v.object({ record: v.number(), terms: v.array(v.string()) })), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await bookIndex(ctx, args, args.kind).paginate({ cursor: args.cursor, numItems: 200 });
    return {
      records: page.page.map((record) => ({ record: record.record, terms: record.terms })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** A whole book read from an action, a page of records at a time: every entry in place order. */
export async function wholeBookFromAction(ctx: ActionCtx, scope: BookScope, kind: BookKind): Promise<string[]> {
  const records: Array<{ record: number; terms: string[] }> = [];
  for (let cursor: string | null = null; ;) {
    const page: { records: Array<{ record: number; terms: string[] }>; continueCursor: string; isDone: boolean } =
      await ctx.runQuery(internal.searchConsolePeriodBooks.bookPart, { ...scope, ...countryOf(scope.country), kind, cursor });
    records.push(...page.records);
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  return records.filter((one) => one.record !== BOOK_HEADER).sort((left, right) => left.record - right.record).flatMap((one) => one.terms);
}

/** A token's text from a book read whole: by its place; text as it is. */
export function textsFrom(book: readonly string[]): (key: string) => string {
  return (key) => {
    const at = tokenPlace(key);
    return at ? book[at.place] ?? "" : key;
  };
}

/** A period's rows with their keywords and pages as text, from its build's books read whole: lists from two builds. */
export async function asText<List extends { rows: PeriodRow[]; book: BookScope | null }>(ctx: { db: QueryCtx["db"] }, list: List): Promise<List> {
  if (!list.book) return list;
  const books = { query: textsFrom(await wholeBook(ctx, list.book, "query")), page: textsFrom(await wholeBook(ctx, list.book, "page")) };
  const text = (value: string) => (tokenPlace(value)?.kind === "page" ? books.page(value) : books.query(value));
  return {
    ...list,
    book: null,
    rows: list.rows.map((row) => ({ ...row, key: text(row.key), ...(row.top !== undefined ? { top: text(row.top) } : {}), ...(row.page !== undefined ? { page: text(row.page) } : {}) })),
  };
}

/**
 * Rows with their keywords and pages named: the tokens a list carries (§5.1) as text, only for
 * the rows a caller shows or sends — a screen's page, Ask Hakken's few, a download's all.
 */
export async function namedRows(list: { names?: BookNames | null }, rows: readonly ListRow[]): Promise<ListRow[]> {
  const names = list.names;
  if (!names) return [...rows];
  // Many rows — a download — named from the books read whole, once: a look-up a row outran a read's second.
  if (rows.length > NAMED_ONE_BY_ONE) {
    const books = { query: textsFrom(await wholeBook(names.ctx, names.scope, "query")), page: textsFrom(await wholeBook(names.ctx, names.scope, "page")) };
    const text = (value: string) => (tokenPlace(value)?.kind === "page" ? books.page(value) : books.query(value));
    return rows.map((row) => ({ ...row, key: text(row.key), top: row.top === null ? null : text(row.top), next: row.next === null ? null : text(row.next) }));
  }
  return await Promise.all(rows.map(async (row) => ({
    ...row,
    key: await names.textOf(row.key),
    top: row.top === null ? null : await names.textOf(row.top),
    next: row.next === null ? null : await names.textOf(row.next),
  })));
}
