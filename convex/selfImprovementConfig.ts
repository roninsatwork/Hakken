/**
 * The switches for everything in docs/plans/active/self-improvement-plan.md.
 *
 * One systemConfig row holds the whole object. An absent row means every
 * default; a malformed row means every default too, because a bad config
 * write must never be able to take the assistant down. Each field guards one
 * phase of the plan.
 *
 * `autonomousMemory` replaces the never-wired `autoApplyLowRisk`: on
 * 2026-08-10 the owner decided memory learning is fully automatic — what the
 * AI learns is saved immediately, with no per-memory approval. Auto-saved
 * memories are marked `autoApplied`, audited, and removable; this switch is
 * the platform-wide brake.
 */

import { v } from "convex/values";

import type { DatabaseReader } from "./_generated/server";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";

export const SELF_IMPROVEMENT_CONFIG_KEY = "SELF_IMPROVEMENT_CONFIG";

export type SelfImprovementConfig = {
  /** Phase 1: failed runs classify themselves without an admin pressing the button. */
  autoReflection: boolean;
  /** Phase 2: WHEN_RELEVANT memory ranking blends in outcome history. */
  outcomeWeightedRanking: boolean;
  /** Phase 3: the chat surface shows the Helpful / Not right controls. */
  endUserFeedback: boolean;
  /** Phase 4: knowledge fusion adds the bounded evidence prior. */
  retrievalPriors: boolean;
  /**
   * Phase 5, decided 2026-08-10: memory candidates apply immediately with no
   * per-memory approval. Auto-saved memories carry `autoApplied` and an
   * audit row, and stay removable from the memory screens.
   */
  autonomousMemory: boolean;
};

export const SELF_IMPROVEMENT_DEFAULTS: SelfImprovementConfig = {
  autoReflection: true,
  outcomeWeightedRanking: true,
  endUserFeedback: true,
  retrievalPriors: true,
  autonomousMemory: true,
};

/**
 * Every missing or non-boolean field falls back to its default individually,
 * so a config written by an older deploy keeps working after new switches are
 * added.
 */
export function parseSelfImprovementConfig(value: string | undefined | null): SelfImprovementConfig {
  if (!value) return { ...SELF_IMPROVEMENT_DEFAULTS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    console.warn("SELF_IMPROVEMENT_CONFIG is not valid JSON; using defaults");
    return { ...SELF_IMPROVEMENT_DEFAULTS };
  }
  if (typeof parsed !== "object" || parsed === null) {
    console.warn("SELF_IMPROVEMENT_CONFIG is not an object; using defaults");
    return { ...SELF_IMPROVEMENT_DEFAULTS };
  }
  const record = parsed as Record<string, unknown>;
  const pick = (key: keyof SelfImprovementConfig) =>
    typeof record[key] === "boolean" ? (record[key] as boolean) : SELF_IMPROVEMENT_DEFAULTS[key];
  return {
    autoReflection: pick("autoReflection"),
    outcomeWeightedRanking: pick("outcomeWeightedRanking"),
    endUserFeedback: pick("endUserFeedback"),
    retrievalPriors: pick("retrievalPriors"),
    autonomousMemory: pick("autonomousMemory"),
  };
}

/** The read every runtime call site uses. One indexed get, never throws. */
export async function getSelfImprovementConfig(db: DatabaseReader): Promise<SelfImprovementConfig> {
  const row = await db
    .query("systemConfig")
    .withIndex("by_key", (q) => q.eq("key", SELF_IMPROVEMENT_CONFIG_KEY))
    .first();
  return parseSelfImprovementConfig(row?.value);
}

export const getConfig = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    return await getSelfImprovementConfig(ctx.db);
  },
});

export const updateConfig = superAdminMutation({
  args: {
    autoReflection: v.boolean(),
    outcomeWeightedRanking: v.boolean(),
    endUserFeedback: v.boolean(),
    retrievalPriors: v.boolean(),
    autonomousMemory: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const now = Date.now();
    const next: SelfImprovementConfig = {
      autoReflection: args.autoReflection,
      outcomeWeightedRanking: args.outcomeWeightedRanking,
      endUserFeedback: args.endUserFeedback,
      retrievalPriors: args.retrievalPriors,
      autonomousMemory: args.autonomousMemory,
    };
    const value = JSON.stringify(next);

    const existing = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", SELF_IMPROVEMENT_CONFIG_KEY))
      .first();
    const previous = parseSelfImprovementConfig(existing?.value);

    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedAt: now, updatedBy: userId });
    } else {
      await ctx.db.insert("systemConfig", {
        key: SELF_IMPROVEMENT_CONFIG_KEY,
        value,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPDATE_SYSTEM_PREFERENCES",
      entityType: "systemConfig",
      entityId: SELF_IMPROVEMENT_CONFIG_KEY,
      // The audit entry records what changed, not just the new state, so the
      // trail answers "when did autonomy get switched on and by whom".
      metadata: JSON.stringify({ previous, next }),
      timestamp: now,
    });

    return next;
  },
});
