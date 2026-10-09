import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";

/**
 * Which of Discovery's new kinds of data a company buys on its schedule
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, D16). Anthony,
 * 2026-10-09: "hold until I say" — per company and per part, on the
 * company's Collection schedule screen. Every part starts off: a part that is
 * off is not planned for the company on any run, and a button that would buy
 * it (Find, on Your listings) says so rather than buying.
 */

export const COLLECTION_PARTS = ["local", "reviews", "aiApps", "aiDemand", "brandRadar", "webMentions"] as const;
export type CollectionPart = (typeof COLLECTION_PARTS)[number];
export type CollectionParts = Record<CollectionPart, boolean>;

const partsShape = v.object({
  local: v.boolean(),
  reviews: v.boolean(),
  aiApps: v.boolean(),
  aiDemand: v.boolean(),
  brandRadar: v.boolean(),
  webMentions: v.boolean(),
});

type Reader = { db: QueryCtx["db"] };

/** A company's parts: each on only where it was switched on. */
export async function readCollectionParts(ctx: Reader, companyId: Id<"companies">): Promise<CollectionParts> {
  const row = await ctx.db.query("collectionParts").withIndex("by_company", (q) => q.eq("companyId", companyId)).unique();
  return Object.fromEntries(COLLECTION_PARTS.map((part) => [part, row?.[part] === true])) as CollectionParts;
}

export async function partIsOn(ctx: Reader, companyId: Id<"companies">, part: CollectionPart): Promise<boolean> {
  return (await readCollectionParts(ctx, companyId))[part];
}

export const getCollectionParts = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: partsShape,
  handler: async (ctx, args) => await readCollectionParts(ctx, args.companyId),
});

/** Switch a company's parts on or off; the change is in the audit log. */
export const setCollectionParts = superAdminMutation({
  args: { companyId: v.id("companies"), parts: partsShape },
  returns: v.null(),
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw appError("NOT_FOUND", "Company not found.");
    const before = await readCollectionParts(ctx, args.companyId);
    const changes = COLLECTION_PARTS.filter((part) => before[part] !== args.parts[part]);
    if (changes.length === 0) return null;
    const row = await ctx.db.query("collectionParts").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).unique();
    const fields = { companyId: args.companyId, ...args.parts, updatedAt: Date.now() };
    if (row) await ctx.db.replace(row._id, fields);
    else await ctx.db.insert("collectionParts", fields);
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "COLLECTION_PARTS_CHANGED",
      entityType: "companies",
      entityId: args.companyId,
      companyId: args.companyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ company: company.name, changes: Object.fromEntries(changes.map((part) => [part, args.parts[part]])) }),
    });
    return null;
  },
});
