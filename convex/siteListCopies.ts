import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { claimSchedule, requestSiteRebuild } from "./siteRankings";
import { utf8Length } from "./seoPullAnswers";

/**
 * Compact copies of the big Sites lists (docs/plans/active/
 * sites-table-pages-plan.md §5.2).
 *
 * A big list — every keyword a site ranks for, every link to it, its content
 * gap — can run to tens of thousands of rows, too many to read on every page
 * of a table, so until now the tables walked Convex's cursor pages and never
 * knew their total. A copy holds every row of the list with only what the
 * list is searched, filtered and sorted by, packed into a few records, so one
 * request reads the whole list, counts what matches and cuts out any page.
 *
 * **Written beside, switched in one step.** A new copy's parts are written
 * under a new build id, then the header is pointed at them in one mutation,
 * and only then are the old parts removed. A reader sees the old copy or the
 * new one, never half of either.
 *
 * **Rebuilt when its rows change, and checked.** Each list asks for its copy
 * to be rebuilt where its rows are written (the site rebuild after a filing,
 * a judged intent, a filed page of links, a rebuilt gap), through the same
 * ask-once-run-shortly requests the site rebuild uses, one build of a list at
 * a time. A daily sweep rebuilds any copy that has not been rebuilt in a day,
 * so a missed request cannot leave a list stale for long, and a copy missing
 * or in an older layout is built the first time a table asks for it.
 */

export type CopyKind = "keywords" | "pages" | "links" | "gap";

/** A part's budget, in bytes of JSON: under a document's 1 MiB with room to spare. */
const PART_BYTES = 700_000;

/** How long a copy may go unrebuilt before the daily sweep rebuilds it. */
export const COPY_MAX_AGE_MS = 26 * 60 * 60 * 1000;

/** How long after a request its build runs: long enough for a burst of writes to ask once. */
const COPY_DELAY_MS = 20_000;

/** Parts removed per mutation: each can be most of a megabyte. */
const PARTS_DROPPED_PER_STEP = 4;

export const keywordsCopyKey = (websiteId: Id<"websites">, locationCode: number) => `${websiteId}:${locationCode}`;
export const pagesCopyKey = keywordsCopyKey;
export const linksCopyKey = (websiteId: Id<"websites">) => `${websiteId}`;
export const gapCopyKey = (holdId: Id<"companyWebsites">) => `${holdId}`;

/** The request key a copy's build runs under. */
export const copyRequestKey = (kind: CopyKind, key: string) => `copy:${kind}:${key}`;

/** A copy as a reader gets it: the rows as tuples in `fields` order. */
export type ListCopy = {
  fields: string[];
  rows: unknown[][];
  cut: number | null;
  meta: Record<string, string | number | null>;
  builtAt: number;
};

/**
 * The copy of one list, or null when there is none yet — or one written in a
 * layout this code does not read, which is as good as none: `fields` is the
 * layout the reader expects, so a copy from before a column was added is
 * rebuilt rather than misread.
 */
export async function readListCopy(ctx: QueryCtx, kind: CopyKind, key: string, fields: readonly string[]): Promise<ListCopy | null> {
  const header = await ctx.db
    .query("siteListCopies")
    .withIndex("by_kind_key", (q) => q.eq("kind", kind).eq("key", key))
    .unique();
  if (!header || header.fields.join("\u0000") !== fields.join("\u0000")) return null;
  const parts = await ctx.db
    .query("siteListCopyParts")
    .withIndex("by_build", (q) => q.eq("kind", kind).eq("key", key).eq("buildId", header.buildId))
    .take(header.parts);
  const rows = parts.flatMap((part) => JSON.parse(part.data) as unknown[][]);
  if (parts.length !== header.parts || rows.length !== header.rows) return null;
  return { fields: header.fields, rows, cut: header.cut, meta: header.meta, builtAt: header.builtAt };
}

/** Split rows into parts of JSON under the part budget. */
function partsOf(rows: readonly unknown[][]): string[] {
  const parts: string[] = [];
  let current: string[] = [];
  let bytes = 2;
  for (const row of rows) {
    const text = JSON.stringify(row);
    const size = utf8Length(text) + 1;
    if (current.length > 0 && bytes + size > PART_BYTES) {
      parts.push(`[${current.join(",")}]`);
      current = [];
      bytes = 2;
    }
    current.push(text);
    bytes += size;
  }
  parts.push(`[${current.join(",")}]`);
  return parts;
}

/** Write a list's copy beside its last one, then switch to it and drop the last one. */
export async function writeListCopy(
  ctx: ActionCtx,
  copy: { kind: CopyKind; key: string; fields: readonly string[]; rows: readonly unknown[][]; cut?: number | null; meta?: Record<string, string | number | null> },
): Promise<void> {
  const buildId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parts = partsOf(copy.rows);
  for (const [part, data] of parts.entries()) {
    await ctx.runMutation(internal.siteListCopies.writeCopyPart, { kind: copy.kind, key: copy.key, buildId, part, data });
  }
  await ctx.runMutation(internal.siteListCopies.switchCopy, {
    kind: copy.kind,
    key: copy.key,
    buildId,
    fields: [...copy.fields],
    rows: copy.rows.length,
    parts: parts.length,
    cut: copy.cut ?? null,
    meta: copy.meta ?? {},
  });
  for (;;) {
    const left: number = await ctx.runMutation(internal.siteListCopies.dropOldParts, { kind: copy.kind, key: copy.key, keepBuildId: buildId });
    if (left === 0) return;
  }
}

const kindValidator = v.union(v.literal("keywords"), v.literal("pages"), v.literal("links"), v.literal("gap"));

export const writeCopyPart = internalMutation({
  args: { kind: kindValidator, key: v.string(), buildId: v.string(), part: v.number(), data: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("siteListCopyParts", args);
    return null;
  },
});

/** Point the list at its new copy, in one step. */
export const switchCopy = internalMutation({
  args: {
    kind: kindValidator,
    key: v.string(),
    buildId: v.string(),
    fields: v.array(v.string()),
    rows: v.number(),
    parts: v.number(),
    cut: v.union(v.number(), v.null()),
    meta: v.record(v.string(), v.union(v.string(), v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const header = await ctx.db
      .query("siteListCopies")
      .withIndex("by_kind_key", (q) => q.eq("kind", args.kind).eq("key", args.key))
      .unique();
    const fields = { ...args, builtAt: Date.now() };
    if (header) await ctx.db.replace(header._id, fields);
    else await ctx.db.insert("siteListCopies", fields);
    return null;
  },
});

/**
 * Remove parts no longer pointed at — the last copy's, or those of a build
 * that died before it switched — a few at a time; answers how many it removed.
 *
 * Every part but the kept build's is stale: builds of one list never overlap
 * (`beginRebuild` gives each its turn), so no other build can be mid-write.
 * They are looked for on both sides of the kept id in the index rather than
 * trusting ids to sort by time, which two builds in one millisecond break.
 */
export const dropOldParts = internalMutation({
  args: { kind: kindValidator, key: v.string(), keepBuildId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const before = await ctx.db
      .query("siteListCopyParts")
      .withIndex("by_build", (q) => q.eq("kind", args.kind).eq("key", args.key).lt("buildId", args.keepBuildId))
      .take(PARTS_DROPPED_PER_STEP);
    const parts = before.length > 0
      ? before
      : await ctx.db
        .query("siteListCopyParts")
        .withIndex("by_build", (q) => q.eq("kind", args.kind).eq("key", args.key).gt("buildId", args.keepBuildId))
        .take(PARTS_DROPPED_PER_STEP);
    for (const part of parts) await ctx.db.delete(part._id);
    return parts.length;
  },
});

/**
 * Ask for a list's copy to be rebuilt, once, shortly. The keyword copy is
 * built by the site rebuild, which reads every keyword already, so asking for
 * it asks for that.
 */
export async function requestListCopy(ctx: MutationCtx, kind: CopyKind, key: string): Promise<void> {
  if (kind === "keywords") {
    const [websiteId, place] = key.split(":");
    await requestSiteRebuild(ctx, websiteId as Id<"websites">, Number(place));
    return;
  }
  if (!(await claimSchedule(ctx, copyRequestKey(kind, key)))) return;
  await ctx.scheduler.runAfter(COPY_DELAY_MS, internal.siteListCopyBuilders.buildListCopy, { kind, key });
}

/**
 * Ask for several copies at once, from code that writes their rows but sits
 * below this module — a judged intent (`patchKeywordIntent`) schedules this
 * rather than importing it.
 */
export const requestCopies = internalMutation({
  args: { requests: v.array(v.object({ kind: kindValidator, key: v.string() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const request of args.requests) await requestListCopy(ctx, request.kind, request.key);
    return null;
  },
});

/**
 * The daily sweep: every copy not rebuilt in a day is asked for again, so a
 * request that was missed, or a build that failed, is put right within a day.
 */
export const refreshListCopies = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("siteListCopies").paginate({ cursor: args.cursor, numItems: 50 });
    const stale = Date.now() - COPY_MAX_AGE_MS;
    for (const copy of page.page) {
      if (copy.builtAt < stale) await requestListCopy(ctx, copy.kind as CopyKind, copy.key);
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.siteListCopies.refreshListCopies, { cursor: page.continueCursor });
    return null;
  },
});

/**
 * Remove the copies whose key begins with this — a website's, or a hold's,
 * being deleted (`websitePurge.ts`): the headers first, so no table reads a
 * copy half gone, then the parts a few at a time. Answers whether any remain,
 * for the purge to come back for them.
 */
export async function dropCopies(ctx: MutationCtx, kind: CopyKind, keyPrefix: string): Promise<boolean> {
  const end = `${keyPrefix}￿`;
  const headers = await ctx.db
    .query("siteListCopies")
    .withIndex("by_kind_key", (q) => q.eq("kind", kind).gte("key", keyPrefix).lt("key", end))
    .take(20);
  for (const header of headers) await ctx.db.delete(header._id);
  const parts = await ctx.db
    .query("siteListCopyParts")
    .withIndex("by_build", (q) => q.eq("kind", kind).gte("key", keyPrefix).lt("key", end))
    .take(PARTS_DROPPED_PER_STEP);
  for (const part of parts) await ctx.db.delete(part._id);
  return headers.length === 20 || parts.length === PARTS_DROPPED_PER_STEP;
}

/**
 * Whether a copy's list still has an owner: its website, or for a content gap
 * its company's hold. A build asked for before a website was deleted can run
 * after it; finding nobody, it removes the copy rather than writing one.
 */
export const copyOwnerExists = internalQuery({
  args: { kind: kindValidator, key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const id = args.key.split(":")[0];
    if (args.kind === "gap") {
      const holdId = ctx.db.normalizeId("companyWebsites", id);
      return Boolean(holdId && (await ctx.db.get(holdId)));
    }
    const websiteId = ctx.db.normalizeId("websites", id);
    return Boolean(websiteId && (await ctx.db.get(websiteId)));
  },
});

/** One step of removing a list's copy whose owner is gone: answers whether more remains. */
export const dropCopyStep = internalMutation({
  args: { kind: kindValidator, key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => await dropCopies(ctx, args.kind, args.key),
});

/** Remove a list's copy whose owner is gone, a step at a time. */
export async function dropCopyOf(ctx: ActionCtx, kind: CopyKind, key: string): Promise<void> {
  while (await ctx.runMutation(internal.siteListCopies.dropCopyStep, { kind, key })) {
    // Each step removes a few parts; the next takes the rest.
  }
}
