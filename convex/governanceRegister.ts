import type { Doc, Id } from "./_generated/dataModel";
import { governanceQuery } from "./tenantFunctions";
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

function ownerNameOf(user: Doc<"users"> | null): string {
  if (!user) return "";
  return (user.name ?? user.email ?? "").trim();
}

export const getAiRegister = governanceQuery({
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

    for (const agent of agents.filter(withinScope)) {
      // The last run is what "in use" means for an assistant; the created date
      // says only that somebody once made one.
      const lastRun = await ctx.db
        .query("agentRuns")
        .withIndex("by_agent_started", (q) => q.eq("agentId", agent._id))
        .order("desc")
        .first();

      entries.push(
        toAssistantEntry(agent, await resolveOwner(agent.ownerId), lastRun?.startedAt ?? agent.updatedAt)
      );
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
