import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Reading and writing the Skill Center's pre-computed counts.
 *
 * Kept beside the other rollup services rather than inside `agentSkills.ts` so
 * the rebuild and the read share one definition of the shape, and so a caller
 * that only wants to display the numbers does not import the module that knows
 * how to produce them.
 */

export const GLOBAL_AGENT_SKILL_ROLLUP_KEY = "global";

type RollupMutationCtx = Pick<MutationCtx, "db">;
type RollupQueryCtx = Pick<QueryCtx, "db">;

export type AgentSkillRollupTotals = Omit<
  Doc<"agentSkillRollups">,
  "_id" | "_creationTime" | "key" | "computedAt"
>;

/**
 * What the screen shows before the first rebuild has run.
 *
 * Zeros with `computedAt: null` rather than zeros pretending to be a count:
 * "not measured yet" and "measured, and the answer is nothing" are different
 * statements, and a health panel that cannot tell them apart is the reason the
 * old one read as broken on a new account.
 */
export const emptyAgentSkillRollup: AgentSkillRollupTotals = {
  skills: 0,
  activeSkills: 0,
  draftSkills: 0,
  archivedSkills: 0,
  highRiskSkills: 0,
  totalBindings: 0,
  enabledBindings: 0,
  activeAgentBindings: 0,
  outdatedBindings: 0,
  currentBindings: 0,
  validatedBindings: 0,
  needsSmokeBindings: 0,
  highRiskNeedsSmokeBindings: 0,
  needsAttention: [],
  skillsCounted: 0,
  isPartial: false,
};

export async function getAgentSkillRollup(ctx: RollupQueryCtx) {
  return await ctx.db
    .query("agentSkillRollups")
    .withIndex("by_key", (q) => q.eq("key", GLOBAL_AGENT_SKILL_ROLLUP_KEY))
    .first();
}

/** Overwrite the single global rollup document, stamping when it was computed. */
export async function replaceAgentSkillRollup(
  ctx: RollupMutationCtx,
  totals: AgentSkillRollupTotals,
  computedAt: number,
) {
  const existing = await ctx.db
    .query("agentSkillRollups")
    .withIndex("by_key", (q) => q.eq("key", GLOBAL_AGENT_SKILL_ROLLUP_KEY))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, { ...totals, computedAt });
    return existing._id;
  }

  return await ctx.db.insert("agentSkillRollups", {
    key: GLOBAL_AGENT_SKILL_ROLLUP_KEY,
    ...totals,
    computedAt,
  });
}
