/**
 * Whether a company has a menu feature, read from the two lists a feature is
 * switched off in: the platform's (off for everyone) and the company's own,
 * each a row of `featureSwitches` (`featureSwitchesSchema.ts`). See
 * `MENU_FEATURES` in `coreModules.ts` and
 * docs/plans/active/features-switches-plan-2026-11-21.md.
 *
 * Plain reads, no builders, so `tenantFunctions.ts` and the collectors can both
 * use them without importing each other. Every section's server calls check
 * these, so each read is one small row by its index, and none for a company
 * with nothing off. A collector going through many websites reads the
 * platform's list once (`featureOffCheck`) rather than once per website.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { type MenuFeature, menuFeaturesOn, normalizeFeaturesOff } from "./coreModules";

type ReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

/** The row for a company, or the platform's own row when there's no company. */
async function switchesRow(ctx: ReadCtx, companyId: Id<"companies"> | undefined): Promise<Doc<"featureSwitches"> | null> {
  return await ctx.db.query("featureSwitches").withIndex("by_company", (q) => q.eq("companyId", companyId)).first();
}

/** The features switched off for every company. */
export async function featuresOffForEveryone(ctx: ReadCtx): Promise<MenuFeature[]> {
  return normalizeFeaturesOff((await switchesRow(ctx, undefined))?.featuresOff);
}

/** The features switched off on one company's own Features tab. */
export async function companyFeaturesOff(ctx: ReadCtx, companyId: Id<"companies">): Promise<MenuFeature[]> {
  return normalizeFeaturesOff((await switchesRow(ctx, companyId))?.featuresOff);
}

/** The menu features a company has: all seven, less what is off for everyone and for it. */
export async function menuFeaturesFor(ctx: ReadCtx, companyId: Id<"companies"> | null | undefined): Promise<MenuFeature[]> {
  if (!companyId) return [];
  const [own, everyone] = await Promise.all([companyFeaturesOff(ctx, companyId), featuresOffForEveryone(ctx)]);
  return menuFeaturesOn(own, everyone);
}

/** Whether one company has one feature. */
export async function companyHasFeature(
  ctx: ReadCtx,
  companyId: Id<"companies"> | null | undefined,
  feature: MenuFeature,
): Promise<boolean> {
  return (await menuFeaturesFor(ctx, companyId)).includes(feature);
}

/**
 * Saves what's off, for a company or for everyone (no company). An empty list
 * removes the row, so "no row" stays the one way of saying every section is on.
 */
export async function writeFeaturesOff(
  ctx: Pick<MutationCtx, "db">,
  companyId: Id<"companies"> | undefined,
  featuresOff: readonly string[],
): Promise<MenuFeature[]> {
  const off = normalizeFeaturesOff(featuresOff);
  const row = await switchesRow(ctx, companyId);
  if (off.length === 0) {
    if (row) await ctx.db.delete(row._id);
  } else if (row) {
    await ctx.db.patch(row._id, { featuresOff: off, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("featureSwitches", { ...(companyId ? { companyId } : {}), featuresOff: off, updatedAt: Date.now() });
  }
  return off;
}

/** Every company's own list, for the System Settings page's counts. */
export async function everyCompanyFeaturesOff(ctx: ReadCtx): Promise<{ companyId: Id<"companies">; featuresOff: MenuFeature[] }[]> {
  const rows = await ctx.db.query("featureSwitches").take(10_000);
  return rows.flatMap((row) => (row.companyId ? [{ companyId: row.companyId, featuresOff: normalizeFeaturesOff(row.featuresOff) }] : []));
}

/**
 * A check for many companies at once: the platform's list read once, each
 * company read once and remembered. For a collector's fan-out over websites.
 */
export async function featureOffCheck(
  ctx: ReadCtx,
  feature: MenuFeature,
): Promise<(companyId: Id<"companies"> | null | undefined) => Promise<boolean>> {
  const offForEveryone = (await featuresOffForEveryone(ctx)).includes(feature);
  const seen = new Map<Id<"companies">, boolean>();
  return async (companyId) => {
    if (offForEveryone) return true;
    if (!companyId) return false;
    const known = seen.get(companyId);
    if (known !== undefined) return known;
    const off = (await companyFeaturesOff(ctx, companyId)).includes(feature);
    seen.set(companyId, off);
    return off;
  };
}
