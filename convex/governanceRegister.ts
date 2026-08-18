import type { Doc, Id } from "./_generated/dataModel";
import { governanceQuery, moduleQuery } from "./tenantFunctions";
import { CORE_MODULES } from "./utils/coreModules";
import { getActiveCompanyId } from "./authz";
import {
  sortRegister,
  summariseRegister,
  toAssistantEntry,
  toWidgetEntry,
  toWorkflowEntry,
  type AiSystemEntry,
} from "./governanceRegisterService";

/**
 * Every AI system this organisation is running.
 *
 * Read, never filed. Creating an assistant, publishing a widget or adding an
 * AI step to a workflow puts the thing here immediately, because this counts
 * what exists rather than what somebody remembered to write down. A register
 * that has to be maintained by hand goes stale, and a stale register is worse
 * than none — it is shown to an auditor who then finds AI running that is not
 * on it.
 *
 * `governanceQuery`, so an auditor can open it without being able to change
 * anything anywhere.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

const SCAN_LIMIT = 1000;

/**
 * How far back "busy" means, and how high the count is worth carrying.
 *
 * Thirty days matches the window the overview screen opens on, so the two
 * screens cannot quote different numbers for the same assistant. The ceiling is
 * there because the figure is a sense of scale rather than an accounting total
 * — past a few hundred runs a month, the reader has the point.
 */
const ACTIVITY_DAYS = 30;
const ACTIVITY_CAP = 500;

function ownerNameOf(user: Doc<"users"> | null): string {
  if (!user) return "";
  return (user.name ?? user.email ?? "").trim();
}

/**
 * Who can be named as accountable for something on the register.
 *
 * Its own query rather than the general user list, which is scoped strictly to
 * the workspace you are standing in. Most assistants belong to no workspace at
 * all — they are platform-wide and serve everybody — so while impersonating a
 * workspace that list came back empty and the accountable-person picker had
 * nobody in it. Anthony, 2026-08-06: *"why cant i assign users."* The register
 * was asking a workspace question about a platform-wide thing.
 *
 * Scoped by the register's own rule, deliberately: your own workspace's people,
 * plus the platform people who belong to no workspace. Those are exactly the
 * two groups who can plausibly be accountable for what this screen lists, and a
 * workspace still never sees another workspace's staff.
 */
export const getOwnerCandidates = governanceQuery({
  args: {},
  handler: async (ctx) => {
    const platformWide = ctx.user.role === "SUPER_ADMIN" || ctx.user.role === "READ_ONLY";
    const scopeCompanyId = platformWide ? undefined : getActiveCompanyId(ctx.user);

    const users = await ctx.db.query("users").take(SCAN_LIMIT);

    return users
      .filter((user) => !scopeCompanyId || user.companyId === scopeCompanyId || user.companyId === undefined)
      // Somebody with no name and no address cannot be held accountable by a
      // reader looking at the register — the point of the field is a person you
      // could go and ask.
      .map((user) => ({ id: user._id, name: (user.name ?? user.email ?? "").trim() }))
      .filter((user) => user.name !== "")
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getAiRegister = moduleQuery({
  module: CORE_MODULES.governance,
  guard: "governance",
  args: {},
  handler: async (ctx) => {
    const scopeCompanyId = ctx.user.role === "SUPER_ADMIN" || ctx.user.role === "READ_ONLY"
      ? undefined
      : getActiveCompanyId(ctx.user);

    /**
     * What belongs on a workspace's register.
     *
     * Their own records, plus the platform-wide ones. Most assistants carry no
     * company at all — they are global and serve every workspace — so matching
     * on company alone would hand a customer an empty register while their
     * assistants were plainly running. A global assistant answering questions
     * in this workspace is AI running in this workspace, whoever set it up.
     */
    const withinScope = <T extends { companyId?: Id<"companies"> }>(row: T) =>
      !scopeCompanyId || row.companyId === scopeCompanyId || row.companyId === undefined;

    const [agents, widgets, workflows] = await Promise.all([
      ctx.db.query("agents").take(SCAN_LIMIT),
      ctx.db.query("widgets").take(SCAN_LIMIT),
      ctx.db.query("workflows").take(SCAN_LIMIT),
    ]);

    const userCache = new Map<string, Doc<"users"> | null>();
    const resolveOwner = async (userId: Id<"users"> | undefined) => {
      if (!userId) return "";
      if (!userCache.has(userId)) userCache.set(userId, await ctx.db.get(userId));
      return ownerNameOf(userCache.get(userId) ?? null);
    };

    const entries: AiSystemEntry[] = [];

    const activitySince = Date.now() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000;

    for (const agent of agents.filter(withinScope)) {
      // The last run is what "in use" means for an assistant; the created date
      // says only that somebody once made one.
      const lastRun = await ctx.db
        .query("agentRuns")
        .withIndex("by_agent_started", (q) => q.eq("agentId", agent._id))
        .order("desc")
        .first();

      // One indexed range read per assistant, bounded by the window at both
      // ends. Counting from the whole table and filtering afterwards would make
      // the register's cost grow with the platform's history rather than with
      // the size of the register.
      const recentRuns = await ctx.db
        .query("agentRuns")
        .withIndex("by_agent_started", (q) => q.eq("agentId", agent._id).gte("startedAt", activitySince))
        .take(ACTIVITY_CAP);

      entries.push({
        ...toAssistantEntry(agent, await resolveOwner(agent.ownerId), lastRun?.startedAt ?? agent.updatedAt),
        activity: recentRuns.length,
      });
    }

    for (const widget of widgets.filter(withinScope)) {
      const agent = widget.agentId ? await ctx.db.get(widget.agentId) : null;
      entries.push(toWidgetEntry(widget, await resolveOwner(widget.createdBy), agent));
    }

    for (const workflow of workflows.filter(withinScope)) {
      entries.push(toWorkflowEntry(workflow, await resolveOwner(workflow.createdBy)));
    }

    const register = sortRegister(entries);

    return { entries: register, summary: summariseRegister(register) };
  },
});
