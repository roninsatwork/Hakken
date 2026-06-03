import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireSuperAdmin } from "./authz";
import { replaceGlobalInventoryRollup } from "./utils/inventoryRollupService";

export async function rebuildGlobalInventoryRollupData(ctx: MutationCtx) {
  const users = await ctx.db.query("users").take(10000);
  const companies = await ctx.db.query("companies").take(10000);
  const plans = await ctx.db.query("plans").take(10000);
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

export const rebuildGlobalInventoryRollup = mutation({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized System Access", "Unauthorized");

    await rebuildGlobalInventoryRollupData(ctx);
    return true;
  },
});
