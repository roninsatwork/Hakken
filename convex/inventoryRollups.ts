import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { replaceGlobalInventoryRollup } from "./utils/inventoryRollupService";
import { superAdminMutation } from "./tenantFunctions";
import { appError } from "./utils/appError";

/**
 * The most rows of one table the rebuild will count in a single pass.
 *
 * What comes back is written straight into the rollup as
 * `totalProvisionedUsers` and `totalProvisionedCompanies`, and MRR is derived
 * from it — so a truncated read does not degrade the numbers, it replaces the
 * authoritative ones with wrong ones and leaves them there. The rebuild reads
 * one past the ceiling and refuses rather than overwriting good counts with
 * short ones; the incremental totals kept at write time stay correct in the
 * meantime.
 */
const INVENTORY_REBUILD_LIMIT = 10000;

export async function rebuildGlobalInventoryRollupData(ctx: MutationCtx) {
  const users = await ctx.db.query("users").take(INVENTORY_REBUILD_LIMIT + 1);
  const companies = await ctx.db.query("companies").take(INVENTORY_REBUILD_LIMIT + 1);
  const plans = await ctx.db.query("plans").take(INVENTORY_REBUILD_LIMIT + 1);

  const overflowing = [
    users.length > INVENTORY_REBUILD_LIMIT ? "users" : null,
    companies.length > INVENTORY_REBUILD_LIMIT ? "companies" : null,
    plans.length > INVENTORY_REBUILD_LIMIT ? "plans" : null,
  ].filter((table): table is string => table !== null);

  if (overflowing.length > 0) {
    throw appError(
      "INVALID_INPUT",
      `The platform inventory was not rebuilt: ${overflowing.join(" and ")} hold more than ${INVENTORY_REBUILD_LIMIT} rows, which is more than one pass can count. The existing totals are left alone rather than replaced with short ones.`
    );
  }

  const planCompanyCounts = new Map<string, number>();

  for (const company of companies) {
    if (!company.planId) continue;
    const planId = String(company.planId);
    planCompanyCounts.set(planId, (planCompanyCounts.get(planId) ?? 0) + 1);
  }

  const planInventory = plans.map((plan) => ({
    planId: String(plan._id),
    name: plan.name || "Unknown Plan",
    priceGBP: plan.priceGBP || 0,
    isActive: plan.isActive,
    companies: planCompanyCounts.get(String(plan._id)) ?? 0,
  }));

  await replaceGlobalInventoryRollup(ctx, {
    totalProvisionedUsers: users.length,
    totalProvisionedCompanies: companies.length,
    planInventory,
  });

  const mrr = planInventory
    .filter((plan) => plan.isActive)
    .reduce((total, plan) => total + plan.priceGBP * plan.companies, 0);

  return {
    totalProvisionedUsers: users.length,
    totalProvisionedCompanies: companies.length,
    planCount: plans.length,
    mrr,
  };
}

export const rebuildGlobalInventoryRollup = superAdminMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    await rebuildGlobalInventoryRollupData(ctx);
    return true;
  },
});
