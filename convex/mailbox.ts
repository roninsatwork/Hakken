import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
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
  args: {
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
    decision: v.optional(
      v.union(
        v.literal("PENDING"),
        v.literal("REPLIED"),
        v.literal("TASK"),
        v.literal("SKIPPED")
      )
    ),
  },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const searchTerm = args.searchTerm?.trim();
    const page = searchTerm
      ? await ctx.db
        .query("mailboxMessages")
        .withSearchIndex("search_subject", (q) =>
          q.search("subject", searchTerm).eq("companyId", args.companyId)
        )
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("mailboxMessages")
        .withIndex("by_company_created", (q) => q.eq("companyId", args.companyId))
        .order("desc")
        .paginate(args.paginationOpts);

    const rows = args.decision
      ? page.page.filter((row) => row.decision === args.decision)
      : page.page;

    return {
      ...page,
      page: rows.map((row) => ({
        _id: row._id,
        sender: row.sender,
        subject: row.subject,
        decision: row.decision,
        decisionReason: row.decisionReason,
        taskId: row.taskId,
        repliedAt: row.repliedAt,
        createdAt: row.createdAt,
      })),
    };
  },
});
