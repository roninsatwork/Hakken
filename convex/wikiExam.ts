import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { WIKI_EXAM_QUESTIONS } from "./wikiExamService";

/**
 * The exam's default-runtime half (wiki-replaces-knowledge plan, stage
 * two): the record of each comparison run, and the permanent seeding of the
 * twenty questions into the AI Checks screen — so the exam outlives the
 * cutover and re-runs whenever the company's AI changes, keeping the wiki's
 * answers from quietly rotting.
 */

export const recordExamRunInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    chunksScore: v.number(),
    wikiScore: v.number(),
    total: v.number(),
    wikiPasses: v.boolean(),
    detailJson: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.insert("auditLogs", {
      actionType: "WIKI_EXAM_RUN",
      entityType: "companies",
      entityId: args.companyId.toString(),
      companyId: args.companyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({
        chunksScore: args.chunksScore,
        wikiScore: args.wikiScore,
        total: args.total,
        wikiPasses: args.wikiPasses,
        detail: args.detailJson,
      }),
    });
  },
});

/** Idempotent by name: correcting a question in wikiExamService.ts and
 * re-seeding updates the case rather than duplicating it. */
export const seedWikiExamCasesInternal = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<{ created: number; updated: number }> => {
    const now = Date.now();
    let created = 0;
    let updated = 0;
    for (const question of WIKI_EXAM_QUESTIONS) {
      const name = `Wiki exam — ${question.key}`;
      const existing = (
        await ctx.db
          .query("companyEvalCases")
          .withIndex("by_company_surface", (q) =>
            q.eq("companyId", args.companyId).eq("targetSurface", "COMPANY_CHAT")
          )
          .take(200)
      ).find((row) => row.name === name);

      const fields = {
        severity: question.severity,
        prompt: question.prompt,
        expectedBehavior: question.expectedBehavior,
        ...(question.forbiddenClaims.length
          ? { forbiddenClaimsJson: JSON.stringify(question.forbiddenClaims) }
          : {}),
        status: "ACTIVE" as const,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, fields);
        updated += 1;
      } else {
        await ctx.db.insert("companyEvalCases", {
          companyId: args.companyId,
          name,
          targetSurface: "COMPANY_CHAT",
          createdAt: now,
          ...fields,
        });
        created += 1;
      }
    }
    return { created, updated };
  },
});
