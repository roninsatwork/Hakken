import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * The migration road (one-brain-plan.md, phase 1): each company memory
 * moves to its one right home. Knowledge goes to the wiki as a pinned
 * correction; behaviour (an ALWAYS memory) goes to the rules, where it
 * stays exactly as strong. Memories are archived, never deleted — their
 * history and usage stats stay walkable — and every move leaves an audit
 * row naming what moved where.
 *
 * The model-judged page matching lives in memoryMigrationActions.ts;
 * everything here is mechanical and idempotent.
 */

export const ABOUT_PAGE_SUBJECT = "about-this-company";

/** What still has to move, and what blocks the stamp. */
export const getMigrationStateInternal = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (
    ctx,
    args
  ): Promise<{
    memories: Array<{
      memoryId: Id<"companyMemories">;
      title: string;
      content: string;
      applyMode: "ALWAYS" | "WHEN_RELEVANT";
    }>;
    pendingCandidates: number;
    alreadyStamped: boolean;
  }> => {
    const company = await ctx.db.get(args.companyId);
    const approved = await ctx.db
      .query("companyMemories")
      .withIndex("by_company_status_updated", (q) =>
        q.eq("companyId", args.companyId).eq("status", "APPROVED")
      )
      .take(500);
    const pending = await ctx.db
      .query("companyMemoryCandidates")
      .withIndex("by_company_status_created", (q) =>
        q.eq("companyId", args.companyId).eq("status", "PROPOSED")
      )
      .take(200);
    return {
      memories: approved.map((memory) => ({
        memoryId: memory._id,
        title: memory.title,
        content: memory.content,
        applyMode: memory.applyMode ?? "WHEN_RELEVANT",
      })),
      pendingCandidates: pending.length,
      alreadyStamped: Boolean(company?.memoriesMigratedAt),
    };
  },
});

/** The catch-all page for facts that fit nowhere better: mechanical,
 * created once, never model-written. */
export const ensureAboutPageInternal = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_kind_subject", (q) =>
        q.eq("companyId", args.companyId).eq("kind", "POLICY").eq("subjectKey", ABOUT_PAGE_SUBJECT)
      )
      .unique();
    if (existing) return;
    const now = Date.now();
    await ctx.db.insert("wikiPages", {
      companyId: args.companyId,
      kind: "POLICY",
      subjectKey: ABOUT_PAGE_SUBJECT,
      title: "About this company",
      content:
        "Facts about this company that people have pinned. The pins below are human truth: Sonae must always respect them and can never rewrite them.",
      links: [],
      pinnedCorrections: [],
      rewriteCount: 1,
      lastRewriteSource: "TENDING",
      createdAt: now,
      updatedAt: now,
    });
  },
});

const moveTarget = v.union(
  v.object({
    kind: v.literal("PIN"),
    pageKind: v.union(v.literal("PRODUCT"), v.literal("POLICY"), v.literal("ISSUE")),
    subjectKey: v.string(),
  }),
  v.object({ kind: v.literal("RULE") })
);

/**
 * One memory's move, whole and idempotent: the pin or rule lands, the
 * memory is archived, and one audit row records the journey. A memory
 * already archived is a move already made — nothing happens twice.
 */
export const applyMigrationMoveInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    memoryId: v.id("companyMemories"),
    target: moveTarget,
  },
  handler: async (
    ctx,
    args
  ): Promise<{ moved: boolean; landedOn: string }> => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.companyId !== args.companyId) {
      return { moved: false, landedOn: "not found" };
    }
    if (memory.status === "ARCHIVED") return { moved: false, landedOn: "already moved" };

    const now = Date.now();
    let landedOn: string;

    if (args.target.kind === "RULE") {
      // Behaviour keeps full strength: rules reach every answer, exactly
      // as an ALWAYS memory did (one-brain-plan.md, the sorting rule).
      await ctx.db.insert("aiRules", {
        companyId: args.companyId,
        name: memory.title.slice(0, 120),
        trigger: "Always — applies to every answer (moved from Memory)",
        instruction: memory.content,
        priority: "NORMAL",
        isActive: true,
        createdAt: now,
      });
      landedOn = "rule";
    } else {
      const page = await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q
            .eq("companyId", args.companyId)
            .eq("kind", (args.target as { pageKind: "PRODUCT" | "POLICY" | "ISSUE" }).pageKind)
            .eq("subjectKey", (args.target as { subjectKey: string }).subjectKey)
        )
        .unique();
      if (!page) return { moved: false, landedOn: "page not found" };
      // A memory whose title merely repeats its content pins once, not
      // twice — "X: X" read like a stutter on the page.
      const text = (
        memory.content.trim().startsWith(memory.title.trim().replace(/[.:]$/, ""))
          ? memory.content.trim()
          : `${memory.title}: ${memory.content}`
      ).slice(0, 500);
      // The same pin a person would make from the page screen: no user id
      // on the pin itself, attribution in the audit trail.
      if (!page.pinnedCorrections.some((pin) => pin.text === text)) {
        await ctx.db.patch(page._id, {
          pinnedCorrections: [...page.pinnedCorrections, { text, pinnedAt: now }],
          updatedAt: now,
        });
      }
      landedOn = `${page.kind}:${page.subjectKey}`;
    }

    await ctx.db.patch(memory._id, {
      status: "ARCHIVED",
      archivedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actionType: "MEMORY_MIGRATED_TO_WIKI",
      entityId: memory._id.toString(),
      entityType: "companyMemories",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        title: memory.title.slice(0, 120),
        applyMode: memory.applyMode ?? "WHEN_RELEVANT",
        landedOn,
      }),
    });
    return { moved: true, landedOn };
  },
});

/**
 * The stamp that phase 2 reads. Refused while anything still waits — an
 * unmoved memory or an undecided suggestion — so the runtime can never
 * stop reading a shelf that still holds something.
 */
export const stampMigrationInternal = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<{ stamped: boolean; reason: string }> => {
    const approved = await ctx.db
      .query("companyMemories")
      .withIndex("by_company_status_updated", (q) =>
        q.eq("companyId", args.companyId).eq("status", "APPROVED")
      )
      .first();
    if (approved) return { stamped: false, reason: "memories still waiting to move" };
    const pending = await ctx.db
      .query("companyMemoryCandidates")
      .withIndex("by_company_status_created", (q) =>
        q.eq("companyId", args.companyId).eq("status", "PROPOSED")
      )
      .first();
    if (pending) return { stamped: false, reason: "suggestions still waiting for a decision" };
    const company = await ctx.db.get(args.companyId);
    if (!company) return { stamped: false, reason: "company not found" };
    if (company.memoriesMigratedAt) return { stamped: true, reason: "already stamped" };
    const now = Date.now();
    await ctx.db.patch(args.companyId, { memoriesMigratedAt: now });
    await ctx.db.insert("auditLogs", {
      actionType: "MEMORY_MIGRATION_COMPLETE",
      entityId: args.companyId.toString(),
      entityType: "companies",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({}),
    });
    return { stamped: true, reason: "stamped" };
  },
});
