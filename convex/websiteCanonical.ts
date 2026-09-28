import { v } from "convex/values";
import { internal } from "./_generated/api";

import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { appError } from "./utils/appError";
import { AI_ENGINES, DEFAULT_AI_ENGINES, aiEngineValidator, isAiEngine } from "./seoAiEngines";
import { MAX_PROMPT_LENGTH, MIN_PROMPT_LENGTH } from "./utils/promptLimits";
import { isTrackedHold } from "./utils/websitePairing";
import { holdQuestions, holdSearch, holdSearches } from "./holdLists";
import { readFanOutLimits } from "./fanOutLimits";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * What we ask about a host, and who it competes with.
 *
 * **Two kinds of thing, kept apart.** A host's own facts — its profile, and
 * the competition graph — are shared by every company watching it, because
 * they are true of the website. The searches and questions are each
 * company's own (docs/plans/active/private-tracking-lists-plan.md): every
 * list function here takes the hold the list belongs to, a company's own
 * website, and no other company can see what is on it. Buying stays shared —
 * a purchase is keyed on the search or question, never on the list.
 *
 * Its own module rather than more of `websites.ts`, which is 919 lines against
 * a thousand-line ceiling, and because this is a different job: that file owns
 * the host record and its watchers, this one owns what we ask about a host.
 *
 * Everything here is super admin, like the rest of the websites area, and
 * every edit is audited with the company it was made for.
 */


/** A generous ceiling per company's list, not a plan allowance. The allowance question is deferred. */
const MAX_CANONICAL_ROWS = 1_000;

/** As long as a real search gets, and short enough that a paragraph is refused. */
const MAX_KEYWORD_LENGTH = 120;
const MIN_KEYWORD_LENGTH = 2;

function readText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * One phrase, one row: a search phrase as the lists keep it, and as typed for
 * the screen — refused when no search is that short or that long.
 *
 * The same normalisation `seoKeywordIntents` uses, so a phrase judged for one
 * host is the same string when the next host tracks it and the judgment is
 * reused rather than bought again. Shared by the tracked searches and a
 * question's own fan-out queries (`promptFanOut.ts`), so a phrase meets one
 * rule wherever it is written.
 */
export function readSearchPhrase(raw: string): { keyword: string; text: string } {
  const text = readText(raw);
  const keyword = text.toLowerCase();
  if (keyword.length < MIN_KEYWORD_LENGTH) {
    throw appError("INVALID_INPUT", "Write the search as somebody would type it.");
  }
  if (keyword.length > MAX_KEYWORD_LENGTH) {
    throw appError("INVALID_INPUT", `A search can be at most ${MAX_KEYWORD_LENGTH} characters.`);
  }
  return { keyword, text };
}

async function requireWebsite(
  ctx: { db: { get: (id: Id<"websites">) => Promise<unknown> } },
  websiteId: Id<"websites">,
) {
  const website = await ctx.db.get(websiteId);
  if (!website) throw appError("NOT_FOUND", "That website is not in the system.");
  return website;
}

/**
 * The hold a list belongs to: one of a company's own websites. A competitor
 * has no list of its own (V8) — it is measured on the searches and questions
 * of the owned site it is watched against.
 */
async function requireListHold(
  ctx: { db: MutationCtx["db"] },
  holdId: Id<"companyWebsites">,
): Promise<Doc<"companyWebsites">> {
  const hold = await ctx.db.get(holdId);
  if (!hold) throw appError("NOT_FOUND", "That website is no longer one this company holds.");
  if (isTrackedHold(hold)) {
    throw appError("INVALID_INPUT", "A competitor is measured on the searches and questions of the company's own website.");
  }
  return hold;
}

/**
 * Refused when a website already has as many fan-out queries ticked as its
 * limit allows (`fanOutTrackedPerSite`, docs/plans/active/fan-out-opt-in-plan.md):
 * a fan-out query is ticked when it is running on the tracked searches, having
 * come from a prompt's list. A keyword typed in here does not count (Anthony,
 * 2026-09-28: "only for fan outs").
 */
export async function requireFanOutRoom(ctx: { db: MutationCtx["db"] }, hold: Doc<"companyWebsites">): Promise<void> {
  const { fanOutTrackedPerSite } = await readFanOutLimits(ctx, hold.companyId, hold._id);
  const running = await holdSearches(ctx, hold._id, MAX_CANONICAL_ROWS, { activeOnly: true });
  if (running.filter((row) => row.addedFrom === "AI_SEARCH").length < fanOutTrackedPerSite) return;
  const website = await ctx.db.get(hold.websiteId);
  throw appError(
    "INVALID_INPUT",
    `${website?.displayHost ?? "This website"} already checks ${fanOutTrackedPerSite} fan-out queries every run: its limit in Limits. Untick one, or raise the limit.`,
  );
}

/** The company a list row was made for, for its audit entry. */
async function listCompanyOf(
  ctx: { db: MutationCtx["db"] },
  holdId: Id<"companyWebsites">,
): Promise<{ companyId?: Id<"companies"> }> {
  const hold = await ctx.db.get(holdId);
  return hold ? { companyId: hold.companyId } : {};
}

/* ------------------------------------------------------------------ questions */

/** One company's questions about one of its websites. */
export const listWebsiteQuestions = superAdminQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("websiteQuestions"),
      prompt: v.string(),
      engines: v.array(v.string()),
      isActive: v.boolean(),
      createdAt: v.number(),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
    /** Every engine the list asks, so a screen can price the whole set once. */
    engineCalls: v.number(),
  }),
  handler: async (ctx, args) => {
    const rows = await holdQuestions(ctx, args.companyWebsiteId, MAX_CANONICAL_ROWS + 1);

    const term = normalizeSearchTerm(args.searchTerm);
    const matching = term ? rows.filter((row) => includesSearchTerm(row.prompt, term)) : rows;
    const paged = paginateItems(matching, args.page, args.pageSize);

    return {
      data: paged.data.map((row) => ({
        _id: row._id,
        prompt: row.prompt,
        engines: row.engines,
        isActive: row.isActive,
        createdAt: row.createdAt,
      })),
      totalCount: paged.totalCount,
      totalPages: paged.totalPages,
      // What a cycle actually buys: an inactive question is not asked, and a
      // question is charged once per engine it names.
      engineCalls: rows.reduce(
        (total, row) => total + (row.isActive ? row.engines.length : 0),
        0,
      ),
    };
  },
});

/** Add a question to one company's list for one of its websites. */
export const addWebsiteQuestion = superAdminMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    prompt: v.string(),
    engines: v.optional(v.array(v.string())),
  },
  returns: v.id("websiteQuestions"),
  handler: async (ctx, args) => {
    const hold = await requireListHold(ctx, args.companyWebsiteId);
    await requireWebsite(ctx, hold.websiteId);

    const prompt = readText(args.prompt);
    if (prompt.length < MIN_PROMPT_LENGTH) {
      throw appError("INVALID_INPUT", "Write the question as somebody would actually ask it.");
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw appError("INVALID_INPUT", `A question can be at most ${MAX_PROMPT_LENGTH} characters.`);
    }

    const existing = await holdQuestions(ctx, hold._id, MAX_CANONICAL_ROWS + 1);
    const { promptsPerSite } = await readFanOutLimits(ctx, hold.companyId, hold._id);

    if (existing.some((row) => row.prompt.toLowerCase() === prompt.toLowerCase())) {
      throw appError("INVALID_INPUT", "That question is already asked for this website.");
    }
    if (existing.length >= promptsPerSite) {
      throw appError("INVALID_INPUT", `This website can ask at most ${promptsPerSite} prompts: its limit in Limits.`);
    }

    const chosen = (args.engines ?? []).filter(isAiEngine);
    const engines = chosen.length > 0 ? chosen : [...DEFAULT_AI_ENGINES];

    const questionId = await ctx.db.insert("websiteQuestions", {
      websiteId: hold.websiteId,
      companyWebsiteId: hold._id,
      prompt,
      engines,
      isActive: true,
      createdAt: Date.now(),
    });

    // The answers others' asking already filed count from the start
    // (docs/plans/active/sites-ai-list-summaries-plan.md).
    await ctx.scheduler.runAfter(0, internal.siteListAi.recountQuestion, { holdId: hold._id, prompt });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "ADD_WEBSITE_QUESTION",
      entityId: questionId,
      entityType: "websiteQuestions",
      metadata: JSON.stringify({ prompt, engines, companyId: hold.companyId }),
      timestamp: Date.now(),
    });

    return questionId;
  },
});

export const setWebsiteQuestionActive = superAdminMutation({
  args: { questionId: v.id("websiteQuestions"), isActive: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) throw appError("NOT_FOUND", "That question is no longer tracked.");

    await ctx.db.patch(args.questionId, { isActive: args.isActive });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: args.isActive ? "RESUME_WEBSITE_QUESTION" : "PAUSE_WEBSITE_QUESTION",
      entityId: args.questionId,
      entityType: "websiteQuestions",
      metadata: JSON.stringify({ prompt: question.prompt, ...(await listCompanyOf(ctx, question.companyWebsiteId)) }),
      timestamp: Date.now(),
    });
    return null;
  },
});

/**
 * What leaves with a question's words — removed, or edited into others: its
 * answers leave the company's AI figures, what the company chose for its
 * fan-out queries goes (with their first checks not yet bought), and its
 * fan-out queries leave AI searches now rather than at the next collection.
 * The rebuild waits a moment, so the choices are read before it clears them.
 */
async function forgetWords(ctx: MutationCtx, holdId: Id<"companyWebsites">, prompt: string) {
  await ctx.scheduler.runAfter(0, internal.siteListAi.recountQuestion, { holdId, prompt });
  await ctx.scheduler.runAfter(0, internal.promptFanOut.forgetQuestion, { holdId, prompt });
  await ctx.scheduler.runAfter(FORGET_BEFORE_REBUILD_MS, internal.fanOutAngles.rebuildHoldAngles, { holdId });
}

/** How long a rebuild waits after a question's words are forgotten. */
const FORGET_BEFORE_REBUILD_MS = 5_000;

/**
 * Change a question's words — a spelling mistake, say — and which assistants
 * it is asked of (Anthony, 2026-09-28: "if it made a spelling mistake i had to
 * delete and re-enter and there was no edit"; "edit also needs to edit the
 * assistants"). The AIs are asked the exact words and everything collected
 * is filed under them, so new words start fresh from the next collection, and
 * what came back for the old words stays with those words, off this list, as
 * when a question is removed. Other assistants are asked from the next
 * collection; the list's AI figures and fan-out queries follow the assistants
 * chosen. The question keeps its place in the list and whether it is paused,
 * and uses no more of the website's limit.
 */
export const editWebsiteQuestion = superAdminMutation({
  args: { questionId: v.id("websiteQuestions"), prompt: v.string(), engines: v.optional(v.array(v.string())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) throw appError("NOT_FOUND", "That question is no longer asked.");
    const hold = await requireListHold(ctx, question.companyWebsiteId);

    const prompt = readText(args.prompt);
    if (prompt.length < MIN_PROMPT_LENGTH) {
      throw appError("INVALID_INPUT", "Write the question as somebody would actually ask it.");
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw appError("INVALID_INPUT", `A question can be at most ${MAX_PROMPT_LENGTH} characters.`);
    }
    // In the house order, whatever order they were ticked in.
    const engines = args.engines === undefined ? question.engines : AI_ENGINES.filter((engine) => args.engines?.includes(engine));
    if (engines.length === 0) throw appError("INVALID_INPUT", "Choose at least one assistant to ask.");

    const sameWords = prompt === question.prompt;
    const sameEngines = engines.length === question.engines.length && engines.every((engine) => question.engines.includes(engine));
    if (sameWords && sameEngines) return null;
    if (!sameWords) {
      const existing = await holdQuestions(ctx, hold._id, MAX_CANONICAL_ROWS + 1);
      if (existing.some((row) => row._id !== question._id && row.prompt.toLowerCase() === prompt.toLowerCase())) {
        throw appError("INVALID_INPUT", "That question is already asked for this website.");
      }
    }

    await ctx.db.patch(question._id, { prompt, engines });
    if (!sameWords) await forgetWords(ctx, hold._id, question.prompt);
    // Its fan-out queries are read from the assistants it is asked of: the list follows them now.
    else await ctx.scheduler.runAfter(0, internal.fanOutAngles.rebuildHoldAngles, { holdId: hold._id });
    // The AI figures count the answers of the words and assistants it has now, others' asking already filed too.
    await ctx.scheduler.runAfter(0, internal.siteListAi.recountQuestion, { holdId: hold._id, prompt });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "EDIT_WEBSITE_QUESTION",
      entityId: question._id,
      entityType: "websiteQuestions",
      metadata: JSON.stringify({ from: question.prompt, to: prompt, enginesFrom: question.engines, enginesTo: engines, companyId: hold.companyId }),
      timestamp: Date.now(),
    });
    return null;
  },
});

export const removeWebsiteQuestion = superAdminMutation({
  args: { questionId: v.id("websiteQuestions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) return null;

    await ctx.db.delete(args.questionId);
    await forgetWords(ctx, question.companyWebsiteId, question.prompt);
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "REMOVE_WEBSITE_QUESTION",
      entityId: args.questionId,
      entityType: "websiteQuestions",
      metadata: JSON.stringify({ prompt: question.prompt, ...(await listCompanyOf(ctx, question.companyWebsiteId)) }),
      timestamp: Date.now(),
    });
    return null;
  },
});

/* ------------------------------------------------------------------- keywords */

/** One company's searches for one of its websites. */
export const listWebsiteKeywords = superAdminQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("websiteKeywords"),
      keyword: v.string(),
      isActive: v.boolean(),
      createdAt: v.number(),
      /** What people mean by it, when the judgment has run. Absent is honest. */
      intent: v.union(v.string(), v.null()),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
    activeCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const rows = await holdSearches(ctx, args.companyWebsiteId, MAX_CANONICAL_ROWS + 1);

    const term = normalizeSearchTerm(args.searchTerm);
    const matching = term ? rows.filter((row) => includesSearchTerm(row.keyword, term)) : rows;
    const paged = paginateItems(matching, args.page, args.pageSize);

    const data = await Promise.all(paged.data.map(async (row) => {
      // Shared with the rankings and fan-out screens: a phrase is judged once
      // for the platform, not once per host that tracks it.
      const judged = await ctx.db
        .query("seoKeywordIntents")
        .withIndex("by_keyword", (q) => q.eq("keyword", row.keyword))
        .first();

      return {
        _id: row._id,
        keyword: row.keyword,
        isActive: row.isActive,
        createdAt: row.createdAt,
        intent: judged?.intent ?? null,
      };
    }));

    return {
      data,
      totalCount: paged.totalCount,
      totalPages: paged.totalPages,
      activeCount: rows.filter((row) => row.isActive).length,
    };
  },
});

/**
 * Add one search to a company's list for one of its websites, with every
 * check the list keeps.
 *
 * Shared by the screen's add button, the tick on a prompt's fan-out queries
 * and taking an "untracked search" move, so a search added any way meets the
 * same length rules, the same ceilings and leaves the same audit entry.
 */
export async function addWebsiteKeywordCore(
  ctx: MutationCtx,
  args: {
    companyWebsiteId: Id<"companyWebsites">;
    keyword: string;
    /** Absent when no person did it: the lists' automatic tracking of 2026-09-28, since undone (`promptFanOut.ts`). */
    userId?: Id<"users">;
    /** Typed in by hand, or ticked on a prompt's fan-out queries — the AI's, or one the company added there. */
    addedFrom: "HAND" | "AI_SEARCH";
    /** How long the list is, when the caller has just read it: adding many then reads it once, not once each. */
    listSize?: number;
  },
): Promise<Id<"websiteKeywords">> {
  const hold = await requireListHold(ctx, args.companyWebsiteId);
  const { keyword } = readSearchPhrase(args.keyword);

  if (await holdSearch(ctx, hold._id, keyword)) {
    throw appError("INVALID_INPUT", "That search is already tracked for this website.");
  }

  const size = args.listSize ?? (await holdSearches(ctx, hold._id, MAX_CANONICAL_ROWS + 1)).length;
  const { trackedPerSite } = await readFanOutLimits(ctx, hold.companyId, hold._id);
  if (size >= trackedPerSite) {
    throw appError("INVALID_INPUT", `This website can track at most ${trackedPerSite} keywords: its limit in Limits.`);
  }
  // Ticked on a prompt's fan-out queries: that list has a limit of its own.
  if (args.addedFrom === "AI_SEARCH") await requireFanOutRoom(ctx, hold);

  const keywordId = await ctx.db.insert("websiteKeywords", {
    websiteId: hold.websiteId,
    companyWebsiteId: hold._id,
    keyword,
    isActive: true,
    createdAt: Date.now(),
    addedFrom: args.addedFrom,
  });

  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: "ADD_WEBSITE_KEYWORD",
    entityId: keywordId,
    entityType: "websiteKeywords",
    metadata: JSON.stringify({ keyword, companyId: hold.companyId, addedFrom: args.addedFrom }),
    timestamp: Date.now(),
  });

  return keywordId;
}

/**
 * Add a search to one company's list for one of its websites: typed in, or
 * tracked from a search the AI assistants ran (`addedFrom`, "HAND" when not
 * said).
 */
export const addWebsiteKeyword = superAdminMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    keyword: v.string(),
    addedFrom: v.optional(v.union(v.literal("HAND"), v.literal("AI_SEARCH"))),
  },
  returns: v.id("websiteKeywords"),
  handler: async (ctx, args) => {
    return await addWebsiteKeywordCore(ctx, {
      companyWebsiteId: args.companyWebsiteId,
      keyword: args.keyword,
      userId: ctx.userId,
      addedFrom: args.addedFrom ?? "HAND",
    });
  },
});

export const setWebsiteKeywordActive = superAdminMutation({
  args: { keywordId: v.id("websiteKeywords"), isActive: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const keyword = await ctx.db.get(args.keywordId);
    if (!keyword) throw appError("NOT_FOUND", "That search is no longer tracked.");
    // Resuming a fan-out query ticks it again, within its website's limit for them.
    if (args.isActive && !keyword.isActive && keyword.addedFrom === "AI_SEARCH") {
      const hold = await ctx.db.get(keyword.companyWebsiteId);
      if (hold) await requireFanOutRoom(ctx, hold);
    }

    await ctx.db.patch(args.keywordId, { isActive: args.isActive });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: args.isActive ? "RESUME_WEBSITE_KEYWORD" : "PAUSE_WEBSITE_KEYWORD",
      entityId: args.keywordId,
      entityType: "websiteKeywords",
      metadata: JSON.stringify({ keyword: keyword.keyword, ...(await listCompanyOf(ctx, keyword.companyWebsiteId)) }),
      timestamp: Date.now(),
    });
    return null;
  },
});

export const removeWebsiteKeyword = superAdminMutation({
  args: { keywordId: v.id("websiteKeywords") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const keyword = await ctx.db.get(args.keywordId);
    if (!keyword) return null;

    await ctx.db.delete(args.keywordId);
    // One of a prompt's fan-out queries is unticked there, and stays listed (fan-out-opt-in-plan.md).
    await ctx.scheduler.runAfter(0, internal.promptFanOut.afterSearchRemoved, { holdId: keyword.companyWebsiteId, keyword: keyword.keyword });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "REMOVE_WEBSITE_KEYWORD",
      entityId: args.keywordId,
      entityType: "websiteKeywords",
      metadata: JSON.stringify({ keyword: keyword.keyword, ...(await listCompanyOf(ctx, keyword.companyWebsiteId)) }),
      timestamp: Date.now(),
    });
    return null;
  },
});

/* --------------------------------------------------------------------- engines */

/** The engine list, for a screen that has to offer them. Names live in one file. */
export const listEngines = superAdminQuery({
  args: {},
  returns: v.array(aiEngineValidator),
  handler: async () => [...AI_ENGINES],
});
