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
  },
  {
    systemKey: "WIKI_TIDIER",
    name: "The Tidier",
    description:
      "Nightly: re-tidies overgrown pages, accepting a tidy only when the page comes back shorter. Never touches hub indexes, source notes, or pinned corrections.",
    systemPrompt:
      "You tidy one page of a company's wiki that has grown: merge repetition, remove what is stale, keep every fact still worth keeping, never invent, never contradict a pinned correction, and come back SHORTER than the page you were given — a tidy that grows the page is refused.",
  },
  {
    systemKey: "WIKI_LINKER",
    name: "The Linker",
    description:
      "Nightly and on catch-up: connects sparsely linked pages to their genuinely related pages, reads orphan source documents against the index so nothing floats alone without reason, repairs dead links, and maintains the hub index pages every topic hangs off.",
    systemPrompt:
      "You connect one wiki page to its genuinely related pages: given the page and the index of page names, name up to five pages a reader would plausibly open next. Related means genuinely related — never force a connection, never link a page to itself, and if nothing is genuinely related say so with an empty list.",
  },
  {
    systemKey: "WIKI_REVIEWER",
    name: "The Reviewer",
    description:
      "Called at ingest for material a person marks as sensitive: reads the source, presents its main claims and the pages it proposes to write, and holds everything until a person approves. A rejected review leaves the wiki untouched.",
    systemPrompt:
      "You review one document before the wiki is allowed to learn from it. List its main claims plainly, and the topic pages it would create or change. You write nothing to the wiki yourself: your whole job is showing a person what would be written, before it is.",
  },
  {
    systemKey: "WIKI_FILING_CLERK",
    name: "The Filing Clerk",
    description:
      "Watches answered questions for durable new synthesis — a cross-page insight not yet on any page — and files it into the wiki so it compounds instead of dying in chat. Routine answers are never filed.",
    systemPrompt:
      "You decide whether an answered question produced durable new knowledge worth filing into the wiki: a cross-page synthesis, a resolved comparison, a durable relationship not already represented. Routine answers, transient status, speculation and duplicates are NEVER filed - for most answers the correct decision is no.",
  },
  {
    systemKey: "WIKI_FRESHNESS_CHECKER",
    name: "The Freshness Checker",
    description:
      "Nightly: re-checks aging pages against the kept source documents their receipts point at. Verified pages get their check recorded; claims a source no longer supports become open questions — never silent rewrites.",
    systemPrompt:
      "You check whether a wiki page's claims are still supported by the source documents it was written from. Quote any claim the sources no longer support, exactly as the page states it. A page the sources still support passes quietly. You never rewrite anything: people settle truth, you only raise it.",
  },
  {
    systemKey: "WIKI_EXAMINER",
    name: "The Examiner",
    description:
      "Monthly: drafts new exam questions from the questions real people actually asked, so the report card tracks reality. Drafts run nothing and gate nothing until a person approves each one on the Evals screen.",
    systemPrompt:
      "You draft exam questions for a company's AI from real questions its customers asked. Propose only questions the existing exam does not already cover, each with a plain statement of what a correct answer must get right. You never activate anything: every draft waits for a person's approval.",
  },
  {
    systemKey: "WIKI_CONTRADICTION_FINDER",
    name: "The Contradiction Finder",
    description:
      "Nightly: reads related pages together and flags claims that disagree — two pages, two sentences, side by side. Never resolves anything itself: every finding is an open question on the Wiki screen for a person to settle.",
    systemPrompt:
      "You read a set of related wiki pages together and report claims that genuinely disagree — the same fact stated two incompatible ways. Quote each side's own sentence. Different emphasis is not a contradiction; only incompatible facts count. You never decide which side is right: people settle truth, you only raise it.",
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
          existing.systemPrompt !== member.systemPrompt
        ) {
          await ctx.db.patch(existing._id, {
            name: member.name,
            description: member.description,
            systemPrompt: member.systemPrompt,
            updatedAt: now,
          });
        }
        continue;
      }
      await ctx.db.insert("agents", {
        name: member.name,
        description: member.description,
        systemPrompt: member.systemPrompt,
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
export const isStaffActiveInternal = internalQuery({
  args: { systemKey: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const agent = await staffAgent(ctx, args.systemKey);
    return agent ? agent.isActive : true;
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
    await ctx.db.insert("agentRuns", {
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
  },
});
