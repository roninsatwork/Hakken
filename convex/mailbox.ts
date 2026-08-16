import { v } from "convex/values";
import { adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";

/**
 * The admin's view of a company's handled mail (seven-gaps plan, phase 1).
 * The Gmail watcher has recorded every message it saw since day one —
 * sender, subject and what the AI decided, never body text (the same
 * restraint the audit trail shows) — but nothing ever read the table.
 * This is its screen's door.
 */
export const listMailboxForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const rows = await ctx.db
      .query("mailboxMessages")
      .withIndex("by_company_created", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .take(200);
    return rows.map((row) => ({
      _id: row._id,
      sender: row.sender,
      subject: row.subject,
      decision: row.decision,
      decisionReason: row.decisionReason,
      taskId: row.taskId,
      repliedAt: row.repliedAt,
      createdAt: row.createdAt,
    }));
  },
});
