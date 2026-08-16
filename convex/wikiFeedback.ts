import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { adminMutation, adminQuery, superAdminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import {
  displayQuestion,
  isSubstantiveQuestion,
  questionKey,
} from "./wikiFeedbackService";

/**
 * The loop's bookkeeping (closing-the-loop-plan.md, phases 1–2): one
 * mutation records what every answer meant — pages under it bump their
 * tallies and close any matching gap; no pages under it logs the gap.
 * Scheduled after the reply, never awaited by it, and entirely
 * mechanical: nothing here costs a model call.
 */

async function bumpDayTally(
  ctx: { db: import("./_generated/server").MutationCtx["db"] },
  companyId: import("./_generated/dataModel").Id<"companies">,
  outcome: "answered" | "unanswered"
): Promise<void> {
  const dayKey = new Date().toISOString().slice(0, 10);
  const row = await ctx.db
    .query("wikiAnswerTallies")
    .withIndex("by_company_day", (q) => q.eq("companyId", companyId).eq("dayKey", dayKey))
    .unique();
  if (row) {
    await ctx.db.patch(row._id, { [outcome]: row[outcome] + 1 });
  } else {
    await ctx.db.insert("wikiAnswerTallies", {
      companyId,
      dayKey,
      answered: outcome === "answered" ? 1 : 0,
      unanswered: outcome === "unanswered" ? 1 : 0,
    });
  }
}

export const recordAnswerOutcomeInternal = internalMutation({
  args: {
    /** Absent for the global AI's own conversations (the platform widget,
     * platform checks) — pure global-brain answers. */
    companyId: v.optional(v.id("companies")),
    question: v.string(),
    /** The wiki pages the answer stood on; global/-prefixed keys are the
     * platform shelf's. Empty means the wiki had nothing. */
    pageKeys: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    if (args.companyId) {
      await bumpDayTally(ctx, args.companyId, args.pageKeys.length > 0 ? "answered" : "unanswered");
    }

    if (args.pageKeys.length > 0) {
      // The pages that carried the answer get their marks (phase 2).
      for (const rawKey of args.pageKeys.slice(0, 8)) {
        const isGlobal = rawKey.startsWith("global/");
        const key = isGlobal ? rawKey.slice("global/".length) : rawKey;
        const separator = key.indexOf(":");
        if (separator <= 0) continue;
        const kind = key.slice(0, separator);
        if (!["CUSTOMER", "PRODUCT", "POLICY", "ISSUE", "SOURCE"].includes(kind)) continue;
        const page = await ctx.db
          .query("wikiPages")
          .withIndex("by_company_kind_subject", (q) =>
            q
              .eq("companyId", isGlobal ? undefined : args.companyId)
              .eq("kind", kind as "CUSTOMER" | "PRODUCT" | "POLICY" | "ISSUE" | "SOURCE")
              .eq("subjectKey", key.slice(separator + 1))
          )
          .unique();
        if (!page) continue;
        await ctx.db.patch(page._id, {
          usageCount: (page.usageCount ?? 0) + 1,
          lastUsedAt: now,
        });
      }

      // An answered asking closes the gap a failed one opened (phase 1):
      // the row resolves itself, no button pressed. An answer that stood
      // on a platform page also closes the platform's matching row — the
      // global brain evidently covers it now (Anthony's routing rule).
      const key = questionKey(args.question);
      if (key) {
        const scopes: Array<Id<"companies"> | undefined> = [];
        if (args.companyId) scopes.push(args.companyId);
        if (!args.companyId || args.pageKeys.some((k) => k.startsWith("global/"))) {
          scopes.push(undefined);
        }
        for (const scope of scopes) {
          const open = await ctx.db
            .query("wikiUnansweredQuestions")
            .withIndex("by_company_key", (q) =>
              q.eq("companyId", scope).eq("normalizedKey", key)
            )
            .unique();
          if (open && open.status === "OPEN") {
            await ctx.db.patch(open._id, { status: "RESOLVED", resolvedAt: now });
          }
        }
      }
      return;
    }

    // No pages under the answer: the gap is logged, once, and counted on
    // repeats. WHOSE gap it is follows Anthony's routing rule
    // (2026-08-17): a company with pages of its own owns its misses; a
    // company whose wiki is empty was answering purely from the global
    // brain, so the miss strengthens the global knowledge — one platform
    // row, counting the companies that hit it, fixed once for everyone.
    // The global AI's own conversations go straight to the platform row.
    if (!isSubstantiveQuestion(args.question)) return;
    const key = questionKey(args.question);
    if (!key) return;

    let scope: Id<"companies"> | undefined = args.companyId;
    if (args.companyId) {
      const hasOwnPages = await ctx.db
        .query("wikiPages")
        .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
        .first();
      if (!hasOwnPages) scope = undefined;
    }

    const existing = await ctx.db
      .query("wikiUnansweredQuestions")
      .withIndex("by_company_key", (q) => q.eq("companyId", scope).eq("normalizedKey", key))
      .unique();

    // Platform rows count distinct asking companies, capped, never shown
    // by name on screen.
    const mergeCompanies = (json: string | undefined): string | undefined => {
      if (scope !== undefined || !args.companyId) return json;
      const list: string[] = json ? (JSON.parse(json) as string[]) : [];
      const id = args.companyId.toString();
      if (!list.includes(id) && list.length < 100) list.push(id);
      return JSON.stringify(list);
    };

    if (!existing) {
      await ctx.db.insert("wikiUnansweredQuestions", {
        ...(scope ? { companyId: scope } : {}),
        question: displayQuestion(args.question),
        normalizedKey: key,
        askCount: 1,
        ...(scope === undefined && args.companyId
          ? { companiesJson: JSON.stringify([args.companyId.toString()]) }
          : {}),
        status: "OPEN",
        firstAskedAt: now,
        lastAskedAt: now,
      });
      return;
    }
    if (existing.status === "DISMISSED") {
      await ctx.db.patch(existing._id, {
        askCount: existing.askCount + 1,
        lastAskedAt: now,
        ...(scope === undefined ? { companiesJson: mergeCompanies(existing.companiesJson) } : {}),
      });
      return;
    }
    await ctx.db.patch(existing._id, {
      askCount: existing.askCount + 1,
      lastAskedAt: now,
      status: "OPEN",
      resolvedAt: undefined,
      ...(scope === undefined ? { companiesJson: mergeCompanies(existing.companiesJson) } : {}),
    });
  },
});

/** The panel's read: open gaps, most recently asked first. */
export const listUnansweredForCompany = adminQuery({
  args: {
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const needle = args.search?.trim();
    // Searched and paged in the query. This list is real demand and only
    // grows, so the browser must never be handed the whole of it.
    const page = needle
      ? await ctx.db
        .query("wikiUnansweredQuestions")
        .withSearchIndex("search_question", (q) =>
          q.search("question", needle).eq("status", "OPEN").eq("companyId", args.companyId)
        )
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("wikiUnansweredQuestions")
        .withIndex("by_company_status_asked", (q) =>
          q.eq("companyId", args.companyId).eq("status", "OPEN")
        )
        .order("desc")
        .paginate(args.paginationOpts);

    return {
      ...page,
      page: page.page.map((row) => ({
        unansweredId: row._id,
        question: row.question,
        askCount: row.askCount,
        lastAskedAt: row.lastAskedAt,
        companyId: row.companyId ?? null,
        companyName: null as string | null,
        companyCount: 0,
      })),
    };
  },
});

/**
 * The dedicated screen's read (Anthony's ruling, 2026-08-17: "a
 * dedicated screen, with unanswered questions across company and
 * global"): every open gap on the platform, each row naming where it
 * lives — a company by name, or the platform itself. Super-admin
 * console only, where every company is already visible.
 */
export const listAllUnanswered = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    scope: v.optional(v.union(v.literal("ALL"), v.literal("PLATFORM"), v.literal("COMPANIES"))),
  },
  handler: async (ctx, args) => {
    const needle = args.search?.trim();
    // Searched and paged where the rows live. This used to take five hundred
    // rows and sift them in the browser, which quietly capped the screen and
    // grew more expensive with every gap the platform recorded.
    const page = needle
      ? await ctx.db
        .query("wikiUnansweredQuestions")
        .withSearchIndex("search_question", (q) =>
          q.search("question", needle).eq("status", "OPEN")
        )
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("wikiUnansweredQuestions")
        .withIndex("by_status_asked", (q) => q.eq("status", "OPEN"))
        .order("desc")
        .paginate(args.paginationOpts);

    const scope = args.scope ?? "ALL";
    const companyNames = new Map<string, string>();
    const rows = [];
    for (const row of page.page) {
      if (scope === "PLATFORM" && row.companyId) continue;
      if (scope === "COMPANIES" && !row.companyId) continue;
      let companyName: string | null = null;
      if (row.companyId) {
        const key = row.companyId.toString();
        if (!companyNames.has(key)) {
          const company = await ctx.db.get(row.companyId);
          companyNames.set(key, company?.name ?? "Unknown company");
        }
        companyName = companyNames.get(key) ?? null;
      }
      rows.push({
        unansweredId: row._id,
        question: row.question,
        askCount: row.askCount,
        lastAskedAt: row.lastAskedAt,
        companyId: row.companyId ?? null,
        companyName,
        companyCount: row.companiesJson
          ? (JSON.parse(row.companiesJson) as string[]).length
          : 0,
      });
    }
    return { ...page, page: rows };
  },
});

/** The platform's gap list: super admins alone, companies counted never
 * named (Anthony's routing rule, 2026-08-17). */
export const listUnansweredForGlobal = adminQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw new Error("Unauthorized access to the platform wiki");
    }
    const rows = await ctx.db
      .query("wikiUnansweredQuestions")
      .withIndex("by_company_status_asked", (q) =>
        q.eq("companyId", undefined).eq("status", "OPEN")
      )
      .order("desc")
      .take(50);
    return rows
      .sort((a, b) => b.askCount - a.askCount || b.lastAskedAt - a.lastAskedAt)
      .map((row) => ({
        unansweredId: row._id,
        question: row.question,
        askCount: row.askCount,
        companyCount: row.companiesJson ? (JSON.parse(row.companiesJson) as string[]).length : 0,
        lastAskedAt: row.lastAskedAt,
      }));
  },
});

export const dismissUnansweredForGlobal = adminMutation({
  args: { unansweredId: v.id("wikiUnansweredQuestions") },
  handler: async (ctx, args) => {
    if (ctx.user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized access to the platform wiki");
    }
    const row = await ctx.db.get(args.unansweredId);
    if (!row || row.companyId !== undefined) throw new Error("Question not found.");
    if (row.status !== "OPEN") return;
    await ctx.db.patch(row._id, { status: "DISMISSED" });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "WIKI_UNANSWERED_DISMISSED",
      entityId: row._id.toString(),
      entityType: "wikiUnansweredQuestions",
      timestamp: Date.now(),
      metadata: JSON.stringify({ question: row.question.slice(0, 120), askCount: row.askCount }),
    });
  },
});

/** Not worth covering — a person's call, audited like every other. */
export const dismissUnansweredForCompany = adminMutation({
  args: { companyId: v.id("companies"), unansweredId: v.id("wikiUnansweredQuestions") },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const row = await ctx.db.get(args.unansweredId);
    if (!row || row.companyId !== args.companyId) throw new Error("Question not found.");
    if (row.status !== "OPEN") return;
    const now = Date.now();
    await ctx.db.patch(row._id, { status: "DISMISSED" });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "WIKI_UNANSWERED_DISMISSED",
      entityId: row._id.toString(),
      entityType: "wikiUnansweredQuestions",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({ question: row.question.slice(0, 120), askCount: row.askCount }),
    });
  },
});
