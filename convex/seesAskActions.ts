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
import { findingWords, type Finding } from "./utils/sees/findings";
import { judgeFindings, judgeWords, judgePoints, prepareSeesJudge } from "./seesJudge";
import {
  JUDGE_FORMAT, MOST_COVERED, SEES_FINDINGS_FORMAT, judgeFrom, SEES_FORMAT, SEES_PAGE_FORMAT, SEES_READS_FORMAT, SEES_SHOP_FORMAT, factsOf, pageParts, seriousFaults, gradeSees, seesAskValidator, seesFrom, writerFor,
  type SeesLink, type SeesVerdict,
} from "./utils/seesAsk";
import { pageFacts } from "./utils/sees/pageData";
import { pageFindings } from "./utils/sees/pageFindings";
import { seesScreenFor } from "./utils/sees/screens";

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

type Page = { host: string; screen: string; about: string; period: string; from?: string; to?: string; country: string; device?: string; facts: Parameters<typeof factsOf>[0]["facts"]; links: readonly SeesLink[]; shop: boolean; data?: unknown };
type Written = { verdict: SeesVerdict; role: InsightsRole; lines: Array<{ heading: string; detail: string; failed?: boolean }>; findings?: Finding[] };
/** An eval page as `seesAsk.evalPagesInternal` gives it: named here so the action's type never depends on its own module. */
type EvalPage = {
  _id: Id<"seesEvalPages">; companyId: Id<"companies">; companyWebsiteId: Id<"companyWebsites">; host: string; screen: string; about: string; facts: Page["facts"]; links: SeesLink[]; expected: string[];
  period?: string; from?: string; to?: string; country?: string; device?: string; shop?: boolean; pageData?: unknown;
};

/**
 * Each part's limit, together well inside the ten minutes Convex gives an action: on Google's flagship model
 * (2026-10-30) the reading and writing takes the longest.
 */
const WRITE_LIMIT_MS = 4.5 * 60 * 1000;
const LOOK_LIMIT_MS = 2.5 * 60 * 1000;

/**
 * The team writes one page's words: the screen list names the specialist (sees-every-page-plan-2026-10-31.md), code
 * finds what the figures show, the specialist writes them up, the Editor checks.
 */
async function writeBubble(ctx: ActionCtx, run: InsightsRunArgs, page: Page): Promise<Written> {
  const lines: Written["lines"] = [];
  const setup = await ctx.runQuery(internal.insightsTeam.teamSetup, {});
  const member = (role: string): TeamMember | undefined => setup.members.find((entry) => entry.role === role && entry.isActive);
  const lead = member(INSIGHTS_LEAD_ROLE);
  const screen = seesScreenFor(page.screen);
  const analytics = screen?.section === "googleAnalytics";
  // The page's own figures, as it showed them, keyed as the writer names them (every page but the Conversions screens').
  const pageRead = page.data !== undefined && page.data !== null ? pageFacts(page.screen, page.data, { ...(page.from ? { from: page.from } : {}), ...(page.to ? { to: page.to } : {}), ...(page.country ? { country: page.country } : {}) }) : null;
  const facts = [...factsOf(page), ...(pageRead?.facts ?? []).filter((fact) => !page.facts.some((own) => own.key === fact.key))];
  const held = factsByKey(factsOf(page));
  const rules = rulesFor(run);
  // Tracking health's faults that break the conversion figures, in words: the only time the bubble may speak about tracking.
  const trackingFaults = seriousFaults(analytics ? await ctx.runQuery(internal.seesAsk.trackingFaultsInternal, { holdId: run.holdId }).catch(() => []) : []);
  // 1. The screen list names who writes (the Head of Strategy no longer chooses: a model call a press saved).
  const chosen: InsightsRole = writerFor(page.screen, trackingFaults);
  lines.push({ heading: "The screen list", detail: `Handed ${page.about} to ${chosen.replace("INSIGHTS_", "").toLowerCase().replace(/_/g, " ")}.` });
  // 2. The specialist reads the website's screens for itself (A1), then writes, with what it was told before (A4).
  const writer = member(chosen) ?? lead;
  const memories: Array<{ content: string }> = writer ? await ctx.runQuery(internal.agentMemories.getAlwaysMemoriesInternal, { agentId: writer.agentId, companyId: run.companyId }).catch(() => []) : [];
  const toldBefore = memories.length > 0 ? `What you were told before, which binds you:\n${memories.map((memory) => `- ${memory.content}`).join("\n")}` : "";
  const links = page.links.map((link, number) => ({ number, label: link.label }));
  const scope = { companyId: run.companyId, host: page.host, holdId: run.holdId, period: page.period, device: page.device ?? "", country: page.country, ...(page.from ? { from: page.from } : {}), ...(page.to ? { to: page.to } : {}) };
  const reads = analytics && readable(scope);
  // Code finds first (sees-findings-in-code-plan-2026-10-31.md): the findings over the map's views, then Jev leaves
  // out the obvious and says whether a device gap is tracking. The writer must cover the first ones.
  const judgeRun = { companyId: run.companyId, runId: run.runId };
  const prepared = await prepareSeesJudge(ctx, judgeRun);
  let findings: Finding[] = [];
  // Every other page's findings come from its own figures, by the general rules (sees-every-page-plan, phase 3).
  const conversionsPage = page.screen === "googleAnalytics.conversions" || page.screen.startsWith("googleAnalytics.event:");
  if (!conversionsPage && page.data !== undefined && page.data !== null) {
    try {
      const judged = await judgeFindings(ctx, judgeRun, prepared, { host: page.host, shop: page.shop, about: page.about }, pageFindings(page.screen, page.data));
      findings = judged.findings;
      for (const note of judged.notes) lines.push({ heading: "Jev", detail: note.slice(0, 900) });
      lines.push({ heading: "Findings", detail: `${findings.length} found by code in the page's figures: ${findings.map(findingWords).join(" ")}`.slice(0, 900) });
    } catch (error) {
      lines.push({ heading: "Findings", detail: `Not worked out: ${failureSummary(error)}. The specialist writes from the page alone.`, failed: true });
    }
  }
  if (reads && conversionsPage) {
    try {
      const found = await ctx.runQuery(internal.seesFindings.seesFindingsInternal, { companyId: run.companyId, siteId: run.holdId, period: page.period, device: page.device ?? "", ...(page.country ? { country: page.country } : {}) });
      const judged = await judgeFindings(ctx, judgeRun, prepared, { host: page.host, shop: page.shop, about: page.about }, found);
      findings = judged.findings;
      for (const note of judged.notes) lines.push({ heading: "Jev", detail: note.slice(0, 900) });
      lines.push({ heading: "Findings", detail: `${findings.length} found by code: ${findings.map(findingWords).join(" ")}`.slice(0, 900) });
    } catch (error) {
      lines.push({ heading: "Findings", detail: `Not worked out: ${failureSummary(error)}. The specialist writes from its reading alone.`, failed: true });
    }
  }
  const findingFacts: Fact[] = findings.flatMap((finding) => finding.facts.map((fact) => ({
    key: fact.key, value: fact.value, unit: fact.unit, source: facts[0]?.source ?? ("analytics" as const), label: fact.label,
    ...(page.from ? { from: page.from } : {}), ...(page.to ? { to: page.to } : {}), ...(page.country ? { country: page.country } : {}),
  })));
  // The first ones, and the visits it took for one wherever it ranks: the page's own headline is always said.
  const mustCover = findings.filter((finding, at) => at < MOST_COVERED || finding.kind === "visitsForOne").map((finding) => ({ keys: finding.facts.map((fact) => fact.key), words: findingWords(finding) }));
  const findingsForWriter = findings.map((finding, at) => ({
    number: at + 1,
    finding: findingWords(finding),
    ...(finding.params.tracking ? { tracking: finding.params.tracking } : {}),
    figures: factLines(findingFacts.filter((fact) => fact.key.startsWith(`f${at + 1}.`))),
  }));
  const prompt = JSON.stringify({
    website: page.host, page: page.about, pageParts: pageParts(page.screen), dates: page.from && page.to ? `${page.from} to ${page.to}` : page.period, trackingFaults,
    ...(findings.length > 0 ? { findings: findingsForWriter } : {}),
    ...(pageRead ? { pageFigures: pageRead.shown } : { facts: factLines(facts) }),
    links,
  });
  // With code's findings in hand the writer writes them up from them and the page's own figures, and reads no screen:
  // reading a thousand figures it no longer had to find anything in was most of a press's cost (Anthony, 2026-10-31:
  // "how can it be more expensive as we are doing more in code now"). Without findings it still reads for itself.
  const readsScreens = reads && findings.length === 0;
  const never = screen?.never?.length ? `On this page never talk about ${screen.never.join("; ")}.` : "";
  const system = [rules, briefFor(chosen, member(chosen)?.instructions), toldBefore, SEES_FORMAT, pageRead ? SEES_PAGE_FORMAT : "", page.shop && analytics ? SEES_SHOP_FORMAT : "", never, readsScreens ? SEES_READS_FORMAT : "", findings.length > 0 ? SEES_FINDINGS_FORMAT : ""].filter(Boolean).join("\n\n");
  // Jev's check on the words, once the Editor's code has passed them: a guess stated as fact, a step that fits any website.
  const figuresForJev = [...facts, ...findingFacts].slice(0, 60).map((fact) => ({ what: fact.label, value: fact.value }));
  const wordsWhy = (checked: Extract<SeesVerdict, { ok: true }>) => judgeWords(ctx, judgeRun, prepared, page.host, checked.says, checked.steps.map((step) => step.words), figuresForJev);
  const who = `the ${chosen.replace("INSIGHTS_", "").toLowerCase()} writing the bubble`;
  // Every figure the bubble may name: the page's, the findings', and whatever the specialist read.
  const given = factsByKey([...facts, ...findingFacts]);
  let named: ReadonlyMap<string, Fact> = given;
  // Once the specialist can read, a bubble must say something the page's boxes don't (the Editor's check, both writers).
  const beyondPage = reads ? { pageKeys: new Set(held.keys()) } : {};
  // With nothing wrong in tracking health, words about tracking or about what counts go back (both writers).
  const noTracking = { noTrackingTalk: trackingFaults.length === 0, analytics };
  const withRead = (found: ReadonlyMap<string, Fact>) => new Map([...found, ...given]);
  const covering = mustCover.length > 0 ? { mustCover } : {};
  let verdict: SeesVerdict;
  let raw: unknown;
  if (reads) {
    const written = await askWithTools(ctx, run, writer, who, system, prompt, readsScreens ? [analyticsTool(scope)] : [], {
      firstReads: readsScreens ? firstReadsFor(page) : [],
      limitMs: WRITE_LIMIT_MS,
      check: async (answer, found) => {
        const checked = seesFrom(answer, withRead(found), page.links, { ...noTracking, ...covering, ...(found.size > 0 || findings.length > 0 ? beyondPage : {}) });
        return checked.ok ? await wordsWhy(checked) : checked.why;
      },
    });
    named = withRead(factsByKey(written.found));
    raw = written.answer;
    for (const read of written.reads) lines.push({ heading: "Read", detail: readLine(read), failed: Boolean(read.problem) });
    // 3. The Editor's check ran inside the conversation (S5, S7): what failed went back once, with why. Words that
    // still leave a finding out stand without it rather than leave the reader nothing; the run's log says so.
    const strict = seesFrom(raw, named, page.links, { ...noTracking, ...covering, ...(written.found.length > 0 || findings.length > 0 ? beyondPage : {}) });
    verdict = !strict.ok && strict.why.startsWith("It left out a finding")
      ? seesFrom(raw, named, page.links, { ...noTracking, ...(written.found.length > 0 || findings.length > 0 ? beyondPage : {}) })
      : strict;
    if (!strict.ok && verdict.ok) lines.push({ heading: "The Editor", detail: `Kept although ${strict.why.charAt(0).toLowerCase()}${strict.why.slice(1)}` });
    if (written.sentBack && verdict.ok) lines.push({ heading: "Jev", detail: `Kept after one rewrite, though: ${written.sentBack}`.slice(0, 900) });
  } else {
    raw = await ask(ctx, run, writer, who, system, prompt, undefined, (value) => value !== null && typeof value === "object" && "says" in value);
    // 3. The Editor checks every number and every word (S5, S7): what fails goes back.
    verdict = seesFrom(raw, named, page.links, noTracking);
  }
  if (!verdict.ok) return { verdict, role: chosen, lines, findings };
  return { verdict, role: chosen, lines, findings };
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
    /** The page's own figures as it showed them (sees-every-page-plan-2026-10-31.md). */
    data: v.optional(v.any()),
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
      await ctx.runMutation(internal.seesAsk.saveSeesAnswer, { answerId: args.answerId, status: "WRITTEN", says: written.verdict.says, steps: written.verdict.steps, role: written.role, ...(written.findings && written.findings.length > 0 ? { findings: written.findings } : {}) });
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
        written = await writeBubble(ctx, run, { ...page, period: page.period ?? "eval", country: page.country ?? "", device: page.device ?? "", shop, ...(page.pageData !== undefined ? { data: page.pageData } : {}) });
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
          // Jev first (sees.point-covered); the Head when the Decision is off or unsure throughout.
          const byJev = await judgePoints(ctx, { companyId: page.companyId, runId: args.runId }, await prepareSeesJudge(ctx, { companyId: page.companyId, runId: args.runId }), page.expected, bubble);
          const judged = byJev ?? judgeFrom(await ask(ctx, run, lead, "the eval judge", JUDGE_FORMAT, JSON.stringify({ page: page.about, points: page.expected, bubble }), LOOK_LIMIT_MS), page.expected);
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
