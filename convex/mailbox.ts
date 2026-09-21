import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { adminQuery } from "./tenantFunctions";
import * as governanceShapes from "./utils/governanceShapes";
import { assertAdminCanAccessCompany } from "./authz";
import { getDecision } from "./decisionRegistry";

/**
 * The admin's view of a company's handled mail (seven-gaps plan, phase 1).
 * The Gmail watcher has recorded every message it saw since day one —
 * sender, subject and what the AI decided, never body text (the same
 * restraint the audit trail shows) — but nothing ever read the table.
 * This is its screen's door.
 */
/** Runs read per email for the ledger; four Decisions ship today. */
const DECISIONS_PER_EMAIL = 8;

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
    /** Only mail on which a Decision was not sure — what the AI struggled with. */
    certainty: v.optional(v.literal("NOT_SURE")),
  },
  returns: governanceShapes.mailboxListShape,
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

    // The Decisions that ran on each email, by reference; a page holds at
    // most fifteen rows and an email at most a handful of runs.
    const withDecisions = await Promise.all(rows.map(async (row) => {
      const runs = await ctx.db
        .query("decisionRuns")
        .withIndex("by_subject", (q) => q.eq("subjectKind", "email").eq("subjectId", row.gmailMessageId))
        .take(DECISIONS_PER_EMAIL);
      return {
        _id: row._id,
        sender: row.sender,
        subject: row.subject,
        decision: row.decision,
        decisionReason: row.decisionReason,
        taskId: row.taskId,
        repliedAt: row.repliedAt,
        createdAt: row.createdAt,
        decisions: runs.map((run) => ({
          key: run.decisionKey,
          copyKey: getDecision(run.decisionKey)?.copyKey ?? run.decisionKey,
          answer: run.answer,
          ...(run.certainty ? { certainty: run.certainty } : {}),
          source: run.source,
          ...(run.probabilities ? { probabilities: run.probabilities } : {}),
        })),
      };
    }));

    return {
      ...page,
      page: args.certainty
        ? withDecisions.filter((row) => row.decisions.some((run) => run.certainty === args.certainty))
        : withDecisions,
    };
  },
});
