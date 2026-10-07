import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { kindOfPull, mergePoints, monthOf, type PositionKind, type PositionPoint } from "./positionHistory";
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
