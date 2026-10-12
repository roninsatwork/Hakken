import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, type ActionCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite } from "./siteAccess";
import { ask, factLines, type InsightsRunArgs } from "./insightsAsk";
import type { TeamMember } from "./insightsTeam";
import { briefFor } from "./utils/insightBriefs";
import { factsByKey, type Fact } from "./utils/insightFacts";
import { BOXES, BOX_FORMAT, BOX_SCREENS, boxScreenValidator, boxesFrom, factsForBox, screensByRole, type BoxScreen } from "./utils/insightBoxes";

/**
 * The screens' "What Hakken sees" boxes (utils/insightBoxes.ts;
 * insights-one-voice-plan.md phase 4): each week, after the save, every
 * specialist with screens of its own writes their boxes in one request, from
 * its discipline's figures; each is kept, a screen's last replaced, and read
 * by the screen and by Ask Hakken. Only the caller's own company is read.
 */

const boxValidator = v.object({ screen: boxScreenValidator, says: v.array(v.string()), role: v.string(), period: v.optional(v.string()) });

/** For the step after the save: every specialist's boxes written and kept, and the run's log saying which. */
export async function writeBoxes(
  ctx: ActionCtx,
  run: InsightsRunArgs,
  week: string,
  rules: string,
  facts: readonly Fact[],
  member: (role: string) => TeamMember | undefined,
  period: string | null,
): Promise<void> {
  const held = factsByKey(facts);
  const written: Array<{ screen: BoxScreen; says: string[]; role: string; period?: string }> = [];
  const failed: string[] = [];
  await Promise.all([...screensByRole()].map(async ([role, screens]) => {
    // A period screen's box is written for the period it opens on; without one, it isn't written.
    const asked = screens.filter((screen) => !BOXES[screen].period || period);
    const given = [...new Map(asked.flatMap((screen) => factsForBox(screen, facts)).map((fact) => [fact.key, fact])).values()];
    if (asked.length === 0 || given.length === 0) return;
    try {
      const system = [rules, briefFor(role, member(role)?.instructions), BOX_FORMAT].filter(Boolean).join("\n\n");
      const prompt = JSON.stringify({ website: run.host, screens: asked.map((screen) => ({ screen, wants: BOXES[screen].wants })), facts: factLines(given) });
      const answer = await ask(ctx, run, member(role) ?? member("INSIGHTS_HEAD_OF_STRATEGY"), `the ${role} boxes`, system, prompt);
      for (const box of boxesFrom(answer, asked, held)) written.push({ ...box, role, ...(BOXES[box.screen].period && period ? { period } : {}) });
    } catch (error) {
      failed.push(`${role}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));
  await ctx.runMutation(internal.insightBoxes.saveBoxes, { holdId: run.holdId, week, boxes: written });
  await ctx.runMutation(internal.roleRuns.logRunLine, {
    runId: run.runId, companyId: run.companyId, heading: "Screens' boxes",
    detail: `${written.length} of ${BOX_SCREENS.length} screens' boxes written by their specialists${written.length > 0 ? `: ${written.map((box) => box.screen.toLowerCase()).join(", ")}` : ""}.${failed.length > 0 ? ` Not reached, so those screens keep their own words: ${failed.join("; ")}.` : ""}`.slice(0, 900),
    failed: written.length === 0 && failed.length > 0,
  });
}

/** The week's boxes kept, each screen's last replaced; a screen not written this week keeps none, so it says its own. */
export const saveBoxes = internalMutation({
  args: { holdId: v.id("companyWebsites"), week: v.string(), boxes: v.array(boxValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return null;
    const now = Date.now();
    for (const screen of BOX_SCREENS) {
      const old = await ctx.db.query("insightScreenBoxes").withIndex("by_hold_screen", (q) => q.eq("companyWebsiteId", args.holdId).eq("screen", screen)).take(5);
      for (const row of old) await ctx.db.delete(row._id);
    }
    for (const box of args.boxes) {
      await ctx.db.insert("insightScreenBoxes", { companyId: hold.companyId, companyWebsiteId: args.holdId, week: args.week, ...box, createdAt: now });
    }
    return null;
  },
});

/** A website's boxes as kept, for Ask Hakken. */
export async function boxesOf(ctx: { db: import("./_generated/server").QueryCtx["db"] }, holdId: Id<"companyWebsites">) {
  const rows = [];
  for (const screen of BOX_SCREENS) {
    const row = await ctx.db.query("insightScreenBoxes").withIndex("by_hold_screen", (q) => q.eq("companyWebsiteId", holdId).eq("screen", screen)).first();
    if (row) rows.push({ screen: row.screen, says: row.says, role: row.role, week: row.week });
  }
  return rows;
}

/** One screen's box for the website shown: the one chosen, or the company's first owned website with one. Null when none was written. */
export const insightsScreenBox = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")), screen: boxScreenValidator },
  returns: v.union(v.null(), v.object({ says: v.array(v.string()), role: v.string(), week: v.string(), period: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    if (!ctx.companyId) return null;
    if (args.siteId) await requireMySite(ctx, args.siteId);
    const owned = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED" && (!args.siteId || entry.hold._id === args.siteId));
    for (const entry of owned) {
      const row = await ctx.db.query("insightScreenBoxes").withIndex("by_hold_screen", (q) => q.eq("companyWebsiteId", entry.hold._id).eq("screen", args.screen)).first();
      if (row) return { says: row.says, role: row.role, week: row.week, period: row.period ?? null };
      if (args.siteId) return null;
    }
    return null;
  },
});
