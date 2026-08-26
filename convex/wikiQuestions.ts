import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { adminMutation, adminQuery, moduleQuery } from "./tenantFunctions";
import { CORE_MODULES } from "./utils/coreModules";
import { assertAdminCanAccessCompany, getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";

/**
 * Open questions (wiki-agents plan, phases 1-2): the staff's findings, for
 * people to settle. The machine's ceiling is raising a question; the doors
 * here are how a person sees and closes them — or how the sweep closes
 * them itself when the pages have changed and the claim no longer stands.
 */

export const raiseQuestionInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    kind: v.union(v.literal("CONTRADICTION"), v.literal("FRESHNESS"), v.literal("CORRECTION")),
    pageKeyA: v.string(),
    claimA: v.string(),
    pageKeyB: v.optional(v.string()),
    claimB: v.optional(v.string()),
    detail: v.optional(v.string()),
    dedupeKey: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    // The same disagreement is raised once, however many nights it stands.
    const existing = await ctx.db
      .query("wikiOpenQuestions")
      .withIndex("by_company_dedupe", (q) =>
        q.eq("companyId", args.companyId).eq("dedupeKey", args.dedupeKey)
      )
      .first();
    if (existing) return false;
    const questionId = await ctx.db.insert("wikiOpenQuestions", {
      companyId: args.companyId,
      kind: args.kind,
      pageKeyA: args.pageKeyA,
      claimA: args.claimA.slice(0, 300),
      ...(args.pageKeyB ? { pageKeyB: args.pageKeyB } : {}),
      ...(args.claimB ? { claimB: args.claimB.slice(0, 300) } : {}),
      ...(args.detail ? { detail: args.detail.slice(0, 500) } : {}),
      dedupeKey: args.dedupeKey,
      status: "OPEN",
      raisedAt: Date.now(),
    });
    await ctx.db.insert("auditLogs", {
      actionType: "WIKI_QUESTION_RAISED",
      entityId: questionId.toString(),
      entityType: "wikiOpenQuestions",
      companyId: args.companyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ kind: args.kind, pageKeyA: args.pageKeyA, pageKeyB: args.pageKeyB ?? null }),
    });
    return true;
  },
});

/** The sweep closes questions the pages have already answered: a claim no
 * longer present in its page is a disagreement someone settled by editing. */
export const autoResolveStaleQuestionsInternal = internalMutation({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args): Promise<number> => {
    const open = await ctx.db
      .query("wikiOpenQuestions")
      .withIndex("by_company_status", (q) =>
        q.eq("companyId", args.companyId).eq("status", "OPEN")
      )
      .take(100);
    let resolved = 0;
    for (const question of open) {
      const claimStands = async (pageKey: string, claim: string): Promise<boolean> => {
        const separator = pageKey.indexOf(":");
        if (separator <= 0) return false;
        const page = await ctx.db
          .query("wikiPages")
          .withIndex("by_company_kind_subject", (q) =>
            q
              .eq("companyId", args.companyId)
              .eq("kind", pageKey.slice(0, separator) as "PRODUCT" | "POLICY" | "ISSUE" | "GOAL" | "CUSTOMER" | "SOURCE")
              .eq("subjectKey", pageKey.slice(separator + 1))
          )
          .unique();
        if (!page) return false;
        // A loose containment check on a normalised prefix: enough to know
        // whether the quoted sentence survived the page's later rewrites.
        const needle = claim.toLowerCase().replace(/\s+/g, " ").slice(0, 60);
        return page.content.toLowerCase().replace(/\s+/g, " ").includes(needle);
      };
      const aStands = await claimStands(question.pageKeyA, question.claimA);
      const bStands = question.pageKeyB && question.claimB
        ? await claimStands(question.pageKeyB, question.claimB)
        : true;
      if (!aStands || !bStands) {
        await ctx.db.patch(question._id, { status: "RESOLVED", resolvedAt: Date.now() });
        resolved += 1;
      }
    }
    return resolved;
  },
});

/**
 * An open question as a person reads it: the two claims that disagree, the
 * pages they came from, and when it was raised.
 *
 * `dedupeKey` — the hash the nightly finder uses so the same disagreement is
 * not raised twice — and the resolution bookkeeping (`status`, `resolvedAt`,
 * `resolvedBy`) are the machine's own, and stay on the server. So does the
 * tenant id: a reader is already inside their own workspace.
 */
const openQuestionValidator = v.object({
  questionId: v.id("wikiOpenQuestions"),
  kind: v.union(v.literal("CONTRADICTION"), v.literal("FRESHNESS"), v.literal("CORRECTION")),
  pageKeyA: v.string(),
  claimA: v.string(),
  pageKeyB: v.union(v.string(), v.null()),
  claimB: v.union(v.string(), v.null()),
  detail: v.union(v.string(), v.null()),
  raisedAt: v.number(),
});

function questionForScreen(question: {
  _id: Id<"wikiOpenQuestions">;
  kind: "CONTRADICTION" | "FRESHNESS" | "CORRECTION";
  pageKeyA: string;
  claimA: string;
  pageKeyB?: string;
  claimB?: string;
  detail?: string;
  raisedAt: number;
}) {
  return {
    questionId: question._id,
    kind: question.kind,
    pageKeyA: question.pageKeyA,
    claimA: question.claimA,
    pageKeyB: question.pageKeyB ?? null,
    claimB: question.claimB ?? null,
    detail: question.detail ?? null,
    raisedAt: question.raisedAt,
  };
}

export const listOpenQuestions = moduleQuery({
  module: CORE_MODULES.wiki,
  args: {},
  returns: v.array(openQuestionValidator),
  handler: async (ctx) => {
    const { companyId } = ctx;
    if (!companyId) return [];
    const rows = await ctx.db
      .query("wikiOpenQuestions")
      .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "OPEN"))
      .order("desc")
      .take(50);
    return rows.map(questionForScreen);
  },
});

export const listOpenQuestionsForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const rows = await ctx.db
      .query("wikiOpenQuestions")
      .withIndex("by_company_status", (q) =>
        q.eq("companyId", args.companyId).eq("status", "OPEN")
      )
      .order("desc")
      .take(50);
    return rows.map(questionForScreen);
  },
});

export const listOpenQuestionsForGlobal = adminQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
    }
    const rows = await ctx.db
      .query("wikiOpenQuestions")
      .withIndex("by_company_status", (q) =>
        q.eq("companyId", undefined).eq("status", "OPEN")
      )
      .order("desc")
      .take(50);
    return rows.map(questionForScreen);
  },
});

export const dismissOpenQuestionForGlobal = adminMutation({
  args: { questionId: v.id("wikiOpenQuestions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (ctx.user.role !== "SUPER_ADMIN") {
      throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
    }
    await dismissCore(ctx, { companyId: undefined, userId: ctx.userId, ...args });
  },
});

async function dismissCore(
  ctx: import("./_generated/server").MutationCtx,
  args: {
    companyId: Id<"companies"> | undefined;
    userId: Id<"users">;
    questionId: Id<"wikiOpenQuestions">;
  }
): Promise<void> {
  const question = await ctx.db.get(args.questionId);
  if (!question || question.companyId !== args.companyId) throw appError("NOT_FOUND", "Question not found.");
  if (question.status !== "OPEN") return;
  await ctx.db.patch(question._id, {
    status: "DISMISSED",
    resolvedAt: Date.now(),
    resolvedBy: args.userId,
  });
  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: "WIKI_QUESTION_DISMISSED",
    entityId: question._id.toString(),
    entityType: "wikiOpenQuestions",
    companyId: args.companyId,
    timestamp: Date.now(),
    metadata: JSON.stringify({ kind: question.kind, pageKeyA: question.pageKeyA }),
  });
}

export const dismissOpenQuestion = adminMutation({
  args: { questionId: v.id("wikiOpenQuestions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NO_ACTIVE_COMPANY", "No workspace selected.");
    await dismissCore(ctx, { companyId, userId: ctx.userId, ...args });
  },
});

export const dismissOpenQuestionForCompany = adminMutation({
  args: { companyId: v.id("companies"), questionId: v.id("wikiOpenQuestions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    await dismissCore(ctx, { userId: ctx.userId, ...args });
  },
});

/** The finder's reading list: one kind's pages, bounded, hubs and source
 * notes excluded — synthesis pages are where contradictions bite. */
export const getContradictionClusterInternal = internalQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    kind: v.union(v.literal("PRODUCT"), v.literal("POLICY"), v.literal("ISSUE")),
  },
  handler: async (
    ctx,
    args
  ): Promise<Array<{ pageKey: string; excerpt: string }>> => {
    // Read off the kind index (wiki-scaling-note.md): the old 500-row
    // all-kinds window read every source note to find a dozen topic pages,
    // and lost whole kinds once the wiki outgrew the window.
    const pages = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_kind_subject", (q) =>
        q.eq("companyId", args.companyId).eq("kind", args.kind)
      )
      .take(20);
    return pages
      .filter((page) => !page.subjectKey.endsWith("-index"))
      .slice(0, 12)
      .map((page) => ({
        pageKey: `${page.kind}:${page.subjectKey}`,
        excerpt: page.content.slice(0, 700),
      }));
  },
});
