import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./appError";

export const GLOBAL_INVENTORY_ROLLUP_KEY = "global";

type InventoryRollupCtx = Pick<MutationCtx, "db">;
type InventoryRollupQueryCtx = Pick<QueryCtx, "db">;

type PlanInventoryEntry = Doc<"inventoryRollups">["planInventory"][number];

const defaultGlobalRollup = (now = Date.now()) => ({
  key: GLOBAL_INVENTORY_ROLLUP_KEY,
  totalProvisionedUsers: 0,
  totalProvisionedCompanies: 0,
  mrr: 0,
  planInventory: [] as PlanInventoryEntry[],
  updatedAt: now,
});

function planIdToString(planId: Id<"plans"> | string) {
  return String(planId);
}

function recalculateMrr(planInventory: PlanInventoryEntry[]) {
  return Number(
    planInventory
      .reduce((total, plan) => total + (plan.isActive ? plan.priceGBP * plan.companies : 0), 0)
      .toFixed(2)
  );
}

function normalizePlanInventory(planInventory: PlanInventoryEntry[]) {
  return planInventory
    .filter((plan) => plan.companies > 0 || plan.isActive)
    .sort((a, b) => b.priceGBP * b.companies - a.priceGBP * a.companies);
}

export async function getGlobalInventoryRollup(ctx: InventoryRollupQueryCtx) {
  return await ctx.db
    .query("inventoryRollups")
    .withIndex("by_key", (q) => q.eq("key", GLOBAL_INVENTORY_ROLLUP_KEY))
    .first();
}

export function getPlanDistributionFromRollup(rollup: Doc<"inventoryRollups"> | null) {
  if (!rollup) return [];

  return rollup.planInventory
    .filter((plan) => plan.isActive && plan.companies > 0)
    .map((plan) => ({
      planId: plan.planId,
      name: plan.name,
      mrr: Number((plan.priceGBP * plan.companies).toFixed(2)),
      companies: plan.companies,
    }))
    .sort((a, b) => b.mrr - a.mrr);
}

export async function ensureGlobalInventoryRollup(ctx: InventoryRollupCtx) {
  const existing = await ctx.db
    .query("inventoryRollups")
    .withIndex("by_key", (q) => q.eq("key", GLOBAL_INVENTORY_ROLLUP_KEY))
    .first();

  if (existing) return existing;

  const id = await ctx.db.insert("inventoryRollups", defaultGlobalRollup());
  const created = await ctx.db.get(id);
  if (!created) throw appError("UPSTREAM_FAILURE", "Failed to create global inventory rollup.");
  return created;
}

export async function incrementGlobalInventoryTotals(
  ctx: InventoryRollupCtx,
  args: { usersDelta?: number; companiesDelta?: number }
) {
  const rollup = await ensureGlobalInventoryRollup(ctx);
  await ctx.db.patch(rollup._id, {
    totalProvisionedUsers: Math.max(0, rollup.totalProvisionedUsers + (args.usersDelta ?? 0)),
    totalProvisionedCompanies: Math.max(0, rollup.totalProvisionedCompanies + (args.companiesDelta ?? 0)),
    updatedAt: Date.now(),
  });
}

function upsertPlanInventoryEntry(
  planInventory: PlanInventoryEntry[],
  plan: Doc<"plans">,
  companiesDelta: number
) {
  const planId = planIdToString(plan._id);
  const existing = planInventory.find((entry) => entry.planId === planId);

  if (existing) {
    existing.name = plan.name || "Unknown Plan";
    existing.priceGBP = plan.priceGBP || 0;
    existing.isActive = plan.isActive;
    existing.companies = Math.max(0, existing.companies + companiesDelta);
    return;
  }

  planInventory.push({
    planId,
    name: plan.name || "Unknown Plan",
    priceGBP: plan.priceGBP || 0,
    isActive: plan.isActive,
    companies: Math.max(0, companiesDelta),
  });
}

export async function adjustGlobalInventoryCompanyPlan(
  ctx: InventoryRollupCtx,
  args: { previousPlan?: Doc<"plans"> | null; nextPlan?: Doc<"plans"> | null; companiesDelta?: number }
) {
  const rollup = await ensureGlobalInventoryRollup(ctx);
  const planInventory = rollup.planInventory.map((plan) => ({ ...plan }));
  const companiesDelta = args.companiesDelta ?? 0;

  if (companiesDelta !== 0) {
    await ctx.db.patch(rollup._id, {
      totalProvisionedCompanies: Math.max(0, rollup.totalProvisionedCompanies + companiesDelta),
      updatedAt: Date.now(),
    });
  }

  if (args.previousPlan) {
    upsertPlanInventoryEntry(planInventory, args.previousPlan, -1);
  }

  if (args.nextPlan) {
    upsertPlanInventoryEntry(planInventory, args.nextPlan, 1);
  }

  if (!args.previousPlan && !args.nextPlan) return;

  const normalizedPlanInventory = normalizePlanInventory(planInventory);
  await ctx.db.patch(rollup._id, {
    planInventory: normalizedPlanInventory,
    mrr: recalculateMrr(normalizedPlanInventory),
    updatedAt: Date.now(),
  });
}

export async function upsertGlobalInventoryPlan(ctx: InventoryRollupCtx, plan: Doc<"plans">) {
  const rollup = await ensureGlobalInventoryRollup(ctx);
  const planInventory = rollup.planInventory.map((entry) => ({ ...entry }));
  const existing = planInventory.find((entry) => entry.planId === planIdToString(plan._id));

  if (existing) {
    existing.name = plan.name || "Unknown Plan";
    existing.priceGBP = plan.priceGBP || 0;
    existing.isActive = plan.isActive;
  } else {
    planInventory.push({
      planId: planIdToString(plan._id),
      name: plan.name || "Unknown Plan",
      priceGBP: plan.priceGBP || 0,
      isActive: plan.isActive,
      companies: 0,
    });
  }

  const normalizedPlanInventory = normalizePlanInventory(planInventory);
  await ctx.db.patch(rollup._id, {
    planInventory: normalizedPlanInventory,
    mrr: recalculateMrr(normalizedPlanInventory),
    updatedAt: Date.now(),
  });
}

export async function removeGlobalInventoryPlan(ctx: InventoryRollupCtx, planId: Id<"plans">) {
  const rollup = await ensureGlobalInventoryRollup(ctx);
  const planInventory = rollup.planInventory.filter((entry) => entry.planId !== planIdToString(planId));

  await ctx.db.patch(rollup._id, {
    planInventory,
    mrr: recalculateMrr(planInventory),
    updatedAt: Date.now(),
  });
}

export async function replaceGlobalInventoryRollup(
  ctx: InventoryRollupCtx,
  args: {
    totalProvisionedUsers: number;
    totalProvisionedCompanies: number;
    planInventory: PlanInventoryEntry[];
  }
) {
  const rollup = await ensureGlobalInventoryRollup(ctx);
  const planInventory = normalizePlanInventory(args.planInventory);

  await ctx.db.patch(rollup._id, {
    totalProvisionedUsers: args.totalProvisionedUsers,
    totalProvisionedCompanies: args.totalProvisionedCompanies,
    planInventory,
    mrr: recalculateMrr(planInventory),
    updatedAt: Date.now(),
  });
}
