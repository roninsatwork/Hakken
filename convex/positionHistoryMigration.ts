import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalQuery, type MutationCtx } from "./_generated/server";
import { kindOfPull, mergePoints, monthOf, pointAt, type PositionKind, type PositionPoint } from "./positionHistory";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";

/**
 * Every position kept a row a check (`seoKeywordPositions`) packed into its
 * month's record (`keywordPositionMonths`; keep-less-history-plan.md, part 1,
 * step A), read in the order the records are kept, so a page's rows of one
 * month are filed together. A row from before places were sent was asked from
 * the United Kingdom (`seoPositionPlaceMigration.ts`).
 *
 * Idempotent: a point filed again replaces itself. Rows filed while it runs
 * are written to both already, so packing them too changes nothing.
 */

type MigrationBatchResult = { cursor: string | null; isDone: boolean; processed: number; updated: number };

export async function packKeywordPositions(
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
): Promise<MigrationBatchResult> {
  const page = await ctx.db
    .query("seoKeywordPositions")
    .withIndex("by_website_keyword_place_day")
    .paginate({ numItems: batchSize, cursor });

  const kinds = new Map<Id<"seoDataPulls">, Promise<PositionKind>>();
  const kindOf = (pullId: Id<"seoDataPulls">) => {
    const held = kinds.get(pullId) ?? kindOfPull(ctx, pullId);
    kinds.set(pullId, held);
    return held;
  };

  const months = new Map<string, { row: Doc<"seoKeywordPositions">; points: PositionPoint[] }>();
  for (const row of page.page) {
    const place = row.locationCode ?? DEFAULT_LOCATION_CODE;
    const key = [row.websiteId, row.keyword, place, monthOf(row.day)].join("\u0000");
    const point: PositionPoint = {
      day: row.day,
      position: row.position ?? null,
      pagePosition: row.pagePosition ?? null,
      url: row.url ?? null,
      kind: await kindOf(row.pullId),
    };
    const held = months.get(key);
    if (held) held.points.push(point);
    else months.set(key, { row, points: [point] });
  }
  for (const { row, points } of months.values()) {
    await mergePoints(ctx, {
      websiteId: row.websiteId,
      keyword: row.keyword,
      locationCode: row.locationCode ?? DEFAULT_LOCATION_CODE,
      month: monthOf(row.day),
    }, points);
  }

  return {
    cursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    processed: page.page.length,
    updated: months.size,
  };
}

/**
 * The packing checked against the rows it packed, before the readers trust
 * it (keep-less-history-plan.md, part 1, step B): each row's day holds a
 * point of the same place, kind and address. Two rows of one day are one
 * point, the later standing, so only the last of a day is checked. Goes with
 * the rows in step C.
 */
export const comparePackedPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    rows: v.number(),
    matched: v.number(),
    differing: v.array(v.string()),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("seoKeywordPositions")
      .withIndex("by_website_keyword_place_day")
      .paginate({ numItems: 500, cursor: args.cursor });
    const kinds = new Map<Id<"seoDataPulls">, Promise<PositionKind>>();
    let matched = 0;
    const differing: string[] = [];
    const lastOfDay = new Map<string, Doc<"seoKeywordPositions">>();
    for (const row of page.page) {
      lastOfDay.set([row.websiteId, row.keyword, row.locationCode ?? DEFAULT_LOCATION_CODE, row.day].join("\u0000"), row);
    }
    for (const row of lastOfDay.values()) {
      const kind = await (kinds.get(row.pullId) ?? kinds.set(row.pullId, kindOfPull(ctx, row.pullId)).get(row.pullId)!);
      const point = await pointAt(ctx, {
        websiteId: row.websiteId, keyword: row.keyword, locationCode: row.locationCode ?? DEFAULT_LOCATION_CODE, day: row.day,
      });
      const same = point !== null && point.position === (row.position ?? null) && point.url === (row.url ?? null) && point.kind === kind;
      if (same) matched += 1;
      else if (differing.length < 5) differing.push(`${row.websiteId} "${row.keyword}" ${row.day}: row ${row.position ?? "—"} ${kind}, point ${point ? `${point.position ?? "—"} ${point.kind}` : "none"}`);
    }
    return { rows: lastOfDay.size, matched, differing, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** Every page of the check above, added up. */
export const comparePacked = internalAction({
  args: {},
  returns: v.object({ rows: v.number(), matched: v.number(), differing: v.array(v.string()) }),
  handler: async (ctx): Promise<{ rows: number; matched: number; differing: string[] }> => {
    let cursor: string | null = null;
    const total = { rows: 0, matched: 0, differing: [] as string[] };
    for (;;) {
      const page: { rows: number; matched: number; differing: string[]; continueCursor: string; isDone: boolean } =
        await ctx.runQuery(internal.positionHistoryMigration.comparePackedPage, { cursor });
      total.rows += page.rows;
      total.matched += page.matched;
      total.differing.push(...page.differing.slice(0, Math.max(0, 20 - total.differing.length)));
      if (page.isDone) return total;
      cursor = page.continueCursor;
    }
  },
});
