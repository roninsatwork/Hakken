"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { failureSummary } from "./roleRuns";
import { ask, factLines, rulesFor, type InsightsRunArgs } from "./insightsAsk";
import { askWithTools, type AgentRead, type FirstRead } from "./insightsToolAsk";
import { analyticsTool, readable } from "./insightsTools";
import type { TeamMember } from "./insightsTeam";
import { INSIGHTS_LEAD_ROLE, type InsightsRole } from "./utils/agentRoles";
import { briefFor } from "./utils/insightBriefs";
import { factsByKey, type Fact } from "./utils/insightFacts";
import { ANALYTICS_READ } from "./utils/agentTools";
import {
  JUDGE_FORMAT, ROUTE_FORMAT, SECOND_LOOK_FORMAT, judgeFrom, SEES_FORMAT, SEES_READS_FORMAT, SEES_SHOP_FORMAT, factsOf, pageParts, routeFor, seriousFaults, gradeSees, secondLookFrom, seesAskValidator, seesFrom, writerFrom, writersForHead,
  type SeesLink, type SeesVerdict,
} from "./utils/seesAsk";

/**
 * The eye asks the Insights team (sees-conversion-specialist-plan-2026-10-30.md
 * S8, S12; Anthony: "keep the paths clean … if everything goes through the
 * Head the quality is easier to maintain"): one path, the weekly run's. The
 * Head of Strategy is handed the page and picks the specialist; the
 * specialist reads the website's screens for itself (A1: the page's own read
 * for it first, then whatever explains what it sees, saved data only) and
 * writes the bubble from those figures, with what it was told before (its
 * memories, A4); the
 * Editor's code checks every number and every word (`seesFrom`); the Head
 * takes a second look at whether it is the most useful thing to say (A5);
 * the answer is saved and the bubble shows it. Every call is a step on the
 * Head's run with its cost, held by its spend limit (`ask`). Nothing here
 * asks Google. The eval set runs the same path (A6, `runSeesEval`).
 */

type Page = { host: string; screen: string; about: string; period: string; from?: string; to?: string; country: string; device?: string; facts: Parameters<typeof factsOf>[0]["facts"]; links: readonly SeesLink[]; shop: boolean };
type Written = { verdict: SeesVerdict; role: InsightsRole; lines: Array<{ heading: string; detail: string; failed?: boolean }> };
/** An eval page as `seesAsk.evalPagesInternal` gives it: named here so the action's type never depends on its own module. */
type EvalPage = {
  _id: Id<"seesEvalPages">; companyId: Id<"companies">; companyWebsiteId: Id<"companyWebsites">; host: string; screen: string; about: string; facts: Page["facts"]; links: SeesLink[]; expected: string[];
  period?: string; from?: string; to?: string; country?: string; device?: string; shop?: boolean;
};

/**
 * Each part's limit, together well inside the ten minutes Convex gives an action: on Google's flagship model
 * (2026-10-30) the reading and writing takes the longest. A second look that runs out leaves the specialist's words.
 */
const CHOOSE_LIMIT_MS = 60 * 1000;
const WRITE_LIMIT_MS = 4.5 * 60 * 1000;
const LOOK_LIMIT_MS = 2.5 * 60 * 1000;

/** The team writes one page's bubble: the Head picks, the specialist writes, the Editor checks, the Head looks again. */
async function writeBubble(ctx: ActionCtx, run: InsightsRunArgs, page: Page): Promise<Written> {
  const lines: Written["lines"] = [];
  const setup = await ctx.runQuery(internal.insightsTeam.teamSetup, {});
  const member = (role: string): TeamMember | undefined => setup.members.find((entry) => entry.role === role && entry.isActive);
  const lead = member(INSIGHTS_LEAD_ROLE);
  const facts = factsOf(page);
  const held = factsByKey(facts);
  const rules = rulesFor(run);
  // Tracking health's faults that break the conversion figures, in words: the only time the bubble may speak about tracking.
  const trackingFaults = seriousFaults(page.screen.startsWith("googleAnalytics.") ? await ctx.runQuery(internal.seesAsk.trackingFaultsInternal, { holdId: run.holdId }).catch(() => []) : []);
  // 1. The Head of Strategy picks who answers (S8): every writer on the team, by what the page is about.
  let role: InsightsRole | null = null;
  try {
    const system = [rules, briefFor(INSIGHTS_LEAD_ROLE, lead?.instructions), ROUTE_FORMAT].filter(Boolean).join("\n\n");
    const prompt = JSON.stringify({ website: page.host, page: page.about, screen: page.screen, shop: page.shop, trackingFaults, figures: factLines(facts).slice(0, 40), specialists: writersForHead() });
    const answer = await ask(ctx, run, lead, "the Head of Strategy choosing who answers", system, prompt, CHOOSE_LIMIT_MS, (value) => writerFrom(value) !== null);
    role = writerFrom(answer);
  } catch (error) {
    lines.push({ heading: "The Head of Strategy", detail: `Could not choose: ${failureSummary(error)}. The Conversion specialist answers.` });
  }
  const routed = routeFor(role, page.screen, trackingFaults);
  if (role && routed !== role) lines.push({ heading: "The Head of Strategy", detail: `Chose ${role.replace("INSIGHTS_", "").toLowerCase()}, but tracking health found nothing that breaks the conversion figures: a page about conversions goes to the Conversion specialist.` });
  const chosen: InsightsRole = routed;
  lines.push({ heading: "The Head of Strategy", detail: `Handed ${page.about} to ${chosen.replace("INSIGHTS_", "").toLowerCase().replace(/_/g, " ")}.` });
  // 2. The specialist reads the website's screens for itself (A1), then writes, with what it was told before (A4).
  const writer = member(chosen) ?? lead;
  const memories: Array<{ content: string }> = writer ? await ctx.runQuery(internal.agentMemories.getAlwaysMemoriesInternal, { agentId: writer.agentId, companyId: run.companyId }).catch(() => []) : [];
  const toldBefore = memories.length > 0 ? `What you were told before, which binds you:\n${memories.map((memory) => `- ${memory.content}`).join("\n")}` : "";
  const links = page.links.map((link, number) => ({ number, label: link.label }));
  const prompt = JSON.stringify({ website: page.host, page: page.about, pageParts: pageParts(page.screen), dates: page.from && page.to ? `${page.from} to ${page.to}` : page.period, trackingFaults, facts: factLines(facts), links });
  const scope = { companyId: run.companyId, host: page.host, holdId: run.holdId, period: page.period, device: page.device ?? "", country: page.country, ...(page.from ? { from: page.from } : {}), ...(page.to ? { to: page.to } : {}) };
  const reads = page.screen.startsWith("googleAnalytics.") && readable(scope);
  const system = [rules, briefFor(chosen, member(chosen)?.instructions), toldBefore, SEES_FORMAT, page.shop ? SEES_SHOP_FORMAT : "", reads ? SEES_READS_FORMAT : ""].filter(Boolean).join("\n\n");
  const who = `the ${chosen.replace("INSIGHTS_", "").toLowerCase()} writing the bubble`;
  // Every figure the bubble may name: the page's, and whatever the specialist read.
  let named: ReadonlyMap<string, Fact> = held;
  // Once the specialist can read, a bubble must say something the page's boxes don't (the Editor's check, both writers).
  const beyondPage = reads ? { pageKeys: new Set(held.keys()) } : {};
  // With nothing wrong in tracking health, words about tracking or about what counts go back (both writers).
  const noTracking = { noTrackingTalk: trackingFaults.length === 0, analytics: page.screen.startsWith("googleAnalytics.") };
  const withRead = (found: ReadonlyMap<string, Fact>) => new Map([...found, ...held]);
  let verdict: SeesVerdict;
  let raw: unknown;
  if (reads) {
    const written = await askWithTools(ctx, run, writer, who, system, prompt, [analyticsTool(scope)], {
      firstReads: firstReadsFor(page),
      limitMs: WRITE_LIMIT_MS,
      check: (answer, found) => {
        const checked = seesFrom(answer, withRead(found), page.links, { ...noTracking, ...(found.size > 0 ? beyondPage : {}) });
        return checked.ok ? null : checked.why;
      },
    });
    named = withRead(factsByKey(written.found));
    raw = written.answer;
    for (const read of written.reads) lines.push({ heading: "Read", detail: readLine(read), failed: Boolean(read.problem) });
    // 3. The Editor's check ran inside the conversation (S5, S7): what failed went back once, with why.
    verdict = seesFrom(raw, named, page.links, { ...noTracking, ...(written.found.length > 0 ? beyondPage : {}) });
  } else {
    raw = await ask(ctx, run, writer, who, system, prompt, undefined, (value) => value !== null && typeof value === "object" && "says" in value);
    // 3. The Editor checks every number and every word (S5, S7): what fails goes back.
    verdict = seesFrom(raw, named, page.links, noTracking);
  }
  if (!verdict.ok) return { verdict, role: chosen, lines };
  // 4. The Head's second look (A5): the most useful thing, or a rewrite — kept only when the Editor passes it too. It
  // sees the page's figures and those the specialist read, the ones the bubble names first.
  try {
    const used = new Set(namedIn(raw));
    const readFacts = [...named.values()].filter((fact) => !held.has(fact.key));
    const forHead = [...facts, ...readFacts.filter((fact) => used.has(fact.key)), ...readFacts.filter((fact) => !used.has(fact.key))].slice(0, 240);
    const look = JSON.stringify({ website: page.host, page: page.about, pageParts: pageParts(page.screen), shop: page.shop, trackingFaults, bubble: { says: verdict.says, steps: verdict.steps.map((step) => step.words) }, facts: factLines(forHead), links });
    const second = await ask(ctx, run, lead, "the Head of Strategy's second look", [rules, briefFor(INSIGHTS_LEAD_ROLE, lead?.instructions), SECOND_LOOK_FORMAT].filter(Boolean).join("\n\n"), look, LOOK_LIMIT_MS);
    const read = secondLookFrom(second);
    if (read.useful) {
      lines.push({ heading: "Second look", detail: "The Head of Strategy kept the specialist's words: the most useful thing the page says." });
    } else {
      const rewritten = seesFrom(read.rewrite, named, page.links, { ...noTracking, ...(named.size > held.size ? beyondPage : {}) });
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

/**
 * The page's own screen, read for the specialist before it starts (A1): Conversions' screen for the Conversions page,
 * and a shop's steps beside it; a conversion's own screen reads its event and the Conversions screen.
 */
export function firstReadsFor(page: Pick<Page, "screen" | "shop">): FirstRead[] {
  const tool = ANALYTICS_READ;
  if (page.screen === "googleAnalytics.conversions") {
    return [
      { tool, args: { screen: "conversions" } },
      // The page's map, as it opens (by page kind) and by channel; devices and countries the agent reads if it wants them.
      { tool, args: { screen: "conversionsBy", columns: "kind" } },
      { tool, args: { screen: "conversionsBy", columns: "channel" } },
      ...(page.shop ? [{ tool, args: { screen: "products" } }] : []),
    ];
  }
  if (page.screen.startsWith("googleAnalytics.event:")) {
    const event = page.screen.slice("googleAnalytics.event:".length);
    return [{ tool, args: { screen: "event", key: event } }, { tool, args: { screen: "conversions" } }, ...(page.shop && event === "purchase" ? [{ tool, args: { screen: "products" } }] : [])];
  }
  return [];
}

/** A read, as the run's log says it: the screen, and how many figures came back or why none did. */
function readLine(read: AgentRead): string {
  const what = [read.args.screen, read.args.columns, read.args.key, read.args.list].filter((part) => typeof part === "string" && part).join(", ") || read.tool;
  return read.problem ? `${what}: ${read.problem}` : `${what}: ${read.figures} figure${read.figures === 1 ? "" : "s"}.`;
}

/** The keys a specialist's answer names, as it wrote them, before the Editor filled them in. */
function namedIn(raw: unknown): string[] {
  return [...JSON.stringify(raw ?? null).matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1].trim());
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
    /** One device, or empty for every device; absent on an answer asked before the agents read for themselves. */
    device: v.optional(v.string()),
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
      const shop = page.shop ?? false;
      const run: InsightsRunArgs = { runId: args.runId, companyId: page.companyId, host: page.host, holdId: page.companyWebsiteId, shop };
      let written: Written;
      try {
        // Where it was looked at, so the team reads the website's screens as the reader saw them (a page kept before
        // agents read has none, and is written from its figures alone).
        written = await writeBubble(ctx, run, { ...page, period: page.period ?? "eval", country: page.country ?? "", device: page.device ?? "", shop });
      } catch (error) {
        written = { verdict: { ok: false, why: failureSummary(error) }, role: "INSIGHTS_CONVERSION", lines: [] };
      }
      const says = written.verdict.ok ? written.verdict.says : [];
      // Judged point by point against Anthony's notes; the figures-named grade only when the judge can't answer.
      let grade = gradeSees(page.expected, says);
      if (written.verdict.ok) {
        try {
          const setup = await ctx.runQuery(internal.insightsTeam.teamSetup, {});
          const lead = setup.members.find((entry) => entry.role === INSIGHTS_LEAD_ROLE && entry.isActive);
          const bubble = { says, steps: written.verdict.steps.map((step) => step.words) };
          const judged = judgeFrom(await ask(ctx, run, lead, "the eval judge", JUDGE_FORMAT, JSON.stringify({ page: page.about, points: page.expected, bubble }), LOOK_LIMIT_MS), page.expected);
          if (judged) grade = judged;
        } catch (error) {
          grade = { ...grade, notes: [...grade.notes, `The judge could not answer (${failureSummary(error)}); graded on the figures named.`] };
        }
      }
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
      summary: pages.length === 0 ? "The eval set holds no pages yet." : `${pages.length} page${pages.length === 1 ? "" : "s"} graded: ${passed} passed the Editor; ${Math.round(score * 100)}% of what Anthony would want found was found.`,
    });
    return { graded: pages.length, passed, score };
  },
});
