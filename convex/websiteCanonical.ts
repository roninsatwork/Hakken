import { v } from "convex/values";

import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { appError } from "./utils/appError";
import { AI_ENGINES, DEFAULT_AI_ENGINES, aiEngineValidator, isAiEngine } from "./seoAiEngines";
import { MAX_PROMPT_LENGTH, MIN_PROMPT_LENGTH } from "./utils/promptLimits";
import type { Id } from "./_generated/dataModel";

/**
 * A host's own lists: what it is asked, what it is checked against, who it
 * competes with.
 *
 * **None of these functions takes a company, and none of the rows they write
 * carries one.** That is the rule the new shape runs on — see the note above
 * `websiteQuestions` in `schema.ts`. A company attached to a host reads the
 * whole list; who is attached is `companyWebsites`' business and stays there.
 *
 * Its own module rather than more of `websites.ts`, which is 919 lines against
 * a thousand-line ceiling, and because this is a different job: that file owns
 * the host record and its watchers, this one owns what we ask about a host.
 *
 * Everything here is super admin, like the rest of the websites area. These
 * lists are shared across every client watching a host, so an edit is an edit
 * for all of them, and the audit trail matters more than the convenience.
 */

/** A generous ceiling, not a plan allowance. The allowance question is deferred. */
const MAX_CANONICAL_ROWS = 1_000;

/** As long as a real search gets, and short enough that a paragraph is refused. */
const MAX_KEYWORD_LENGTH = 120;
const MIN_KEYWORD_LENGTH = 2;

function readText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * One phrase, one row.
 *
 * The same normalisation `seoKeywordIntents` uses, so a phrase judged for one
 * host is the same string when the next host tracks it and the judgment is
 * reused rather than bought again.
 */
function readKeyword(raw: string): string {
  return readText(raw).toLowerCase();
}

async function requireWebsite(
  ctx: { db: { get: (id: Id<"websites">) => Promise<unknown> } },
  websiteId: Id<"websites">,
) {
  const website = await ctx.db.get(websiteId);
  if (!website) throw appError("NOT_FOUND", "That website is not in the system.");
  return website;
}

/* ------------------------------------------------------------------ questions */

export const listWebsiteQuestions = superAdminQuery({
  args: {
    websiteId: v.id("websites"),
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
    const rows = await ctx.db
      .query("websiteQuestions")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(MAX_CANONICAL_ROWS + 1);

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

export const addWebsiteQuestion = superAdminMutation({
  args: {
    websiteId: v.id("websites"),
    prompt: v.string(),
    engines: v.optional(v.array(v.string())),
  },
  returns: v.id("websiteQuestions"),
  handler: async (ctx, args) => {
    await requireWebsite(ctx, args.websiteId);

    const prompt = readText(args.prompt);
    if (prompt.length < MIN_PROMPT_LENGTH) {
      throw appError("INVALID_INPUT", "Write the question as somebody would actually ask it.");
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw appError("INVALID_INPUT", `A question can be at most ${MAX_PROMPT_LENGTH} characters.`);
    }

    const existing = await ctx.db
      .query("websiteQuestions")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(MAX_CANONICAL_ROWS + 1);

    if (existing.some((row) => row.prompt.toLowerCase() === prompt.toLowerCase())) {
      throw appError("INVALID_INPUT", "That question is already asked for this website.");
    }
    if (existing.length >= MAX_CANONICAL_ROWS) {
      throw appError("INVALID_INPUT", `A website can hold at most ${MAX_CANONICAL_ROWS} questions.`);
    }

    const chosen = (args.engines ?? []).filter(isAiEngine);
    const engines = chosen.length > 0 ? chosen : [...DEFAULT_AI_ENGINES];

    const questionId = await ctx.db.insert("websiteQuestions", {
      websiteId: args.websiteId,
      prompt,
      engines,
      isActive: true,
      createdAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "ADD_WEBSITE_QUESTION",
      entityId: questionId,
      entityType: "websiteQuestions",
      metadata: JSON.stringify({ prompt, engines }),
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
      metadata: JSON.stringify({ prompt: question.prompt }),
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
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "REMOVE_WEBSITE_QUESTION",
      entityId: args.questionId,
      entityType: "websiteQuestions",
      metadata: JSON.stringify({ prompt: question.prompt }),
      timestamp: Date.now(),
    });
    return null;
  },
});

/* ------------------------------------------------------------------- keywords */

export const listWebsiteKeywords = superAdminQuery({
  args: {
    websiteId: v.id("websites"),
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
    const rows = await ctx.db
      .query("websiteKeywords")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(MAX_CANONICAL_ROWS + 1);

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

export const addWebsiteKeyword = superAdminMutation({
  args: { websiteId: v.id("websites"), keyword: v.string() },
  returns: v.id("websiteKeywords"),
  handler: async (ctx, args) => {
    await requireWebsite(ctx, args.websiteId);

    const keyword = readKeyword(args.keyword);
    if (keyword.length < MIN_KEYWORD_LENGTH) {
      throw appError("INVALID_INPUT", "Write the search as somebody would type it.");
    }
    if (keyword.length > MAX_KEYWORD_LENGTH) {
      throw appError("INVALID_INPUT", `A search can be at most ${MAX_KEYWORD_LENGTH} characters.`);
    }

    const duplicate = await ctx.db
      .query("websiteKeywords")
      .withIndex("by_website_keyword", (q) =>
        q.eq("websiteId", args.websiteId).eq("keyword", keyword))
      .first();
    if (duplicate) {
      throw appError("INVALID_INPUT", "That search is already tracked for this website.");
    }

    const existing = await ctx.db
      .query("websiteKeywords")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(MAX_CANONICAL_ROWS + 1);
    if (existing.length >= MAX_CANONICAL_ROWS) {
      throw appError("INVALID_INPUT", `A website can track at most ${MAX_CANONICAL_ROWS} searches.`);
    }

    const keywordId = await ctx.db.insert("websiteKeywords", {
      websiteId: args.websiteId,
      keyword,
      isActive: true,
      createdAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "ADD_WEBSITE_KEYWORD",
      entityId: keywordId,
      entityType: "websiteKeywords",
      metadata: JSON.stringify({ keyword }),
      timestamp: Date.now(),
    });

    return keywordId;
  },
});

export const setWebsiteKeywordActive = superAdminMutation({
  args: { keywordId: v.id("websiteKeywords"), isActive: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const keyword = await ctx.db.get(args.keywordId);
    if (!keyword) throw appError("NOT_FOUND", "That search is no longer tracked.");

    await ctx.db.patch(args.keywordId, { isActive: args.isActive });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: args.isActive ? "RESUME_WEBSITE_KEYWORD" : "PAUSE_WEBSITE_KEYWORD",
      entityId: args.keywordId,
      entityType: "websiteKeywords",
      metadata: JSON.stringify({ keyword: keyword.keyword }),
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
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "REMOVE_WEBSITE_KEYWORD",
      entityId: args.keywordId,
      entityType: "websiteKeywords",
      metadata: JSON.stringify({ keyword: keyword.keyword }),
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

/* ---------------------------------------------------------------- competition */

export const listWebsiteRivals = superAdminQuery({
  args: {
    websiteId: v.id("websites"),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("websiteRivals"),
      rivalWebsiteId: v.id("websites"),
      displayHost: v.string(),
      source: v.union(v.literal("ASSERTED"), v.literal("DISCOVERED")),
      createdAt: v.number(),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
  }),
  handler: async (ctx, args) => {
    const edges = await ctx.db
      .query("websiteRivals")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(MAX_CANONICAL_ROWS + 1);

    // Resolved by id, never by querying the table: the host is already named
    // by the edge, so nothing here walks outward looking for one.
    const named = await Promise.all(edges.map(async (edge) => {
      const rival = await ctx.db.get(edge.rivalWebsiteId);
      return {
        _id: edge._id,
        rivalWebsiteId: edge.rivalWebsiteId,
        displayHost: rival?.displayHost ?? "",
        source: edge.source,
        createdAt: edge.createdAt,
      };
    }));

    const term = normalizeSearchTerm(args.searchTerm);
    const matching = term
      ? named.filter((row) => includesSearchTerm(row.displayHost, term))
      : named;
    const paged = paginateItems(matching, args.page, args.pageSize);

    return {
      data: paged.data,
      totalCount: paged.totalCount,
      totalPages: paged.totalPages,
    };
  },
});

/**
 * Claim that one host competes with another.
 *
 * Takes two website ids rather than a URL, because a rival that is not in the
 * system yet is a different job — `createWebsite` owns making a row, and
 * splitting the two keeps this function from being a second place a host can be
 * born.
 */
export const addWebsiteRival = superAdminMutation({
  args: { websiteId: v.id("websites"), rivalWebsiteId: v.id("websites") },
  returns: v.id("websiteRivals"),
  handler: async (ctx, args) => {
    if (args.websiteId === args.rivalWebsiteId) {
      throw appError("INVALID_INPUT", "A website cannot compete with itself.");
    }
    await requireWebsite(ctx, args.websiteId);
    await requireWebsite(ctx, args.rivalWebsiteId);

    const existing = await ctx.db
      .query("websiteRivals")
      .withIndex("by_website_rival", (q) =>
        q.eq("websiteId", args.websiteId).eq("rivalWebsiteId", args.rivalWebsiteId))
      .first();
    if (existing) {
      throw appError("INVALID_INPUT", "That rivalry is already recorded.");
    }

    const edgeId = await ctx.db.insert("websiteRivals", {
      websiteId: args.websiteId,
      rivalWebsiteId: args.rivalWebsiteId,
      source: "ASSERTED",
      createdAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "ADD_WEBSITE_RIVAL",
      entityId: edgeId,
      entityType: "websiteRivals",
      metadata: JSON.stringify({ rivalWebsiteId: args.rivalWebsiteId }),
      timestamp: Date.now(),
    });

    return edgeId;
  },
});

export const removeWebsiteRival = superAdminMutation({
  args: { edgeId: v.id("websiteRivals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const edge = await ctx.db.get(args.edgeId);
    if (!edge) return null;

    await ctx.db.delete(args.edgeId);
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "REMOVE_WEBSITE_RIVAL",
      entityId: args.edgeId,
      entityType: "websiteRivals",
      metadata: JSON.stringify({ rivalWebsiteId: edge.rivalWebsiteId }),
      timestamp: Date.now(),
    });
    return null;
  },
});

/* ------------------------------------------------------------------- profile */

/**
 * What this business does and where it sells.
 *
 * Here rather than beside brand names in `websites.ts`, which crossed the
 * thousand-line ceiling when this was added to it. A fair seam as well as a
 * forced one: the profile is host-record content like the three lists above,
 * and it exists for the same reason they do. It passes the same test brand
 * names pass: two companies watching one host would write down the same
 * answer. It exists so a host can be handed
 * a starting set of searches and questions rather than a blank box, which is
 * most of what a new client attaching to a known host is worth.
 *
 * Empty clears the field. Somebody who does not know the sector should be able
 * to say so, and a wrong sector is worse than none — it would suggest the wrong
 * searches with the same confidence as a right one.
 */
export const setWebsiteProfile = superAdminMutation({
  args: {
    websiteId: v.id("websites"),
    sector: v.union(v.string(), v.null()),
    marketLabel: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const website = await ctx.db.get(args.websiteId);
    if (!website) throw appError("NOT_FOUND", "That website no longer exists.");

    const trim = (value: string | null) => {
      const read = (value ?? "").replace(/\s+/g, " ").trim();
      if (read.length > 120) {
        throw appError("INVALID_INPUT", "That is too long for a sector or a market.");
      }
      return read.length > 0 ? read : undefined;
    };

    const sector = trim(args.sector);
    const marketLabel = trim(args.marketLabel);
    await ctx.db.patch(args.websiteId, { sector, marketLabel });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "SET_WEBSITE_PROFILE",
      entityId: args.websiteId,
      entityType: "websites",
      // Shared like the names are, so an edit is readable afterwards.
      metadata: JSON.stringify({ host: website.host, sector, marketLabel }),
      timestamp: Date.now(),
    });

    return null;
  },
});
