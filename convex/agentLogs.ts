import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { normalizeSearchTerm } from "./adminQueryService";
import type { Id } from "./_generated/dataModel";
import { buildFailureKey } from "./agentFailureKeyService";
import {
  countFailureKeys,
  groupLogsByRun,
  matchesLogFilter,
} from "./agentLogGroupingService";
import { assertAdminCanAccessCompany } from "./authz";
import { appError } from "./utils/appError";
import { rowShape } from "./utils/rowShape";

/** A single job's exchange. Far above any real run, low enough to bound the read. */
const AGENT_RUN_LOG_LIMIT = 500;

/** How much recent history the grouped view reads before paging over the jobs in it. */
const AGENT_LOG_WINDOW = 1000;

/**
 * The raw log, read as the jobs it came from.
 *
 * The old screen was a flat list of every entry in time order, interleaved
 * across jobs — a chain of work presented as unrelated rows. This groups the
 * entries under the job they belonged to and hands back that job's real
 * outcome, duration and cost for the group header.
 */
export const getJobGroups = adminQuery({
  args: {
    agentId: v.id("agents"),
    searchTerm: v.optional(v.string()),
    filter: v.optional(v.union(
      v.literal("ALL"),
      v.literal("THINKING"),
      v.literal("TOOLS"),
      v.literal("PROBLEMS")
    )),
    /** Narrows to one recurring fault, so "see the other 41" shows the 41. */
    failureKey: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    if (user.role === "ADMIN" && !user.companyId) {
      throw appError("UNAUTHORIZED", "Unauthorized");
    }

    const searchTerm = normalizeSearchTerm(args.searchTerm);
    const filter = args.filter ?? "ALL";

    const baseQuery = searchTerm
      ? ctx.db
          .query("agentLogs")
          .withSearchIndex("search_content", (searchQ) =>
            searchQ.search("promptContent", searchTerm).eq("agentId", args.agentId)
          )
      : ctx.db
          .query("agentLogs")
          .withIndex("by_agent", (ix) => ix.eq("agentId", args.agentId))
          .order("desc");

    const scoped = user.role === "ADMIN"
      ? baseQuery.filter((q) => q.eq(q.field("companyId"), user.companyId))
      : baseQuery;

    const entries = await scoped.take(AGENT_LOG_WINDOW);

    // Counted before filtering: "this happened 42 times" must mean across the
    // window, not across whatever the reader is currently looking at.
    const failureCounts = countFailureKeys(entries);

    const visible = entries.filter((entry) =>
      (args.failureKey === undefined || entry.failureKey === args.failureKey)
      && matchesLogFilter(entry, filter)
    );
    const groups = groupLogsByRun(visible);

    const start = Math.max(0, (args.page - 1) * args.pageSize);
    const pageGroups = groups.slice(start, start + args.pageSize);

    // Only the jobs on this page are read, so a long history costs one page of
    // lookups rather than one per job it has ever run.
    const runIds = [...new Set(pageGroups.map((group) => group.runId).filter(Boolean))] as Id<"agentRuns">[];
    const runs = await Promise.all(runIds.map((runId) => ctx.db.get(runId)));
    const runById = new Map(runIds.map((runId, index) => [runId, runs[index]]));

    return {
      groups: pageGroups.map((group) => {
        const run = group.runId ? runById.get(group.runId as Id<"agentRuns">) : undefined;
        return {
          runId: group.runId,
          startedAt: group.startedAt,
          lastAt: group.lastAt,
          job: run
            ? {
                objective: run.objective,
                status: run.status,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
                costGBP: run.costGBP,
                triggerType: run.triggerType,
              }
            : null,
          entries: group.entries,
        };
      }),
      totalGroups: groups.length,
      totalPages: Math.max(1, Math.ceil(groups.length / args.pageSize)),
      failureCounts,
      // The window is capped, so a very chatty agent's history can be cut short.
      // Said outright rather than left for the reader to infer.
      windowTruncated: entries.length >= AGENT_LOG_WINDOW,
    };
  },
});

export const seedForAgent = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const interactionTypes = [
      "SYSTEM INSTRUCTION",
      "TOOL DISPATCH: weather",
      "MCP PROXY: get_inbox",
      "LLM SYNTHESIS",
      "ERROR: timeout",
    ];

    const promptExtracts = [
      "User: What is the weather like today in London?",
      "Running internal data fetch for company tenant ID: 1982.",
      "<schema_validation_error> Missing required args.",
      "Check my emails for urgent project updates.",
      "Transcribe the audio and summarize the next steps.",
      "User: Write a polite decline for the invitation."
    ];

    const responseExtracts = [
      '{"functionCall": {"name": "get_weather", "args": {"location": "London"}}}',
      "Fetched 214 rows from the analytics dashboard. Sending back to LLM.",
      "Connection to MCP proxy server timed out after 10000ms.",
      "I've drafted a decline email. Would you like me to send it?",
      "The summary is highly technical. Re-synthesizing for wider audience.",
      '{"functionCall": {"name": "mcp.day_ai.get_inbox", "args": {"limit": 5}}}'
    ];

    // Seed 45 logs to span automatically over 3 pages of 20
    for (let i = 0; i < 45; i++) {
        await ctx.db.insert("agentLogs", {
            agentId: args.agentId,
            interactionType: interactionTypes[Math.floor(Math.random() * interactionTypes.length)],
            promptContent: promptExtracts[Math.floor(Math.random() * promptExtracts.length)],
            responseContent: responseExtracts[Math.floor(Math.random() * responseExtracts.length)],
            createdAt: Date.now() - (i * 1000 * 60 * 15), // Backwards 15 mins apart
        });
    }
  },
});

export const insertAgentLogInternal = internalMutation({
  args: {
    agentId: v.id("agents"),
    threadId: v.optional(v.id("threads")),
    interactionType: v.string(),
    promptContent: v.string(),
    responseContent: v.string(),
    companyId: v.optional(v.id("companies")),
    runId: v.optional(v.id("agentRuns")),
    stepId: v.optional(v.id("agentRunSteps")),
    outcome: v.optional(v.union(
      v.literal("SUCCESS"),
      v.literal("FAILED"),
      v.literal("UNKNOWN")
    )),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const outcome = args.outcome ?? "UNKNOWN";

    // Derived here rather than at each call site. There are eight of them
    // across three files, and a key that only some of them remember to set is
    // a grouping that silently misses failures.
    const failureKey = outcome === "FAILED"
      ? buildFailureKey(args.responseContent)
      : undefined;

    return await ctx.db.insert("agentLogs", {
      agentId: args.agentId,
      threadId: args.threadId,
      interactionType: args.interactionType,
      promptContent: args.promptContent,
      responseContent: args.responseContent,
      companyId: args.companyId,
      runId: args.runId,
      stepId: args.stepId,
      outcome,
      durationMs: args.durationMs,
      failureKey,
      createdAt: Date.now(),
    });
  },
});

/**
 * The raw exchange for one job, in the order it happened.
 *
 * Only possible since log entries started recording the run they belong to.
 * Before that the raw exchange and the durable step trail were two accounts of
 * the same events with no way to read them together, which is why the deepest
 * layer of the job detail could not exist.
 */
export const getForRun = adminQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const { user } = ctx;

    // Authorised against the run rather than the entries: a caller who cannot
    // see the job must not learn what it said by reading its log.
    const run = await ctx.db.get(args.runId);
    if (!run) return [];
    assertAdminCanAccessCompany(user, run.companyId);

    return await ctx.db
      .query("agentLogs")
      .withIndex("by_run", (ix) => ix.eq("runId", args.runId))
      .order("asc")
      .take(AGENT_RUN_LOG_LIMIT);
  },
});

export const getLogById = adminQuery({
  args: { id: v.id("agentLogs") },
  returns: v.union(rowShape.agentLogs, v.null()),
  handler: async (ctx, args) => {
    const { user } = ctx;
    const log = await ctx.db.get(args.id);
    if (!log) return null;
    
    if (user.role === "ADMIN") {
      if (!user.companyId || log.companyId !== user.companyId) {
        throw appError("UNAUTHORIZED", "Unauthorized");
      }
    }
    return log;
  },
});

export const deleteLog = adminMutation({
  args: { id: v.id("agentLogs") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const log = await ctx.db.get(args.id);
    if (!log) throw appError("NOT_FOUND", "Log not found");
    
    if (user.role === "ADMIN") {
      if (!user.companyId || log.companyId !== user.companyId) {
        throw appError("UNAUTHORIZED", "Unauthorized");
      }
    }
    return await ctx.db.delete(args.id);
  },
});
