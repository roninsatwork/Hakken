import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { adminMutation, adminQuery, superAdminQuery } from "./tenantFunctions";
import * as platformShapes from "./utils/platformShapes";
import { assertAdminCanAccessCompany } from "./authz";
import {
  displayQuestion,
  isSubstantiveQuestion,
  questionKey,
} from "./wikiFeedbackService";
import { appError } from "./utils/appError";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";

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
        if (!["CUSTOMER", "PRODUCT", "POLICY", "ISSUE", "CLIENT", "SOURCE"].includes(kind)) continue;
        const page = await ctx.db
          .query("wikiPages")
          .withIndex("by_company_kind_subject", (q) =>
            q
              .eq("companyId", isGlobal ? undefined : args.companyId)
              .eq("kind", kind as "CUSTOMER" | "PRODUCT" | "POLICY" | "ISSUE" | "CLIENT" | "SOURCE")
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
      // the row resolves itself, no button pressed. Each side closes only
      // its own rows: a company's asking never touches the platform's list
      // (Anthony, 2026-11-12 — see logGap).
      const key = questionKey(args.question);
      if (key) {
        const open = await ctx.db
          .query("wikiUnansweredQuestions")
          .withIndex("by_company_key", (q) =>
            q.eq("companyId", args.companyId).eq("normalizedKey", key)
          )
          .unique();
        if (open && open.status === "OPEN") {
          await ctx.db.patch(open._id, { status: "RESOLVED", resolvedAt: now });
        }
      }
      return;
    }

    // No pages under the answer: the gap is logged, once, and counted on
    // repeats, always under the company that asked (see logGap). The
    // global AI's own conversations go to the platform row. Whether this
    // is a real question is the greeting-list rule's call,
    // and the Decision's (decisions-typesafe-plan.md, Phase F.4) once this
    // write is done: it judges after the fact and corrects the list when it
    // is sure the rule was wrong either way.
    const ruleSaysReal = isSubstantiveQuestion(args.question);
    await ctx.scheduler.runAfter(0, internal.wikiFeedbackActions.judgeUnansweredQuestion, {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      question: args.question,
      ruleSaysReal,
    });
    if (!ruleSaysReal) return;
    await logGap(ctx, { companyId: args.companyId, question: args.question, now });
  },
});

/**
 * The gap, logged once and counted on repeats, under the company that asked.
 *
 * A company's question is that company's data and never leaves it (Anthony,
 * 2026-11-12). This replaces the 2026-08-17 routing rule, which sent the
 * misses of a company with an empty wiki to the platform's list: the
 * platform check-up then searched the web for one company's question and
 * filed the result on the shared shelf, where every company's answers could
 * read it. Do not restore it. Only the global AI's own conversations (no
 * company) log to the platform's list.
 */
async function logGap(
  ctx: MutationCtx,
  args: { companyId?: Id<"companies">; question: string; now: number },
): Promise<void> {
    const now = args.now;
    const key = questionKey(args.question);
    if (!key) return;
    const scope = args.companyId;

    const existing = await ctx.db
      .query("wikiUnansweredQuestions")
      .withIndex("by_company_key", (q) => q.eq("companyId", scope).eq("normalizedKey", key))
      .unique();

    if (!existing) {
      await ctx.db.insert("wikiUnansweredQuestions", {
        ...(scope ? { companyId: scope } : {}),
        question: displayQuestion(args.question),
        normalizedKey: key,
        askCount: 1,
        status: "OPEN",
        firstAskedAt: now,
        lastAskedAt: now,
      });
      return;
    }
    if (existing.status === "DISMISSED") {
      await ctx.db.patch(existing._id, { askCount: existing.askCount + 1, lastAskedAt: now });
      return;
    }
    await ctx.db.patch(existing._id, {
      askCount: existing.askCount + 1,
      lastAskedAt: now,
      status: "OPEN",
      resolvedAt: undefined,
    });
}

/**
 * One-off clean-up (Anthony, 2026-11-12): send every company question the
 * retired routing rule filed on the platform's list back to the company that
 * asked it, merged into that company's own row, then take it off the
 * platform's list. Run from the command line by the operator.
 */
export const returnCompanyQuestionsHomeInternal = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ moved: number; checked: number }> => {
    const platformRows = await ctx.db
      .query("wikiUnansweredQuestions")
      .withIndex("by_company_key", (q) => q.eq("companyId", undefined))
      .take(500);
    let moved = 0;
    for (const row of platformRows) {
      if (!row.companiesJson) continue;
      const companyIds = (JSON.parse(row.companiesJson) as string[])
        .map((id) => ctx.db.normalizeId("companies", id))
        .filter((id): id is Id<"companies"> => id !== null);
      for (const companyId of companyIds) {
        const own = await ctx.db
          .query("wikiUnansweredQuestions")
          .withIndex("by_company_key", (q) => q.eq("companyId", companyId).eq("normalizedKey", row.normalizedKey))
          .unique();
        if (own) {
          await ctx.db.patch(own._id, {
            askCount: own.askCount + row.askCount,
            lastAskedAt: Math.max(own.lastAskedAt, row.lastAskedAt),
          });
        } else {
          await ctx.db.insert("wikiUnansweredQuestions", {
            companyId,
            question: row.question,
            normalizedKey: row.normalizedKey,
            askCount: row.askCount,
            status: row.status,
            firstAskedAt: row.firstAskedAt,
            lastAskedAt: row.lastAskedAt,
            ...(row.resolvedAt ? { resolvedAt: row.resolvedAt } : {}),
          });
        }
      }
      await ctx.db.delete(row._id);
      await ctx.db.insert("auditLogs", {
        actionType: "WIKI_UNANSWERED_RETURNED",
        entityId: row._id.toString(),
        entityType: "wikiUnansweredQuestions",
        timestamp: Date.now(),
        metadata: JSON.stringify({ companies: companyIds.length }),
      });
      moved += 1;
    }
    return { moved, checked: platformRows.length };
  },
});

/**
 * The real-question Decision's correction, when it is sure the rule was
 * wrong: a real question the rule dropped is logged; a non-question the
 * rule logged is dismissed.
 */
export const recordJudgedGapInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    question: v.string(),
    real: v.boolean(),
  },
  handler: async (ctx, args): Promise<void> => {
    if (args.real) {
      await logGap(ctx, { companyId: args.companyId, question: args.question, now: Date.now() });
      return;
    }
    const key = questionKey(args.question);
    if (!key) return;
    // Only the asker's own list: a company's question never touches the
    // platform's (see logGap).
    const existing = await ctx.db
      .query("wikiUnansweredQuestions")
      .withIndex("by_company_key", (q) => q.eq("companyId", args.companyId).eq("normalizedKey", key))
      .unique();
    if (existing && existing.status === "OPEN") {
      await ctx.db.patch(existing._id, { status: "DISMISSED", resolvedAt: Date.now() });
    }
  },
});

/** The panel's read: open gaps, most recently asked first. */
export const listUnansweredForCompany = adminQuery({
  args: {
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  returns: platformShapes.unansweredPageShape,
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
  returns: platformShapes.unansweredPageShape,
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

/**
 * How many open gaps there are, all together and split by whose they are,
 * for the counts over the platform's Unanswered table (the admin AI redesign,
 * 2026-11-12: the All / Platform / Companies buttons became counts you can
 * press). Counted up to a cap; past it the screen says "1,000+".
 */
const UNANSWERED_COUNT_CAP = 1000;

export const countAllUnanswered = superAdminQuery({
  args: {},
  returns: platformShapes.unansweredCountsShape,
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("wikiUnansweredQuestions")
      .withIndex("by_status_asked", (q) => q.eq("status", "OPEN"))
      .take(UNANSWERED_COUNT_CAP + 1);
    const capped = rows.length > UNANSWERED_COUNT_CAP;
    const counted = capped ? rows.slice(0, UNANSWERED_COUNT_CAP) : rows;
    const companies = counted.filter((row) => row.companyId).length;
    return {
      all: counted.length,
      platform: counted.length - companies,
      companies,
      capped,
    };
  },
});

/** The platform's gap list: super admins alone, companies counted never
 * named (Anthony's routing rule, 2026-08-17). */
export const listUnansweredForGlobal = adminQuery({
  args: {},
  returns: platformShapes.unansweredListShape,
  handler: async (ctx) => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
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
  returns: v.null(),
  handler: async (ctx, args) => {
    if (ctx.user.role !== "SUPER_ADMIN") {
      throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
    }
    const row = await ctx.db.get(args.unansweredId);
    if (!row || row.companyId !== undefined) throw appError("NOT_FOUND", "Question not found.");
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
  returns: v.null(),
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const row = await ctx.db.get(args.unansweredId);
    if (!row || row.companyId !== args.companyId) throw appError("NOT_FOUND", "Question not found.");
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
