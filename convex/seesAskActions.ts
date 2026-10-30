"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { failureSummary } from "./roleRuns";
import { ask, factLines, rulesFor, type InsightsRunArgs } from "./insightsAsk";
import type { TeamMember } from "./insightsTeam";
import { INSIGHTS_LEAD_ROLE, type InsightsRole } from "./utils/agentRoles";
import { briefFor } from "./utils/insightBriefs";
import { factsByKey } from "./utils/insightFacts";
import {
  ROUTE_FORMAT, SECOND_LOOK_FORMAT, SEES_FORMAT, factsOf, gradeSees, secondLookFrom, seesAskValidator, seesFrom, writerFrom, writersForHead,
  type SeesLink, type SeesVerdict,
} from "./utils/seesAsk";

/**
 * The eye asks the Insights team (sees-conversion-specialist-plan-2026-10-30.md
 * S8, S12; Anthony: "keep the paths clean … if everything goes through the
 * Head the quality is easier to maintain"): one path, the weekly run's. The
 * Head of Strategy is handed the page and picks the specialist; the
 * specialist writes the bubble from the page's figures and nothing else,
 * with what it was told before (its memories, stronger-agents-plan A4); the
 * Editor's code checks every number and every word (`seesFrom`); the Head
 * takes a second look at whether it is the most useful thing to say (A5);
 * the answer is saved and the bubble shows it. Every call is a step on the
 * Head's run with its cost, held by its spend limit (`ask`). Nothing here
 * asks Google. The eval set runs the same path (A6, `runSeesEval`).
 */

type Page = { host: string; screen: string; about: string; period: string; from?: string; to?: string; country: string; facts: Parameters<typeof factsOf>[0]["facts"]; links: readonly SeesLink[]; shop: boolean };
type Written = { verdict: SeesVerdict; role: InsightsRole; lines: Array<{ heading: string; detail: string; failed?: boolean }> };
/** An eval page as `seesAsk.evalPagesInternal` gives it: named here so the action's type never depends on its own module. */
type EvalPage = { _id: Id<"seesEvalPages">; companyId: Id<"companies">; companyWebsiteId: Id<"companyWebsites">; host: string; screen: string; about: string; facts: Page["facts"]; links: SeesLink[]; expected: string[] };

/** The team writes one page's bubble: the Head picks, the specialist writes, the Editor checks, the Head looks again. */
async function writeBubble(ctx: ActionCtx, run: InsightsRunArgs, page: Page): Promise<Written> {
  const lines: Written["lines"] = [];
  const setup = await ctx.runQuery(internal.insightsTeam.teamSetup, {});
  const member = (role: string): TeamMember | undefined => setup.members.find((entry) => entry.role === role && entry.isActive);
  const lead = member(INSIGHTS_LEAD_ROLE);
  const facts = factsOf(page);
  const held = factsByKey(facts);
  const rules = rulesFor(run);
  // 1. The Head of Strategy picks who answers (S8): every writer on the team, by what the page is about.
  let role: InsightsRole | null = null;
  try {
    const system = [rules, briefFor(INSIGHTS_LEAD_ROLE, lead?.instructions), ROUTE_FORMAT].filter(Boolean).join("\n\n");
    const prompt = JSON.stringify({ website: page.host, page: page.about, screen: page.screen, figures: factLines(facts).slice(0, 40), specialists: writersForHead() });
    const answer = await ask(ctx, run, lead, "the Head of Strategy choosing who answers", system, prompt, undefined, (value) => writerFrom(value) !== null);
    role = writerFrom(answer);
  } catch (error) {
    lines.push({ heading: "The Head of Strategy", detail: `Could not choose: ${failureSummary(error)}. The Conversion specialist answers.` });
  }
  const chosen: InsightsRole = role ?? "INSIGHTS_CONVERSION";
  lines.push({ heading: "The Head of Strategy", detail: `Handed ${page.about} to ${chosen.replace("INSIGHTS_", "").toLowerCase().replace(/_/g, " ")}.` });
  // 2. The specialist writes, from the page's figures and nothing else (S4, S5), with what it was told before (A4).
  const writer = member(chosen) ?? lead;
  const memories: Array<{ content: string }> = writer ? await ctx.runQuery(internal.agentMemories.getAlwaysMemoriesInternal, { agentId: writer.agentId, companyId: run.companyId }).catch(() => []) : [];
  const toldBefore = memories.length > 0 ? `What you were told before, which binds you:\n${memories.map((memory) => `- ${memory.content}`).join("\n")}` : "";
  const system = [rules, briefFor(chosen, member(chosen)?.instructions), toldBefore, SEES_FORMAT].filter(Boolean).join("\n\n");
  const links = page.links.map((link, number) => ({ number, label: link.label }));
  const prompt = JSON.stringify({ website: page.host, page: page.about, dates: page.from && page.to ? `${page.from} to ${page.to}` : page.period, facts: factLines(facts), links });
  const answer = await ask(ctx, run, writer, `the ${chosen.replace("INSIGHTS_", "").toLowerCase()} writing the bubble`, system, prompt, undefined, (value) => value !== null && typeof value === "object" && "says" in value);
  // 3. The Editor checks every number and every word (S5, S7): what fails goes back.
  let verdict = seesFrom(answer, held, page.links);
  if (!verdict.ok) return { verdict, role: chosen, lines };
  // 4. The Head's second look (A5): the most useful thing, or a rewrite — kept only when the Editor passes it too.
  try {
    const look = JSON.stringify({ website: page.host, page: page.about, bubble: { says: verdict.says, steps: verdict.steps.map((step) => step.words) }, facts: factLines(facts), links });
    const second = await ask(ctx, run, lead, "the Head of Strategy's second look", [rules, briefFor(INSIGHTS_LEAD_ROLE, lead?.instructions), SECOND_LOOK_FORMAT].filter(Boolean).join("\n\n"), look);
    const read = secondLookFrom(second);
    if (read.useful) {
      lines.push({ heading: "Second look", detail: "The Head of Strategy kept the specialist's words: the most useful thing the page says." });
    } else {
      const rewritten = seesFrom(read.rewrite, held, page.links);
      if (rewritten.ok) {
        verdict = rewritten;
        lines.push({ heading: "Second look", detail: "The Head of Strategy said more useful words, which the Editor passed." });
      } else {
        lines.push({ heading: "Second look", detail: `The Head of Strategy's rewrite went back (${rewritten.why}); the specialist's words stand.` });
      }
    }
  } catch (error) {
    lines.push({ heading: "Second look", detail: `Not taken: ${failureSummary(error)}. The specialist's words stand.` });
  }
  return { verdict, role: chosen, lines };
}

/** The eye was pressed: write the page's bubble and save it, or say why it went back. */
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
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    const run: InsightsRunArgs = { runId: args.runId, companyId: args.companyId, host: args.host, holdId: args.holdId, shop: args.shop };
    const log = (heading: string, detail: string, failed = false) => ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading, detail: detail.slice(0, 900), failed });
    const sentBack = async (why: string, role?: InsightsRole) => {
      await ctx.runMutation(internal.seesAsk.saveSeesAnswer, { answerId: args.answerId, status: "FAILED", says: [], steps: [], ...(role ? { role } : {}), failedWhy: why });
      await log("Sent back", why, true);
      await ctx.runMutation(internal.roleRuns.finishRoleRun, { runId: args.runId, status: "FAILED", summary: `The bubble was not written: ${why}` });
    };
    try {
      const written = await writeBubble(ctx, run, args);
      for (const line of written.lines) await log(line.heading, line.detail, line.failed ?? false);
      if (!written.verdict.ok) {
        await sentBack(written.verdict.why, written.role);
        return null;
      }
      await ctx.runMutation(internal.seesAsk.saveSeesAnswer, { answerId: args.answerId, status: "WRITTEN", says: written.verdict.says, steps: written.verdict.steps, role: written.role });
      await log("The Editor", `Passed: ${written.verdict.says.length} sentence${written.verdict.says.length === 1 ? "" : "s"}, ${written.verdict.steps.length} step${written.verdict.steps.length === 1 ? "" : "s"}.`);
      await ctx.runMutation(internal.roleRuns.finishRoleRun, { runId: args.runId, status: "SUCCESS", summary: `The bubble for ${args.about} on ${args.host}: ${written.verdict.says.join(" ")}`.slice(0, 900) });
    } catch (error) {
      await sentBack(failureSummary(error));
    }
    return null;
  },
});

/**
 * The eval set graded (stronger-agents-plan-2026-10-30.md A6): every kept
 * page's bubble written again by the team as it stands now, the Editor's
 * verdict and how close it came to Anthony's sentences, each saved as a
 * grading on one run of the Head's. Nothing is shown to a client.
 */
export const runSeesEval = internalAction({
  args: { runId: v.id("agentRuns"), pageIds: v.optional(v.array(v.id("seesEvalPages"))) },
  returns: v.object({ graded: v.number(), passed: v.number(), score: v.number() }),
  handler: async (ctx, args): Promise<{ graded: number; passed: number; score: number }> => {
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    const pages: EvalPage[] = await ctx.runQuery(internal.seesAsk.evalPagesInternal, { pageIds: args.pageIds });
    let passed = 0;
    let total = 0;
    for (const page of pages) {
      const run: InsightsRunArgs = { runId: args.runId, companyId: page.companyId, host: page.host, holdId: page.companyWebsiteId, shop: false };
      let written: Written;
      try {
        written = await writeBubble(ctx, run, { ...page, period: "eval", country: "", shop: false });
      } catch (error) {
        written = { verdict: { ok: false, why: failureSummary(error) }, role: "INSIGHTS_CONVERSION", lines: [] };
      }
      const says = written.verdict.ok ? written.verdict.says : [];
      const grade = gradeSees(page.expected, says);
      const notes = [...written.lines.map((line) => `${line.heading}: ${line.detail}`), ...(written.verdict.ok ? [] : [`Sent back: ${written.verdict.why}`]), ...grade.notes];
      await ctx.runMutation(internal.seesAsk.saveSeesEvalRun, {
        pageId: page._id,
        runId: args.runId,
        role: written.role,
        says,
        steps: written.verdict.ok ? written.verdict.steps : [],
        passed: written.verdict.ok,
        score: written.verdict.ok ? grade.score : 0,
        notes,
      });
      if (written.verdict.ok) passed += 1;
      total += written.verdict.ok ? grade.score : 0;
    }
    const score = pages.length > 0 ? Math.round((total / pages.length) * 100) / 100 : 0;
    await ctx.runMutation(internal.roleRuns.finishRoleRun, {
      runId: args.runId,
      status: "SUCCESS",
      summary: pages.length === 0 ? "The eval set holds no pages yet." : `${pages.length} page${pages.length === 1 ? "" : "s"} graded: ${passed} passed the Editor; ${Math.round(score * 100)}% of Anthony's figures named.`,
    });
    return { graded: pages.length, passed, score };
  },
});
