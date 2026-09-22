import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import type { MutationCtx } from "./_generated/server";

/**
 * Writing down the place every old ranking was measured from.
 *
 * Positions gained a `locationCode` on 2026-09-22, when rankings started being
 * asked from each watcher's own place. Every row written before then was asked
 * from the registry default — the United Kingdom — because nothing passed a
 * place at all. This writes that down, so the rows can be read through an index
 * on the place rather than filtered after a read, which is the shape that
 * silently drops one town's rows once another town's are newer.
 *
 * Idempotent: a row that already carries a place is left alone.
 */

type MigrationBatchResult = {
  cursor: string | null;
  isDone: boolean;
  processed: number;
  updated: number;
};

export async function backfillPositionPlaces(
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
): Promise<MigrationBatchResult> {
  const page = await ctx.db.query("seoKeywordPositions").paginate({ numItems: batchSize, cursor });

  let updated = 0;
  for (const row of page.page) {
    if (row.locationCode !== undefined) continue;
    await ctx.db.patch(row._id, { locationCode: DEFAULT_LOCATION_CODE });
    updated += 1;
  }

  return {
    cursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    processed: page.page.length,
    updated,
  };
}
