import type { Id } from "@/convex/_generated/dataModel";
import type { MutationCtx } from "@/convex/_generated/server";

/**
 * The hold a test's list row belongs to: a company holding the website as one
 * of its own, found or made. Every search and question names its company's
 * hold (docs/plans/active/private-tracking-lists-plan.md); a test of the
 * writers, which read every company's rows, only needs there to be one.
 */
export async function listOwnerOf(ctx: Pick<MutationCtx, "db">, websiteId: Id<"websites">): Promise<Id<"companyWebsites">> {
  const held = (await ctx.db.query("companyWebsites").withIndex("by_website", (q) => q.eq("websiteId", websiteId)).collect())
    .find((hold) => hold.relationship !== "TRACKED");
  if (held) return held._id;
  const companyId = await ctx.db.insert("companies", { name: "Owner", createdAt: Date.now() });
  return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
}
