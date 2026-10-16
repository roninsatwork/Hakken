import { v } from "convex/values";
import type { Expression, FilterBuilder, NamedTableInfo, PaginationOptions } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { superAdminQuery } from "./tenantFunctions";
import { isGlobalAgent } from "./agentService";
import { startsRuns } from "./seoScheduleService";
import { AGENT_RUN_KINDS, AGENT_WORK, AGENT_WORK_KINDS, agentWorkOf, type AgentRunKind, type AgentWork, type AgentWorkKind } from "./utils/agentWork";

/**
 * The Agents screen's list and counts (docs/plans/active/agents-and-clarity-plan.md,
 * Part 5, AG1–AG5; drawn and liked 2026-10-16): what an agent does and when it
 * runs, read from its role (`utils/agentWork.ts`), and its status now — applied
 * on the server, so the list still pages there as every admin inventory does
 * (`src/pagination-drift.test.ts`), and counted beside it, so each choice's
 * count and the footer's total are exact.
 */

/** The platform's agents read at most at once: its catalogue, a few dozen today. */
export const AGENT_CATALOG_LIMIT = 500;

export const agentInventoryFilters = {
  what: v.optional(v.union(...AGENT_WORK_KINDS.map((kind) => v.literal(kind)))),
  when: v.optional(v.union(...AGENT_RUN_KINDS.map((kind) => v.literal(kind)))),
  status: v.optional(v.union(v.literal("working"), v.literal("active"), v.literal("draft"))),
};
type AgentInventoryFilters = { what?: AgentWorkKind; when?: AgentRunKind; status?: "working" | "active" | "draft" };

/** The runs in flight now, a bounded read: what makes an agent "Working now" on the Agents screen and in its filters. */
export async function liveAgentRuns(ctx: { db: QueryCtx["db"] }): Promise<Array<Doc<"agentRuns">>> {
  return (
    await Promise.all(
      (["RUNNING", "QUEUED", "PENDING_APPROVAL"] as const).map((status) =>
        ctx.db
          .query("agentRuns")
          .withIndex("by_status_started", (q) => q.eq("status", status))
          .order("desc")
          .take(100)
      )
    )
  ).flat();
}

/** What the filters need beyond an agent's own fields: the agents with a row on the Schedules page, and those at work now. */
async function agentInventoryFacts(ctx: QueryCtx): Promise<{ scheduled: Set<Id<"agents">>; working: Set<Id<"agents">> }> {
  const schedules = await ctx.db.query("schedules").withIndex("by_createdAt").filter(startsRuns).take(AGENT_CATALOG_LIMIT);
  const runs = await liveAgentRuns(ctx);
  return {
    scheduled: new Set(schedules.flatMap((schedule) => (schedule.agentId ? [schedule.agentId] : []))),
    working: new Set(runs.map((run) => run.agentId)),
  };
}

type AgentFilterBuilder = FilterBuilder<NamedTableInfo<DataModel, "agents">>;

/** The filters as one expression over an agent's fields, so Convex narrows the list before it pages it. */
function agentInventoryExpression(q: AgentFilterBuilder, filters: AgentInventoryFilters, facts: { scheduled: Set<Id<"agents">>; working: Set<Id<"agents">> }): Expression<boolean> {
  const never = q.and(q.eq(q.field("isActive"), true), q.eq(q.field("isActive"), false));
  const anyOf = (parts: Array<Expression<boolean>>) => (parts.length === 0 ? never : parts.length === 1 ? parts[0] : q.or(...parts));
  const allOf = (parts: Array<Expression<boolean>>) => (parts.length === 1 ? parts[0] : q.and(...parts));
  const keysWhere = (pick: (work: AgentWork) => boolean) => Object.entries(AGENT_WORK).filter(([, work]) => pick(work)).map(([key]) => key);
  const holds = (keys: string[]) => anyOf(keys.map((key) => q.eq(q.field("systemKey"), key)));
  const own = q.eq(q.field("systemKey"), undefined);
  // A role the map does not know yet: the platform's, run when asked (`agentWorkOf`).
  const unknownRole = q.and(q.neq(q.field("systemKey"), undefined), ...Object.keys(AGENT_WORK).map((key) => q.neq(q.field("systemKey"), key)));
  const among = (ids: Set<Id<"agents">>) => anyOf([...ids].map((id) => q.eq(q.field("_id"), id)));
  const notAmong = (ids: Set<Id<"agents">>) => (ids.size === 0 ? own : q.and(...[...ids].map((id) => q.neq(q.field("_id"), id))));
  const parts: Array<Expression<boolean>> = [q.neq(q.field("isGlobal"), false)];
  if (filters.what) {
    const what = filters.what;
    parts.push(what === "own" ? own : what === "platform" ? anyOf([holds(keysWhere((work) => work.what === "platform")), unknownRole]) : holds(keysWhere((work) => work.what === what)));
  }
  if (filters.when) {
    const when = filters.when;
    const ways = [holds(keysWhere((work) => work.when === when))];
    if (when === "schedule") ways.push(q.and(own, among(facts.scheduled)));
    if (when === "asked") ways.push(unknownRole, q.and(own, notAmong(facts.scheduled)));
    parts.push(anyOf(ways));
  }
  if (filters.status === "working") parts.push(among(facts.working));
  if (filters.status === "active") parts.push(q.eq(q.field("isActive"), true));
  if (filters.status === "draft") parts.push(q.eq(q.field("isActive"), false));
  return allOf(parts);
}

/** One page of the platform's agents, narrowed by the filters before it pages: `agents.getPaginatedAgents`. */
export async function pageAgents(ctx: QueryCtx, args: AgentInventoryFilters & { paginationOpts: PaginationOptions; searchTerm?: string }) {
  const searchTerm = args.searchTerm?.trim();
  const facts = await agentInventoryFacts(ctx);
  const narrow = (q: AgentFilterBuilder) => agentInventoryExpression(q, args, facts);
  const result = searchTerm
    ? await ctx.db.query("agents").withSearchIndex("search_name", (q) => q.search("name", searchTerm)).filter(narrow).paginate(args.paginationOpts)
    : await ctx.db.query("agents").withIndex("by_workflow_created", (q) => q.eq("workflowId", undefined)).order("desc").filter(narrow).paginate(args.paginationOpts);
  return { ...result, page: result.page.filter(isGlobalAgent) };
}

/**
 * The Agents screen's counts (AG1): how many agents each choice would list,
 * each group counting what the other groups' choices leave, and the exact
 * total for the footer — never "1–15 of 15" beside "Page 1 of 2". Read once,
 * up to the catalogue's limit, and `capped` says when that limit was reached,
 * so a count never pretends.
 */
export const getAgentFilterCounts = superAdminQuery({
  args: { searchTerm: v.optional(v.string()), ...agentInventoryFilters },
  returns: v.object({
    total: v.number(),
    capped: v.boolean(),
    what: v.record(v.string(), v.number()),
    when: v.record(v.string(), v.number()),
    status: v.record(v.string(), v.number()),
  }),
  handler: async (ctx, args) => {
    const searchTerm = args.searchTerm?.trim();
    const read = searchTerm
      ? await ctx.db.query("agents").withSearchIndex("search_name", (q) => q.search("name", searchTerm)).take(AGENT_CATALOG_LIMIT)
      : await ctx.db.query("agents").withIndex("by_workflow_created", (q) => q.eq("workflowId", undefined)).take(AGENT_CATALOG_LIMIT);
    const facts = await agentInventoryFacts(ctx);
    const rows = read.filter(isGlobalAgent).map((agent) => ({
      work: agentWorkOf(agent.systemKey, facts.scheduled.has(agent._id)),
      status: facts.working.has(agent._id) ? "working" : agent.isActive ? "active" : "draft",
    }));
    const keeps = (row: (typeof rows)[number], skip?: keyof AgentInventoryFilters) =>
      (skip === "what" || !args.what || row.work.what === args.what)
      && (skip === "when" || !args.when || row.work.when === args.when)
      && (skip === "status" || !args.status || (args.status === "active" ? row.status !== "draft" : row.status === args.status));
    const counted = (skip: keyof AgentInventoryFilters, of: (row: (typeof rows)[number]) => string[]) => {
      const counts: Record<string, number> = { all: 0 };
      for (const row of rows.filter((entry) => keeps(entry, skip))) {
        counts.all += 1;
        for (const value of of(row)) counts[value] = (counts[value] ?? 0) + 1;
      }
      return counts;
    };
    return {
      total: rows.filter((row) => keeps(row)).length,
      capped: read.length >= AGENT_CATALOG_LIMIT,
      what: counted("what", (row) => [row.work.what]),
      when: counted("when", (row) => [row.work.when]),
      // A working agent is an active one too.
      status: counted("status", (row) => (row.status === "working" ? ["working", "active"] : [row.status])),
    };
  },
});
