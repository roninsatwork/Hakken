import type { MutationCtx } from "./_generated/server";

/**
 * Putting the tracked sites back on the companies that chose them.
 *
 * For one commit on 2026-09-22 a tracked competitor stopped being an attachment
 * and became an edge in the host's competition graph, and the collection cycle
 * read that graph — so a rivalry one company asserted decided what another
 * company bought. Anthony: *"we have owned websites and tracked websites — in a
 * company you set which you own and which you track... If someone else adds
 * ronins as competitor I don't care about that, that's up to them in their own
 * company."*
 *
 * The graph stays as market knowledge. This rebuilds the choice.
 *
 * **Reconstruction, not restoration.** The edges no longer say which company
 * made them, so it applies the same rule the broken expansion did: an edge
 * A → B means every company holding A was watching B. That reproduces exactly
 * what was being collected, which is the thing that has to be preserved.
 */

type MigrationBatchResult = {
  cursor: string | null;
  isDone: boolean;
  processed: number;
  updated: number;
};

type MigrationRunner = (
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
) => Promise<MigrationBatchResult>;

/** Bounded: a host watched by more companies than this is a different problem. */
const HOLDERS_PER_EDGE = 200;

export const attachTrackedFromRivals: MigrationRunner = async (ctx, cursor, batchSize) => {
  const page = await ctx.db.query("websiteRivals").paginate({ numItems: batchSize, cursor });

  let updated = 0;

  for (const edge of page.page) {
    const holders = await ctx.db
      .query("companyWebsites")
      .withIndex("by_website", (q) => q.eq("websiteId", edge.websiteId))
      .take(HOLDERS_PER_EDGE);

    for (const holder of holders) {
      // Only a company's *own* site earns a rival. A tracked one is somebody
      // else's site and its rivalries are not this company's business.
      if (holder.relationship === "TRACKED") continue;

      // Idempotent by lookup: a company that already holds the rival — owned or
      // tracked — is left exactly as it is.
      const existing = await ctx.db
        .query("companyWebsites")
        .withIndex("by_company_website", (q) =>
          q.eq("companyId", holder.companyId).eq("websiteId", edge.rivalWebsiteId))
        .first();
      if (existing) continue;

      await ctx.db.insert("companyWebsites", {
        companyId: holder.companyId,
        websiteId: edge.rivalWebsiteId,
        relationship: "TRACKED",
        againstWebsiteId: edge.websiteId,
        createdAt: edge.createdAt,
      });
      updated += 1;
    }
  }

  return {
    cursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    processed: page.page.length,
    updated,
  };
};

/**
 * Every hold written before the flag existed was a company's own website.
 *
 * Absence already reads as owned everywhere, so this changes no behaviour. It
 * is worth writing down anyway: a field that is sometimes absent and sometimes
 * "OWNED" is a field every future reader has to think about twice.
 */
export const markExistingHoldsOwned: MigrationRunner = async (ctx, cursor, batchSize) => {
  const page = await ctx.db.query("companyWebsites").paginate({ numItems: batchSize, cursor });

  let updated = 0;
  for (const row of page.page) {
    if (row.relationship !== undefined) continue;
    await ctx.db.patch(row._id, { relationship: "OWNED" });
    updated += 1;
  }

  return {
    cursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    processed: page.page.length,
    updated,
  };
};
