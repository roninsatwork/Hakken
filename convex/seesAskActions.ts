"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { failureSummary } from "./roleRuns";
import { ask, factLines, rulesFor, type InsightsRunArgs } from "./insightsAsk";
import { INSIGHTS_LEAD_ROLE, type InsightsRole } from "./utils/agentRoles";
import { briefFor } from "./utils/insightBriefs";
import { factsByKey } from "./utils/insightFacts";
import { ROUTE_FORMAT, SEES_FORMAT, factsOf, seesAskValidator, seesFrom, writerFrom, writersForHead } from "./utils/seesAsk";

/**
 * The eye asks the Insights team (sees-conversion-specialist-plan-2026-10-30.md
 * S8, S12; Anthony: "keep the paths clean … if everything goes through the
 * Head the quality is easier to maintain"): one path, the weekly run's. The
 * Head of Strategy is handed the page and picks the specialist; the
 * specialist writes the bubble from the page's figures and nothing else; the
 * Editor's code checks every number and every word (`seesFrom`); the answer
 * is saved and the bubble shows it. Every call is a step on the Head's run
 * with its cost, held by its spend limit (`ask`). Nothing here asks Google.
 */
export const writeSeesAnswer = internalAction({
  args: {
    runId: v.id("agentRuns"),
    answerId: v.id("seesAnswers"),
    holdId: v.id("companyWebsites"),
    companyId: v.id("companies"),
    host: v.string(),
    screen: v.string(),
    about: v.string(),
    period: v.string(),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    country: v.string(),
    facts: seesAskValidator.facts,
    links: seesAskValidator.links,
    shop: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    const run: InsightsRunArgs = { runId: args.runId, companyId: args.companyId, host: args.host, holdId: args.holdId, shop: args.shop };
    const log = (heading: string, detail: string, failed = false) => ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading, detail: detail.slice(0, 900), failed });
    const sentBack = async (why: string, role?: InsightsRole) => {
      await ctx.runMutation(internal.seesAsk.saveSeesAnswer, { answerId: args.answerId, status: "FAILED", says: [], steps: [], ...(role ? { role } : {}), failedWhy: why });
      await log("Sent back", why, true);
      await ctx.runMutation(internal.roleRuns.finishRoleRun, { runId: args.runId, status: "FAILED", summary: `The bubble was not written: ${why}` });
    };
    try {
      const setup = await ctx.runQuery(internal.insightsTeam.teamSetup, {});
      const member = (role: string) => setup.members.find((entry) => entry.role === role && entry.isActive);
      const lead = member(INSIGHTS_LEAD_ROLE);
      const facts = factsOf(args);
      const held = factsByKey(facts);
      const rules = rulesFor(run);
      // 1. The Head of Strategy picks who answers (S8): every writer on the team, by what the page is about.
      const writers = writersForHead();
      let role: InsightsRole | null = null;
      try {
        const system = [rules, briefFor(INSIGHTS_LEAD_ROLE, lead?.instructions), ROUTE_FORMAT].filter(Boolean).join("\n\n");
        const prompt = JSON.stringify({ website: args.host, page: args.about, screen: args.screen, figures: factLines(facts).slice(0, 40), specialists: writers });
        const answer = await ask(ctx, run, lead, "the Head of Strategy choosing who answers", system, prompt, undefined, (value) => writerFrom(value) !== null);
        role = writerFrom(answer);
      } catch (error) {
        await log("The Head of Strategy", `Could not choose: ${failureSummary(error)}. The Conversion specialist answers.`, false);
      }
      // A page about conversions goes to the Conversion specialist when the Head said nothing (the screens drawn first).
      const chosen: InsightsRole = role ?? "INSIGHTS_CONVERSION";
      await log("The Head of Strategy", `Handed ${args.about} to ${chosen.replace("INSIGHTS_", "").toLowerCase().replace(/_/g, " ")}.`);
      // 2. The specialist writes, from the page's figures and nothing else (S4, S5).
      const system = [rules, briefFor(chosen, member(chosen)?.instructions), SEES_FORMAT].filter(Boolean).join("\n\n");
      const prompt = JSON.stringify({
        website: args.host,
        page: args.about,
        dates: args.from && args.to ? `${args.from} to ${args.to}` : args.period,
        facts: factLines(facts),
        links: args.links.map((link, number) => ({ number, label: link.label })),
      });
      const answer = await ask(ctx, run, member(chosen) ?? lead, `the ${chosen.replace("INSIGHTS_", "").toLowerCase()} writing the bubble`, system, prompt, undefined, (value) => value !== null && typeof value === "object" && "says" in value);
      // 3. The Editor checks every number and every word (S5, S7): what fails goes back, and the bubble keeps the rule's words.
      const verdict = seesFrom(answer, held, args.links);
      if (!verdict.ok) {
        await sentBack(verdict.why, chosen);
        return null;
      }
      await ctx.runMutation(internal.seesAsk.saveSeesAnswer, { answerId: args.answerId, status: "WRITTEN", says: verdict.says, steps: verdict.steps, role: chosen });
      await log("The Editor", `Passed: ${verdict.says.length} sentence${verdict.says.length === 1 ? "" : "s"}, ${verdict.steps.length} step${verdict.steps.length === 1 ? "" : "s"}.`);
      await ctx.runMutation(internal.roleRuns.finishRoleRun, { runId: args.runId, status: "SUCCESS", summary: `The bubble for ${args.about} on ${args.host}: ${verdict.says.join(" ")}`.slice(0, 900) });
    } catch (error) {
      await sentBack(failureSummary(error));
    }
    return null;
  },
});
