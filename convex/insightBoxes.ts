import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite } from "./siteAccess";
import { ask, factLines, type InsightsRunArgs } from "./insightsAsk";
import type { TeamMember } from "./insightsTeam";
import { briefFor } from "./utils/insightBriefs";
import { factValidator, factsByKey, type Fact } from "./utils/insightFacts";
import { BOXES, BOX_FORMAT, BOX_SCREENS, boxScreenValidator, boxScreensAt, boxesFrom, factsForBox, screensByRole, type BoxScreen } from "./utils/insightBoxes";
import { decisionFacts, funnelFacts, trackFacts } from "./utils/insightBoxFacts";
import { COMPETING_REASONS } from "./utils/insightDecisions";
import { savedDecisionsOf } from "./insightDecisions";

/**
 * The screens' "What Hakken sees" boxes (utils/insightBoxes.ts;
 * insights-one-voice-plan.md phase 4): each week, after the save, every
 * specialist with screens of its own writes their boxes in one request, from
 * its discipline's figures; each is kept, a screen's last replaced, and read
 * by the screen and by Ask Hakken. Only the caller's own company is read.
 */

const boxValidator = v.object({ screen: boxScreenValidator, says: v.array(v.string()), role: v.string(), period: v.optional(v.string()) });

/**
 * For the step after the save: every specialist's boxes written and kept, and
 * the run's log saying which — or, `afterDecisions`, those written once the
 * week's Page decisions are made. Each is given its discipline's figures,
 * those worked out from what is saved first (utils/insightBoxFacts.ts).
 */
export async function writeBoxes(
  ctx: ActionCtx,
  run: InsightsRunArgs,
  week: string,
  rules: string,
  reading: readonly Fact[],
  member: (role: string) => TeamMember | undefined,
  period: string | null,
  afterDecisions = false,
): Promise<void> {
  const now = boxScreensAt(afterDecisions);
  const saved = await ctx.runQuery(internal.insightBoxes.boxFactsInternal, { holdId: run.holdId, screens: now });
  const facts = [...funnelFacts(reading), ...saved.facts, ...reading];
  const held = factsByKey(facts);
  const written: Array<{ screen: BoxScreen; says: string[]; role: string; period?: string }> = [];
  const failed: string[] = [];
  await Promise.all([...screensByRole(now)].map(async ([role, screens]) => {
    // A period screen's box is written for the period it opens on; without one, it isn't written.
    const asked = screens.filter((screen) => !BOXES[screen].period || period);
    const given = [...new Map(asked.flatMap((screen) => factsForBox(screen, facts)).map((fact) => [fact.key, fact])).values()];
    if (asked.length === 0 || given.length === 0) return;
    try {
      const system = [rules, briefFor(role, member(role)?.instructions), BOX_FORMAT].filter(Boolean).join("\n\n");
      const about = (screen: BoxScreen) => (saved.about as Partial<Record<BoxScreen, unknown>>)[screen];
      const prompt = JSON.stringify({ website: run.host, screens: asked.map((screen) => ({ screen, wants: BOXES[screen].wants, ...(about(screen) ? { about: about(screen) } : {}) })), facts: factLines(given) });
      const answer = await ask(ctx, run, member(role) ?? member("INSIGHTS_HEAD_OF_STRATEGY"), `the ${role} boxes`, system, prompt);
      for (const box of boxesFrom(answer, asked, held)) written.push({ ...box, role, ...(BOXES[box.screen].period && period ? { period } : {}) });
    } catch (error) {
      failed.push(`${role}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));
  await ctx.runMutation(internal.insightBoxes.saveBoxes, { holdId: run.holdId, week, boxes: written, screens: now });
  await ctx.runMutation(internal.roleRuns.logRunLine, {
    runId: run.runId, companyId: run.companyId, heading: afterDecisions ? "Page decisions' box" : "Screens' boxes",
    detail: `${written.length} of ${now.length} screens' boxes written by their specialists${written.length > 0 ? `: ${written.map((box) => box.screen.toLowerCase()).join(", ")}` : ""}.${failed.length > 0 ? ` Not reached, so those screens keep their own words: ${failed.join("; ")}.` : ""}`.slice(0, 900),
    failed: written.length === 0 && failed.length > 0,
  });
}

/** What a box is told about its screen, in words. */
const aboutValidator = v.object({
  TRACK_RECORD: v.optional(v.array(v.object({ finding: v.string(), specialist: v.string(), checked: v.union(v.string(), v.null()), note: v.union(v.string(), v.null()) }))),
  PAGE_DECISIONS: v.optional(v.array(v.object({ page: v.string(), do: v.string(), into: v.union(v.string(), v.null()), why: v.string() }))),
});

/** Pages to act on a Page decisions box is told about, in words: the most visited first. */
const DECISIONS_ABOUT = 10;
/** Checked findings a Track record box is told about, the newest first. */
const TRACK_ABOUT = 5;

/**
 * The figures and words the boxes written now need beyond the run's reading:
 * Track record's, from the website's findings and the changes made since;
 * Page decisions', from the decisions as kept.
 */
export const boxFactsInternal = internalQuery({
  args: { holdId: v.id("companyWebsites"), screens: v.array(boxScreenValidator) },
  returns: v.object({ facts: v.array(factValidator), about: aboutValidator }),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const facts: Fact[] = [];
    const about: Infer<typeof aboutValidator> = {};
    if (!hold) return { facts, about };
    if (args.screens.includes("TRACK_RECORD")) {
      const findings = (await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId)).order("desc").take(500)).filter((row) => row.status === "PUBLISHED");
      const changes = (await ctx.db.query("insightChanges").withIndex("by_company_created", (q) => q.eq("companyId", hold.companyId)).order("desc").take(200)).filter((row) => row.companyWebsiteId === args.holdId);
      facts.push(...trackFacts(findings, changes));
      about.TRACK_RECORD = findings.filter((row) => row.outcome).slice(0, TRACK_ABOUT).map((row) => ({ finding: row.headline, specialist: row.specialist, checked: row.outcome ?? null, note: row.outcomeNote ?? null }));
    }
    if (args.screens.includes("PAGE_DECISIONS")) {
      const saved = await savedDecisionsOf(ctx, args.holdId);
      facts.push(...decisionFacts(saved, COMPETING_REASONS));
      about.PAGE_DECISIONS = saved.decisions.filter((row) => row.verdict !== "KEEP").sort((a, b) => b.visits - a.visits).slice(0, DECISIONS_ABOUT)
        .map((row) => ({ page: row.path, do: row.verdict.toLowerCase(), into: row.into ?? null, why: row.why ?? row.reason }));
    }
    return { facts, about };
  },
});

/** The boxes written now kept, each of those screens' last replaced; a screen not written this time keeps none, so it says its own. */
export const saveBoxes = internalMutation({
  args: { holdId: v.id("companyWebsites"), week: v.string(), boxes: v.array(boxValidator), screens: v.optional(v.array(boxScreenValidator)) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return null;
    const now = Date.now();
    for (const screen of args.screens ?? BOX_SCREENS) {
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
