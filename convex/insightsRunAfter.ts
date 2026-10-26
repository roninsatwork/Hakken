"use node";

import { memoryNow } from "./utils/stepMemory";
import { appError } from "./utils/appError";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { failureSummary } from "./roleRuns";
import { finishRun } from "./searchConsoleAgentRun";
import { ASK_LIMIT_MS, ask, factLines, filled, insightsStepArgs, lines, rulesFor, type InsightsRunArgs } from "./insightsAsk";
import { readWebsiteFacts } from "./insightsReading";
import { decideForRun } from "./insightDecisions";
import { writeBoxes } from "./insightBoxes";
import { whyFacts, type WhyView } from "./utils/insightWhyFacts";
import { PAGE_DECISIONS_ROLE } from "./utils/insightPageAgent";
import type { TeamMember } from "./insightsTeam";
import type { WrittenFinding } from "./insightsRunSteps";
import { INSIGHTS_LEAD_ROLE } from "./utils/agentRoles";
import { briefFor } from "./utils/insightBriefs";
import { FACT_UNITS, factsByKey, shiftDay, type Fact } from "./utils/insightFacts";
import { typedNumbers } from "./utils/insightEditor";
import { BOARD_FORMAT, MONTH_FORMAT, SHOP_RULE, SPECIALIST_ROLE } from "./utils/insightTeam";
import type { Score } from "./utils/insightSummary";
import { DRAFT_RULES, draftsFrom, type Drafted } from "./utils/insightDrafts";
import { PANEL_RULES, panelFrom } from "./utils/insightPanel";
import { REVIEW_RULES, VERDICTS, funnelFrom, sourcesFrom, verdictByRule, type Verdict } from "./utils/insightConversion";
import { missingStructuredData } from "./utils/moneyPageChecks";
import { ask as askAnalytics, openSession } from "./googleAnalyticsCollect";
import { journeysOf, type Journey } from "./googleAnalyticsLists";
import { INSIGHT_AFTER_PARTS } from "./utils/insightRunStages";
import { assistantOf } from "./utils/aiAssistants";

/**
 * A website's week, step 3 of 3 (insightsRun.ts; insights-one-voice-plan.md
 * phase 0): with the week saved, what follows it — the Report Writer's
 * reports, the Local and Links specialists' drafts, the buyer-question panel
 * and the Conversion specialist's page reviews — side by side, each logged
 * and none stopping the rest, then the run finished. Moved out of the one
 * long run on 12 October 2026, when the run outlived Convex's ten minutes.
 */

type SavedScorecard = Score[];

export const afterWeek = internalAction({
  args: {
    ...insightsStepArgs, watchId: v.id("_scheduled_functions"), week: v.string(), today: v.string(),
    afterPart: v.optional(v.number()), afterAttempt: v.optional(v.number()),
    counts: v.object({ facts: v.number(), candidates: v.number(), written: v.number(), published: v.number(), sentBack: v.number() }),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { watchId, week, today, counts, afterPart = 0, afterAttempt = 0, ...run } = args;
    const stage = INSIGHT_AFTER_PARTS[afterPart];
    if (!stage) throw appError("INVALID_INPUT", "Unknown Insights writing step.");
    let failed: string | null = null;
    try {
      const runArgs: InsightsRunArgs = { ...run, shop: await ctx.runQuery(internal.insightsReading.isShopInternal, { holdId: run.holdId }) };
      const setup = await ctx.runQuery(internal.insightsTeam.teamSetup, {});
      const member = (role: string) => setup.members.find((entry) => entry.role === role && entry.isActive);
      const lead = member(INSIGHTS_LEAD_ROLE);
      const facts = (await readWebsiteFacts(ctx, run.holdId)).facts;
      if (stage === "Reports") {
        const saved = await ctx.runQuery(internal.insightsRunSteps.savedWeek, { holdId: run.holdId, week, runId: run.runId });
        if (!saved?.summary) throw appError("UPSTREAM_FAILURE", "The run has no completed weekly analysis to write reports from.");
        await writeReports(ctx, runArgs, { week, today, verdict: saved.verdict, findings: saved.findings, summary: saved.summary, facts, writer: member("INSIGHTS_REPORT_WRITER") ?? lead });
      } else if (stage === "Drafts") await writeDrafts(ctx, runArgs, week, member(SPECIALIST_ROLE.local) ?? lead, member(SPECIALIST_ROLE.links) ?? lead);
      else if (stage === "Buyer questions") await buildPanel(ctx, runArgs, member(SPECIALIST_ROLE.aiVisibility) ?? lead);
      else if (stage === "Page reviews") await reviewPages(ctx, runArgs, week, facts, member(SPECIALIST_ROLE.conversion) ?? lead);
      else if (stage === "Page decisions") await decideForRun(ctx, runArgs, week, rulesFor(runArgs), member(PAGE_DECISIONS_ROLE) ?? lead);
      else if (stage === "Page decisions' box") await writeBoxes(ctx, runArgs, week, rulesFor(runArgs), facts, member, null, true);
      else {
        const view: WhyView | null = await ctx.runQuery(internal.insightsPeriod.runView, { holdId: run.holdId });
        await writeBoxes(ctx, runArgs, week, rulesFor(runArgs), [...facts, ...(view ? whyFacts(view) : [])], member, view?.chosen?.id ?? null);
      }
    } catch (error) { failed = failureSummary(error); }
    if (failed && afterAttempt === 0) {
      await ctx.runMutation(internal.insightsRunSteps.handOnInsights, { ...memoryNow(), ...run, step: "AFTER", cancelWatchId: watchId, week, today, counts, afterPart, afterAttempt: 1, delayMs: 5_000 });
      return null;
    }
    await ctx.runMutation(internal.insightsRunSteps.recordStage, { runId: run.runId, companyId: run.companyId, stage, failed: failed !== null, detail: failed ?? "Completed, including any valid empty result." });
    if (afterPart + 1 < INSIGHT_AFTER_PARTS.length) {
      await ctx.runMutation(internal.insightsRunSteps.handOnInsights, { ...memoryNow(), ...run, step: "AFTER", cancelWatchId: watchId, week, today, counts, afterPart: afterPart + 1, afterAttempt: 0 });
      return null;
    }
    const stages = await ctx.runQuery(internal.insightsRunSteps.stageResults, { runId: run.runId });
    const unfinished = stages.filter((entry) => entry.status !== "SUCCESS");
    const costUsd = await ctx.runQuery(internal.insightsTeam.runCost, { runId: run.runId });
    await ctx.runMutation(internal.insightsRunSteps.cancelInsightsWatch, { watchId });
    await finishRun(ctx, run.runId, run.workflowExecutionId, unfinished.length ? "FAILED" : "SUCCESS", `${run.host}: ${counts.facts} facts read; ${counts.published} findings published and ${counts.sentBack} sent back by the Editor. ${unfinished.length ? `The whole section has not refreshed. Unfinished: ${unfinished.map((entry) => entry.stage).join(", ")}. Completed results remain available.` : "Every required Insights stage completed."} Cost $${costUsd.toFixed(3)}.`);
    return null;
  },
});

/**
 * The week's drafted fixes (I23, phases 10 and 11): the Local and reputation
 * specialist drafts Business Profile changes, posts, a review request and
 * replies; the Links and PR specialist an email to each site linking to
 * rivals but not to the business. Each area is asked only when it has
 * something to fix; Hakken adds each draft's tagged link (I39).
 */
async function writeDrafts(ctx: ActionCtx, args: InsightsRunArgs, week: string, local: TeamMember | undefined, links: TeamMember | undefined): Promise<number> {
  const inputs = await ctx.runQuery(internal.insightsDrafts.draftInputs, { holdId: args.holdId });
  if (!inputs) return 0;
  const pages = inputs.pages.map((page) => page.page);
  const recent = inputs.recent.map((row) => `${row.kind}: ${row.target}`);
  const drafted: Drafted[] = [];
  const acceptsDrafts = (answer: unknown) => Array.isArray((answer as { drafts?: unknown })?.drafts);
  if (inputs.own.length > 0) {
    const system = [briefFor("INSIGHTS_LOCAL", local?.instructions), DRAFT_RULES].filter(Boolean).join("\n\n");
    const prompt = JSON.stringify({
      website: inputs.host,
      today: new Date().toISOString().slice(0, 10),
      want: [
        "CATEGORY: only where the profiles' categories miss what the business sells (its pages) or what the rivals on the map use; one draft for the change, naming the category exactly as Google lists it.",
        "NAME: only where the business's profiles use different names; the one name to use on all of them.",
        "DESCRIPTION: only where a profile has no description or a thin one; a new one from its pages, under 750 characters.",
        "POST: one or two posts when a profile has posted nothing in the last 30 days, each about one of the pages given, pointing to it.",
        "REVIEW_REQUEST: one short message the business can send its recent clients asking for a Google review, with [link to your Google review form] as a gap.",
        "REVIEW_REPLIES: replies to the reviews waiting, newest first, one each, named by the reviewer, in one draft; only if some are given.",
      ],
      notAgain: recent,
      profiles: inputs.own,
      rivalsMainCategories: inputs.rivalCategories,
      rivalsLastPost: inputs.rivalLastPost,
      reviewsWaiting: inputs.waitingCount,
      newestWaiting: inputs.waiting,
      pages: inputs.pages,
    });
    const answer = await ask(ctx, args, local, "the Local and reputation specialist's drafts", system, prompt, ASK_LIMIT_MS, acceptsDrafts);
    drafted.push(...draftsFrom(answer, "LOCAL", pages), ...draftsFrom(answer, "REVIEWS", pages));
  }
  if (inputs.outreach.length > 0) {
    const system = [briefFor("INSIGHTS_LINKS", links?.instructions), DRAFT_RULES].filter(Boolean).join("\n\n");
    const prompt = JSON.stringify({
      website: inputs.host,
      want: ["OUTREACH: for each site given, one short email from the business to the site's editor or owner, offering what fits the site (a case study, an article, a listing, a comment for a story) and pointing to the one page of the website it is about; the target is the site's address."],
      notAgain: recent,
      sites: inputs.outreach.map((site) => ({ site: site.host, linksToRivals: site.rivals, strength: site.strength })),
      pages: inputs.pages,
    });
    const answer = await ask(ctx, args, links, "the Links and PR specialist's drafts", system, prompt, ASK_LIMIT_MS, acceptsDrafts);
    drafted.push(...draftsFrom(answer, "LINKS", pages));
  }
  if (drafted.length === 0) return 0;
  return await ctx.runMutation(internal.insightsDrafts.saveDrafts, { holdId: args.holdId, companyId: args.companyId, runId: args.runId, chainBooking: args.chainBooking, week, origin: inputs.origin, drafts: drafted });
}

/** The buyer-question panel, built when due (I28); then put on or taken off the company's questions as its collection says. */
async function buildPanel(ctx: ActionCtx, args: InsightsRunArgs, member: TeamMember | undefined): Promise<void> {
  const inputs = await ctx.runQuery(internal.insightsPanel.panelInputs, { holdId: args.holdId });
  if (!inputs) return;
  if (inputs.due && inputs.searches.length > 0) {
    const system = [briefFor("INSIGHTS_AI_VISIBILITY", member?.instructions), PANEL_RULES].filter(Boolean).join("\n\n");
    const prompt = JSON.stringify({ business: inputs.name, website: inputs.host, searches: inputs.searches.map((row) => ({ search: row.search, monthly: row.volume, page: row.page })), services: inputs.services, guides: inputs.guides });
    const answer = await ask(ctx, args, member, "the buyer-question panel", system, prompt, ASK_LIMIT_MS, (answer) => Array.isArray((answer as { questions?: unknown })?.questions));
    const sources = new Map<string, number | null>([...inputs.searches.map((row) => [row.search.toLowerCase(), row.volume] as [string, number]), ...inputs.guides.map((guide) => [guide.toLowerCase(), null] as [string, null])]);
    const questions = panelFrom(answer, inputs.name, sources);
    if (questions.length > 0) await ctx.runMutation(internal.insightsPanel.savePanel, { holdId: args.holdId, companyId: args.companyId, runId: args.runId, chainBooking: args.chainBooking, questions });
  }
  const synced = await ctx.runMutation(internal.insightsPanel.syncPanel, { holdId: args.holdId, runId: args.runId, chainBooking: args.chainBooking });
  if (synced.overLimit > 0) {
    await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Buyer questions", detail: `${synced.overLimit} of the panel's questions are past the website's limit of questions and aren't asked.`, failed: false });
  }
}

/** Where each page's visitors were just before, kept at most a page. */
const BEFORE_KEPT = 5;

/**
 * Where visitors were just before each of the pages given (I36), from one
 * report of Analytics' page-before over the last 90 days: a page of the
 * website by its path, another website by its address, or none (typed in,
 * a bookmark), each with its share of the page's views.
 */
async function pagesBefore(ctx: ActionCtx, holdId: Id<"companyWebsites">, pages: readonly string[]): Promise<Map<string, Journey[]>> {
  const out = new Map<string, Journey[]>();
  if (pages.length === 0) return out;
  const target = await ctx.runQuery(internal.insightsReading.analyticsTargetInternal, { holdId });
  if (!target) return out;
  const opened = await openSession(ctx, target.connectionId);
  if (!opened.ok) return out;
  // Analytics names a page as it was viewed, slash or not: asked both ways, filed under the path given.
  const asked = new Map<string, string>();
  for (const page of pages) {
    asked.set(page, page);
    if (page.length > 1) asked.set(page.replace(/\/+$/, ""), page);
  }
  const answer = await askAnalytics(opened.session, target.property, {
    startDate: shiftDay(target.newestDay, -89), endDate: target.newestDay,
    dimensions: ["pagePath", "pageReferrer"], metrics: ["screenPageViews"],
    hostNames: target.addresses, countries: [target.country],
    only: { dimension: "pagePath", values: [...asked.keys()] },
  });
  return answer.ok ? journeysOf(answer.rows, asked, target.addresses, assistantOf, BEFORE_KEPT) : out;
}

/** Pages the Conversion specialist reviews at most each week: the money pages with the most visits. */
const PAGES_REVIEWED = 8;

/**
 * The funnel, the sources and the page reviews (phase 14): the Conversion
 * specialist gives each money page a verdict and two first steps from its
 * figures and what its words show; a page it doesn't answer for takes the
 * verdict the rules give.
 */
async function reviewPages(ctx: ActionCtx, args: InsightsRunArgs, week: string, facts: readonly Fact[], member: TeamMember | undefined): Promise<void> {
  const inputs = (await ctx.runQuery(internal.insightsConversion.reviewInputs, { holdId: args.holdId })).slice(0, PAGES_REVIEWED);
  let answered = new Map<string, { verdict: Verdict; reason: string; steps: string[] }>();
  // Where each page's visitors were just before (I36): one ask of Analytics, the last 90 days.
  const beforeOf = await pagesBefore(ctx, args.holdId, inputs.map((page) => page.page)).catch(() => new Map<string, Journey[]>());
  if (inputs.length > 0) {
    const system = [briefFor("INSIGHTS_CONVERSION", member?.instructions), REVIEW_RULES, args.shop ? SHOP_RULE : ""].filter(Boolean).join("\n\n");
    const answers = await Promise.all(Array.from({ length: Math.ceil(inputs.length / 2) }, async (_, at) => {
    const batch = inputs.slice(at * 2, at * 2 + 2);
    const prompt = JSON.stringify({
      website: args.host,
      pages: batch.map((page) => ({
        page: page.page, kind: page.kind, title: page.title,
        visits: page.visits, enquiries: page.enquiries, visitsYearBefore: page.visitsBefore, enquiriesYearBefore: page.enquiriesBefore,
        headline: page.facts?.headline ?? null, words: page.facts?.words ?? null, showsPrice: page.facts?.price ?? null, showsProof: page.facts?.proof ?? null,
        hasForm: page.facts?.form ?? null, firstAskAt: page.facts?.firstAsk ?? null, opening: page.facts?.opening ?? null, structuredData: page.structured,
        // How visitors behave on it, from Microsoft Clarity's last 30 days where connected (I24): shares are per cent of visits.
        // Where its visitors were just before, shares per cent of its views: a page of the website by path, another website, or none.
        cameFrom: beforeOf.get(page.page) ?? [],
        behaviour: page.behaviour ? { visits: page.behaviour.sessions, scrollDepth: page.behaviour.scroll, deadClicks: page.behaviour.dead, rageClicks: page.behaviour.rage, quickBacks: page.behaviour.quickBack, activeSeconds: page.behaviour.activeSeconds } : null,
      })),
    });
    const accepts = (value: unknown) => {
      const rows = value && typeof value === "object" && "pages" in value && Array.isArray(value.pages) ? value.pages : [];
      return batch.every((page) => rows.some((row: Record<string, unknown>) => {
        if (row?.page !== page.page || !VERDICTS.includes(row.verdict as Verdict)) return false;
        return row.verdict !== "ADD_COMPANY_FACTS" || missingStructuredData(page.kind === "HOME" || page.page === "/" ? "HOME" : page.kind, page.structured ?? []).includes("ORGANISATION");
      }));
    };
    const answer = await ask(ctx, args, member, "the Conversion specialist's page reviews", system, prompt, ASK_LIMIT_MS, accepts) as { pages: unknown[] };
    return answer.pages;
    }));
    const list = answers.flat();
    const markupOf = new Map(inputs.map((page) => [page.page, page]));
    answered = new Map(list.flatMap((raw) => {
      const entry = raw as Record<string, unknown>;
      const verdict = VERDICTS.find((known) => known === entry.verdict);
      if (typeof entry.page !== "string" || !verdict) return [];
      // Company facts a page already carries are never asked for: the markup decides, not the model.
      const held = markupOf.get(entry.page);
      if (verdict === "ADD_COMPANY_FACTS" && held && !missingStructuredData(held.kind === "HOME" || entry.page === "/" ? "HOME" : held.kind, held.structured ?? []).includes("ORGANISATION")) return [];
      const steps = Array.isArray(entry.steps) ? entry.steps.filter((step): step is string => typeof step === "string").map((step) => step.trim().slice(0, 300)).slice(0, 2) : [];
      return [[entry.page, { verdict, reason: typeof entry.reason === "string" ? entry.reason.trim().slice(0, 300) : "", steps }]];
    }));
  }
  const missing = inputs.filter((page) => !answered.has(page.page));
  if (missing.length > 0) throw appError("UPSTREAM_FAILURE", `The Conversion specialist did not complete valid reviews for: ${missing.map((page) => page.page).join(", ")}. Previous completed reviews remain available.`);
  const pages = inputs.map((page) => {
    const said = answered.get(page.page);
    return {
      page: page.page, title: page.title, kind: page.kind, visits: page.visits, enquiries: page.enquiries, visitsBefore: page.visitsBefore, enquiriesBefore: page.enquiriesBefore, visits90: page.visits90, enquiries90: page.enquiries90,
      verdict: said?.verdict ?? verdictByRule(page, page.facts, page.structured), reason: said?.reason ?? "", steps: said?.steps ?? [],
      before: beforeOf.get(page.page) ?? [],
    };
  });
  await ctx.runMutation(internal.insightsConversion.saveConversion, { holdId: args.holdId, companyId: args.companyId, week, runId: args.runId, chainBooking: args.chainBooking, conversion: { funnel: funnelFrom(facts), sources: sourcesFrom(facts), pages } });
}

/** What Hakken did this run, for the reports' "work Hakken did". */
function workDone(facts: readonly Fact[], findings: number): Array<{ work: string; count: number }> {
  const rivals = new Set(facts.map((fact) => /^seo\.(.+)\.traffic\.now$/.exec(fact.key)?.[1]).filter(Boolean)).size - 1;
  const asked = facts.filter((fact) => /^ai\.answers\.[^.]+\.asked$/.test(fact.key)).reduce((sum, fact) => sum + fact.value, 0);
  const pages = facts.find((fact) => fact.key === "crawl.pages")?.value ?? 0;
  return [
    { work: "findings", count: findings },
    { work: "facts", count: facts.length },
    { work: "rivals", count: Math.max(0, rivals) },
    { work: "pages", count: pages },
    { work: "aiAnswers", count: asked },
  ].filter((entry) => entry.count > 0);
}

/** The Report Writer's own brief: none when the writing falls to the Head of Strategy, whose brief is its own. */
const writerBrief = (writer: TeamMember | undefined) => (writer?.role === "INSIGHTS_REPORT_WRITER" ? writer.instructions : undefined);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const dayName = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;

/**
 * The Report Writer's work (§4.1, §4.2, I6): the week's brief from the
 * week's verdict and findings, every run; the monthly report from the 4th,
 * for the month before; the board report once a quarter, over the last 90
 * days against the same weeks last year. The words name figures by their
 * keys and are filled from the facts, as findings are; a line that names a
 * figure not held, or types one, is left out. Frozen once saved.
 */
async function writeReports(
  ctx: ActionCtx,
  args: InsightsRunArgs,
  input: {
    week: string;
    today: string;
    verdict: string;
    findings: WrittenFinding[];
    summary: { scorecard: SavedScorecard; enquiriesByMonth: Array<{ month: string; visits: number; conversions: number }>; shareByMonth: Array<{ month: string; you: number; total: number }> };
    facts: Fact[];
    writer: TeamMember | undefined;
  },
): Promise<string[]> {
  const written: string[] = [];
  const findings = input.findings.map((finding) => ({ findingId: finding.findingId, headline: finding.headline, action: finding.action }));
  const did = workDone(input.facts, input.findings.length);
  const base = { scorecard: input.summary.scorecard, findings, did, enquiriesByMonth: input.summary.enquiriesByMonth, shareByMonth: input.summary.shareByMonth };
  const weekEnd = shiftDay(input.week, 6);
  await ctx.runMutation(internal.insightsTeam.saveReport, {
    holdId: args.holdId, companyId: args.companyId, kind: "WEEKLY", from: input.week, to: weekEnd, period: input.week, title: "Weekly brief", runId: args.runId, chainBooking: args.chainBooking,
    body: {
      ...base,
      headline: input.verdict,
      summary: input.findings[0]?.story ?? input.verdict,
      points: input.findings.slice(0, 5).map((finding) => finding.headline),
      next: input.findings.slice(0, 3).map((finding) => finding.action),
      risks: [], opportunities: [], decision: null, facts: [],
    },
  });
  written.push("the weekly brief");
  const due = await ctx.runQuery(internal.insightsTeam.reportTargetsForRun, { holdId: args.holdId, today: input.today, refreshLatest: args.refreshReports });
  const used = (facts: ReadonlyMap<string, Fact>) => [...facts.values()].map((fact) => ({ key: fact.key, label: fact.label, value: fact.value, unit: fact.unit }));
  if (due.month) {
    const monthFacts = await ctx.runQuery(internal.insightsReading.monthFactsInternal, { holdId: args.holdId, month: due.month.period });
    const facts = factsByKey(monthFacts);
    const system = [rulesFor(args), briefFor("INSIGHTS_REPORT_WRITER", writerBrief(input.writer)), MONTH_FORMAT].filter(Boolean).join("\n\n");
    const prompt = JSON.stringify({ website: args.host, month: monthName(due.month.period), facts: factLines([...facts.values()]), findings: (due.month.previous?.findings ?? input.findings).slice(0, 5).map((finding) => ({ headline: finding.headline, action: finding.action })) });
    const answer = await ask(ctx, args, input.writer, "the Report Writer's monthly report", system, prompt) as Record<string, unknown> | null;
    if (!answer) throw appError("UPSTREAM_FAILURE", "The monthly report writer did not return a valid answer; the previous report is kept.");
    const headline = filled(answer.headline, facts);
    const monthlySummary = filled(answer.summary, facts);
    if (!headline || !monthlySummary) throw appError("UPSTREAM_FAILURE", "The monthly report failed its evidence check; the previous completed report is kept.");
    await ctx.runMutation(internal.insightsTeam.saveReport, {
      holdId: args.holdId, companyId: args.companyId, kind: "MONTHLY", from: due.month.from, to: due.month.to,
      period: due.month.period, title: `Monthly report: ${monthName(due.month.period)}`, runId: args.runId, chainBooking: args.chainBooking,
      body: {
        ...(due.month.previous ?? base),
        enquiriesByMonth: input.summary.enquiriesByMonth.filter((month) => month.month <= due.month!.period),
        headline,
        summary: monthlySummary,
        points: lines(answer?.points, facts, 4),
        next: lines(answer?.next, facts, 3),
        risks: [], opportunities: [], decision: null,
        facts: used(facts),
      },
    });
    written.push(`the ${monthName(due.month.period)} report`);
  }
  if (due.board) {
    const currentFacts = input.facts.filter((fact) => /\.(90|365)\.(now|year|before)$/.test(fact.key) && /^(ga\.(conversions|people|visits|peoplePerConversion|channel\.(Organic Search|AI assistants|Direct)\.(visits|conversions))|sc\.clicks)/.test(fact.key) || fact.source === "market" || /^ai\.[^.]+\.mentions/.test(fact.key) || /^local\./.test(fact.key));
    // A saved board report is historical: its evidence, scorecard and findings must describe its own dates.
    const historicalFacts: Fact[] | null = due.board.previous?.facts.map((fact) => {
      const unit = FACT_UNITS.find((known) => known === fact.unit);
      if (!unit) throw appError("UPSTREAM_FAILURE", `Unknown unit in the saved report: ${fact.unit}`);
      return { ...fact, unit, source: "market" };
    }) ?? null;
    const facts = factsByKey(historicalFacts ?? currentFacts);
    const system = [rulesFor(args), briefFor("INSIGHTS_REPORT_WRITER", writerBrief(input.writer)), BOARD_FORMAT].filter(Boolean).join("\n\n");
    const prompt = JSON.stringify({ website: args.host, quarter: due.board.period, from: due.board.from, to: due.board.to, facts: factLines([...facts.values()]), findings: (due.board.previous?.findings ?? input.findings).slice(0, 6).map((finding) => ({ headline: finding.headline, ...("story" in finding ? { story: finding.story } : {}), action: finding.action })) });
    const answer = await ask(ctx, args, input.writer, "the Report Writer's board report", system, prompt) as Record<string, unknown> | null;
    if (!answer) throw appError("UPSTREAM_FAILURE", "The board report writer did not return a valid answer; the previous report is kept.");
    const { from, to } = due.board;
    const headline = typeof answer?.headline === "string" && typedNumbers(answer.headline).length === 0 && !/\[\[/.test(answer.headline) ? answer.headline.trim().slice(0, 80) : "The quarter, against last year and our rivals";
    await ctx.runMutation(internal.insightsTeam.saveReport, {
      holdId: args.holdId, companyId: args.companyId, kind: "BOARD", from, to, period: due.board.period, title: `Board report: ${dayName(from)} to ${dayName(to)}`, runId: args.runId, chainBooking: args.chainBooking,
      body: {
        ...(due.board.previous ?? base),
        headline,
        summary: filled(answer?.summary, facts) ?? due.board.previous?.summary ?? input.verdict,
        points: lines(answer?.points, facts, 3),
        risks: lines(answer?.risks, facts, 3),
        opportunities: lines(answer?.opportunities, facts, 3),
        next: lines(answer?.next, facts, 3),
        decision: filled(answer?.decision, facts),
        facts: used(facts),
      },
    });
    written.push(`the ${due.board.period} board report`);
  }
  return written;
}
