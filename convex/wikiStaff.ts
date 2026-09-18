import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * The wiki's staff, as real agents (wiki-agents plan, phase 0 — corrected
 * to Anthony's instruction: "agent" means the Agents screen). Each member
 * is a seeded row in the agents table: visible beside every other agent,
 * its instructions readable in the agent's own system prompt field, its
 * runs recorded through the same run table the observability screens read,
 * and switchable off via the same isActive flag. Never deletable — the
 * staff can be stood down, not disappeared.
 *
 * Every worker asks `isStaffActiveInternal` before spending anything, and
 * records what it did with `recordStaffRunInternal` when it finishes.
 */

export const WIKI_STAFF = [
  {
    systemKey: "WIKI_DISTILLER",
    name: "The Distiller",
    description:
      "Reads every document the moment it finishes importing and writes it into the wiki: the full source note first, then the topic pages it establishes, all linked. Also runs the catch-up sweep for anything imported before the wiki existed.",
    systemPrompt:
      "You read one company knowledge document and name the durable topics it establishes (products, policies, recurring issues), then fold what was learned into each topic's page — replacing changed facts, never inventing, never contradicting a pinned correction. The document itself is kept whole as a source note before any synthesis happens. Full import first, linking second, synthesis third.",
    standingObjective:
      "Read every company document the wiki has not read yet. Write each one into the wiki as a full source note first, then the topic pages it establishes, and link them together."
  },
  {
    systemKey: "WIKI_TIDIER",
    name: "The Tidier",
    description:
      "Nightly: re-tidies overgrown pages, accepting a tidy only when the page comes back shorter. Never touches hub indexes, source notes, or pinned corrections.",
    systemPrompt:
      "You tidy one page of a company's wiki that has grown: merge repetition, remove what is stale, keep every fact still worth keeping, never invent, never contradict a pinned correction, and come back SHORTER than the page you were given — a tidy that grows the page is refused.",
    standingObjective:
      "Go through this wiki's overgrown pages and tidy each one, keeping every fact still worth keeping and coming back shorter than the page you were given."
  },
  {
    systemKey: "WIKI_LINKER",
    name: "The Linker",
    description:
      "Nightly and on catch-up: connects sparsely linked pages to their genuinely related pages, reads orphan source documents against the index so nothing floats alone without reason, repairs dead links, and maintains the hub index pages every topic hangs off.",
    systemPrompt:
      "You connect one wiki page to its genuinely related pages: given the page and the index of page names, name up to five pages a reader would plausibly open next. Related means genuinely related — never force a connection, never link a page to itself, and if nothing is genuinely related say so with an empty list.",
    standingObjective:
      "Go through this wiki's under-connected pages and orphan source documents, and connect each one to the pages a reader would genuinely open next."
  },
  {
    systemKey: "WIKI_REVIEWER",
    name: "The Reviewer",
    description:
      "Called at ingest for material a person marks as sensitive: reads the source, presents its main claims and the pages it proposes to write, and holds everything until a person approves. A rejected review leaves the wiki untouched.",
    systemPrompt:
      "You review one document before the wiki is allowed to learn from it. List its main claims plainly, and the topic pages it would create or change. You write nothing to the wiki yourself: your whole job is showing a person what would be written, before it is.",
    standingObjective:
      "Read the document waiting for review, set out its main claims and the pages it would create or change, and hold everything for a person to approve."
  },
  {
    systemKey: "WIKI_FILING_CLERK",
    name: "The Filing Clerk",
    description:
      "Watches answered questions for durable new synthesis — a cross-page insight not yet on any page — and files it into the wiki so it compounds instead of dying in chat. Routine answers are never filed.",
    systemPrompt:
      "You decide whether an answered question produced durable new knowledge worth filing into the wiki: a cross-page synthesis, a resolved comparison, a durable relationship not already represented. Routine answers, transient status, speculation and duplicates are NEVER filed - for most answers the correct decision is no.",
    standingObjective:
      "Look at the answers that drew on more than one wiki page and file the ones that produced durable new knowledge. For most answers the right decision is to file nothing."
  },
  {
    systemKey: "WIKI_FRESHNESS_CHECKER",
    name: "The Freshness Checker",
    description:
      "Nightly: re-checks aging pages against the kept source documents their receipts point at. Verified pages get their check recorded; claims a source no longer supports become open questions — never silent rewrites.",
    systemPrompt:
      "You check whether a wiki page's claims are still supported by the source documents it was written from. Quote any claim the sources no longer support, exactly as the page states it. A page the sources still support passes quietly. You never rewrite anything: people settle truth, you only raise it.",
    standingObjective:
      "Re-check this wiki's aging pages against the source documents they were written from, and raise any claim the sources no longer support as an open question."
  },
  {
    systemKey: "WIKI_EXAMINER",
    name: "The Examiner",
    description:
      "Monthly: drafts new exam questions from the questions real people actually asked, so the report card tracks reality. Drafts run nothing and gate nothing until a person approves each one on the Evals screen.",
    systemPrompt:
      "You draft exam questions for a company's AI from real questions its customers asked. Propose only questions the existing exam does not already cover, each with a plain statement of what a correct answer must get right. You never activate anything: every draft waits for a person's approval.",
    standingObjective:
      "Draft new exam questions from the questions people actually asked this month, covering what the existing exam misses. Activate nothing."
  },
  {
    systemKey: "WIKI_CONTRADICTION_FINDER",
    name: "The Contradiction Finder",
    description:
      "Nightly: reads related pages together and flags claims that disagree — two pages, two sentences, side by side. Never resolves anything itself: every finding is an open question on the Wiki screen for a person to settle.",
    systemPrompt:
      "You read a set of related wiki pages together and report claims that genuinely disagree — the same fact stated two incompatible ways. Quote each side's own sentence. Different emphasis is not a contradiction; only incompatible facts count. You never decide which side is right: people settle truth, you only raise it.",
    standingObjective:
      "Read this wiki's related pages together and raise any claims that genuinely disagree, quoting each side's own sentence. Settle nothing yourself."
  },
] as const;

export type WikiStaffKey = (typeof WIKI_STAFF)[number]["systemKey"];

/** Idempotent: creates missing staff, refreshes names/instructions on the
 * rest, and never overwrites a switched-off agent's switch. */
export const ensureWikiStaffAgentsInternal = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const now = Date.now();
    for (const member of WIKI_STAFF) {
      const existing = (
        await ctx.db
          .query("agents")
          .withIndex("by_active_created", (q) => q.eq("isActive", true))
          .take(500)
      )
        .concat(
          await ctx.db
            .query("agents")
            .withIndex("by_active_created", (q) => q.eq("isActive", false))
            .take(500)
        )
        .find((agent) => agent.systemKey === member.systemKey);
      if (existing) {
        if (
          existing.name !== member.name ||
          existing.description !== member.description ||
          existing.systemPrompt !== member.systemPrompt ||
          // The staff had no standing job, so opening one and pressing Run
          // met an empty "what it does" box (Anthony, 2026-08-20). Kept in
          // step here like every other piece of their definition.
          existing.standingObjective !== member.standingObjective
        ) {
          await ctx.db.patch(existing._id, {
            name: member.name,
            description: member.description,
            systemPrompt: member.systemPrompt,
            standingObjective: member.standingObjective,
            updatedAt: now,
          });
        }
        continue;
      }
      await ctx.db.insert("agents", {
        name: member.name,
        description: member.description,
        systemPrompt: member.systemPrompt,
        standingObjective: member.standingObjective,
        systemKey: member.systemKey,
        // The staff run on the fast tier resolved at run time; the field is
        // display-truth, not a routing decision.
        modelId: "fast-chat (resolved at run time)",
        thinkingMode: false,
        isActive: true,
        isGlobal: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

async function staffAgent(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  systemKey: string
) {
  const candidates = (
    await ctx.db
      .query("agents")
      .withIndex("by_active_created", (q) => q.eq("isActive", true))
      .take(500)
  ).concat(
    await ctx.db
      .query("agents")
      .withIndex("by_active_created", (q) => q.eq("isActive", false))
      .take(500)
  );
  return candidates.find((agent) => agent.systemKey === systemKey) ?? null;
}

/** The switch, honoured before any spend. A missing row reads as active so
 * a fresh deployment's first sweep can seed and still work. */
/**
 * Close off a staff round started from the Run button.
 *
 * The round itself is a sweep, not a model loop, so nothing on the agent
 * runtime is going to write the outcome on the run record. This does.
 */
export const finishStaffRunInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    summary: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    await ctx.db.patch(args.runId, {
      status: args.status,
      finalOutput: args.summary,
      ...(args.status === "FAILED" ? { error: args.summary } : {}),
      completedAt: now,
      updatedAt: now,
    });
    const run = await ctx.db.get(args.runId);
    if (run) {
      await adoptRoundLogs(ctx, {
        runId: args.runId,
        agentId: run.agentId,
        companyId: run.companyId,
        since: args.startedAt,
      });
    }
    if (args.workflowExecutionId) {
      await ctx.db.patch(args.workflowExecutionId, {
        status: args.status === "SUCCESS" ? "SUCCESS" : "FAILED",
        completedAt: now,
      });
    }
  },
});

/** Stamp the round's log lines with the run that produced them.
 *
 * The staff write their model exchanges as they work, but the run record is
 * only created when the round closes — so at writing time there is no run id
 * to stamp. Without this adoption pass every staff run's detail page said
 * "Nothing was recorded for this job" for ever, whatever the round did
 * (Anthony, 2026-08-20: "still blank... still nothing changes"). */
async function adoptRoundLogs(
  ctx: { db: import("./_generated/server").MutationCtx["db"] },
  args: {
    runId: Id<"agentRuns">;
    agentId: Id<"agents">;
    companyId?: Id<"companies">;
    since: number;
  }
): Promise<void> {
  const orphans = await ctx.db
    .query("agentLogs")
    .withIndex("by_agent", (q) =>
      q.eq("agentId", args.agentId).gte("createdAt", args.since)
    )
    .take(200);
  for (const log of orphans) {
    if (log.runId) continue;
    if ((log.companyId ?? undefined) !== (args.companyId ?? undefined)) continue;
    await ctx.db.patch(log._id, { runId: args.runId });
  }
}

export const isStaffActiveInternal = internalQuery({
  args: { systemKey: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const agent = await staffAgent(ctx, args.systemKey);
    return agent ? agent.isActive : true;
  },
});

/** One staff model call, written into the same cost ledger and raw log every
 * other agent's dashboard reads. The staff worked for weeks with these
 * screens reading zero — generations, tokens, cost, transcript, all blank —
 * because the sweep path never wrote a row (Anthony, 2026-08-20: "how do i
 * know if this works if they are all blank"). The work happened; nobody
 * wrote it down. */
export const recordStaffModelCallInternal = internalMutation({
  args: {
    systemKey: v.string(),
    companyId: v.optional(v.id("companies")),
    actionContext: v.string(),
    modelId: v.string(),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    inputTokens: v.number(),
    outputTokens: v.number(),
    promptContent: v.string(),
    responseContent: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const agent = await staffAgent(ctx, args.systemKey);
    if (!agent) return;
    const rates = await ctx.db
      .query("aiModels")
      .withIndex("by_model_id", (q) => q.eq("modelId", args.modelId))
      .first();
    const inRate = rates
      ? args.inputTokens > 200000
        ? rates.standardInputCostAbove200k ?? 0
        : rates.standardInputCostBelow200k ?? 0
      : 0;
    const outRate = rates?.outputResponseCost ?? 0;
    const costGBP =
      (args.inputTokens / 1_000_000) * inRate +
      (args.outputTokens / 1_000_000) * outRate;
    const now = Date.now();
    await ctx.db.insert("agentTransactions", {
      agentId: agent._id as Id<"agents">,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      actionContext: args.actionContext,
      modelUsed: args.modelId,
      ...(args.providerKey ? { providerKey: args.providerKey } : {}),
      ...(args.providerModelId ? { providerModelId: args.providerModelId } : {}),
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costGBP,
      status: "SUCCESS",
      createdAt: now,
    });
    await ctx.db.insert("agentLogs", {
      agentId: agent._id as Id<"agents">,
      interactionType: args.actionContext,
      promptContent: args.promptContent,
      responseContent: args.responseContent,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      outcome: "SUCCESS",
      createdAt: now,
    });
  },
});

/** A finished piece of staff work, on the same run table every other
 * agent's history lives in — the Agents screen shows it like any run. */
export const recordStaffRunInternal = internalMutation({
  args: {
    systemKey: v.string(),
    companyId: v.optional(v.id("companies")),
    trigger: v.union(v.literal("SCHEDULE"), v.literal("EVENT")),
    objective: v.string(),
    summary: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const agent = await staffAgent(ctx, args.systemKey);
    if (!agent) return;
    const now = Date.now();
    const runId = await ctx.db.insert("agentRuns", {
      agentId: agent._id as Id<"agents">,
      triggerType: args.trigger,
      objective: args.objective,
      title: agent.name,
      status: "SUCCESS",
      ...(args.companyId ? { companyId: args.companyId } : {}),
      finalOutput: args.summary,
      startedAt: args.startedAt,
      completedAt: now,
      updatedAt: now,
    });
    await adoptRoundLogs(ctx, {
      runId,
      agentId: agent._id as Id<"agents">,
      companyId: args.companyId,
      since: args.startedAt,
    });
    await adoptRoundDecisions(ctx, {
      runId,
      companyId: args.companyId,
      since: args.startedAt,
      decisionKeys: STAFF_DECISION_KEYS[args.systemKey] ?? [],
    });
  },
});

/** Which Decisions each staff member makes, so a round's runs can be filed under its agent run. */
const STAFF_DECISION_KEYS: Record<string, string[]> = {
  WIKI_FILING_CLERK: ["wiki.worth-filing"],
  WIKI_FRESHNESS_CHECKER: ["wiki.claim-supported"],
  WIKI_CONTRADICTION_FINDER: ["wiki.claims-disagree"],
};

/**
 * The Decision runs this round made, filed under its agent run the same way
 * its logs are (decisions-typesafe-plan.md, Phase E): the staff record the
 * run at the end of a round, so the runs are adopted by time and key.
 */
async function adoptRoundDecisions(
  ctx: { db: import("./_generated/server").MutationCtx["db"] },
  args: { runId: Id<"agentRuns">; companyId?: Id<"companies">; since: number; decisionKeys: string[] },
): Promise<void> {
  if (args.decisionKeys.length === 0) return;
  const keys = new Set(args.decisionKeys);
  const orphans = await ctx.db
    .query("decisionRuns")
    .withIndex("by_company_created", (q) => q.eq("companyId", args.companyId).gte("createdAt", args.since))
    .take(500);
  for (const run of orphans) {
    if (run.agentRunId || !keys.has(run.decisionKey)) continue;
    await ctx.db.patch(run._id, { agentRunId: args.runId });
  }
}
