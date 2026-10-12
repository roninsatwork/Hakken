"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { failureSummary } from "./roleRuns";
import { finishRun } from "./searchConsoleAgentRun";
import { ask, factLines, insightsStepArgs, lines, rulesFor, whyNotFilled, words, type InsightsRunArgs } from "./insightsAsk";
import { readWebsiteFacts } from "./insightsReading";
import { weekOf, type SavedFinding, type TeamMember } from "./insightsTeam";
import { COMPETING_ROLE, competingForRun, keepCompeting } from "./insightCompeting";
import { INSIGHTS_LEAD_ROLE } from "./utils/agentRoles";
import { briefFor } from "./utils/insightBriefs";
import { COMPETING_RULE } from "./utils/insightCompeting";
import { applyServiceCalls, carryServices, serviceReading, servicesToCall, type Service } from "./utils/insightStrategy";
import { candidatesFor, type Candidate } from "./utils/insightChecks";
import { editFinding, type DraftFinding } from "./utils/insightEditor";
import { factsByKey, fillFacts, formatFact, shiftDay, type Fact } from "./utils/insightFacts";
import {
  FINDINGS_FORMAT,
  READS,
  SIDE_BY_SIDE,
  SPECIALIST_ROLE,
  STRATEGY_FORMAT,
  WHY_FORMAT,
  type InsightSpecialist,
} from "./utils/insightTeam";
import { whyFacts, type WhyView } from "./utils/insightWhyFacts";
import { typedNumbers } from "./utils/insightEditor";
import { scorecardFrom } from "./utils/insightSummary";
import { outcomeOf, type Change } from "./utils/insightTrack";
import { enquiryCheck, enquiryCheckBrief } from "./utils/insightEnquiryCheck";
import { measurementBrief, measurementFindings, measurementFrom } from "./utils/insightMeasurement";
import { planBrief } from "./utils/insightPlan";
import { ask as askAnalytics, askFunnel, openSession } from "./googleAnalyticsCollect";

/**
 * The Insights team's weekly run (docs/plans/active/insights-analyst-plan.md
 * §2, §6): the Head of Strategy's run starts one run for each owned website,
 * and each website's run reads every source as facts, has each specialist
 * look at its own discipline side by side — code first, then the AI only on
 * the candidates worth a look — has the Head of Strategy connect what they
 * found into stories and rank them, and has the Editor check every figure,
 * comparison and claim before the week is saved. Nothing waits for a person;
 * a step that fails is logged and the rest go on (Anthony, 2026-10-11).
 */

/** The gap between websites' runs starting. */
const STAGGER_MS = 20_000;
/** The facts a specialist is handed at most, beside its candidates'. */
const MOST_FACTS = 220;

type Draft = DraftFinding & {
  specialist: InsightSpecialist;
  pattern: string;
  /** Enquiries a year at stake, from the candidate's checklist. */
  atStake?: number;
  sure: "HIGH" | "MEDIUM" | "LOW";
  watch?: { key: string; direction: "UP" | "DOWN" };
  checkInDays?: number;
  stake: number;
  /** The specialists' findings a joined story replaces. */
  from?: number[];
};

/** The run the schedule or Run starts: one run of its own for each website the team reads. */
export const runInsightsTeamNow = internalAction({
  args: { runId: v.id("agentRuns"), workflowExecutionId: v.optional(v.id("workflowExecutions")), role: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      if (args.role && args.role !== INSIGHTS_LEAD_ROLE) {
        await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", "This specialist works inside the Head of Strategy's weekly run, which gives it each website's facts. Run the Head of Strategy to start the team.");
        return null;
      }
      const turn = await ctx.runMutation(internal.roleRuns.takeRoleTurn, { runId: args.runId });
      if (!turn.ok) {
        await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", turn.message);
        return null;
      }
      const setup = await ctx.runQuery(internal.insightsTeam.teamSetup, { runId: args.runId });
      const mode = setup.members.find((member) => member.role === INSIGHTS_LEAD_ROLE)?.mode ?? "TEST";
      // The daily quick check (§2, phase 2): every website the team covers, due its week or not — rules only, no AI.
      for (const [index, site] of [...setup.websites, ...setup.waiting].entries()) {
        await ctx.scheduler.runAfter(index * QUICK_STAGGER_MS, internal.insightsQuick.quickCheck, { holdId: site.holdId });
      }
      if (setup.websites.length === 0) {
        const waiting = setup.notDue.length > 0 ? ` Not due today by their company's Insights schedule: ${setup.notDue.join(", ")}.` : "";
        await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", setup.notDue.length > 0
          ? `No client is due today.${waiting}`
          : mode === "TEST"
            ? "In Test, the team reads only the companies a super admin is working in, and none of their websites has Search Console or Google Analytics connected."
            : "No website has Search Console or Google Analytics connected, so there was nothing to read.");
        return null;
      }
      const hosts = setup.websites.map((site) => site.host).join(", ");
      await ctx.runMutation(internal.roleRuns.recordObservation, {
        runId: args.runId,
        text: `${setup.websites.length === 1 ? "1 website" : `${setup.websites.length} websites`} to read${mode === "TEST" ? " (Test: the companies super admins are working in)" : ""}: ${hosts}. Each gets a run of its own.`,
      });
      for (const [index, site] of setup.websites.entries()) {
        const started = await ctx.runMutation(internal.insightsTeam.startWebsiteRun, { parentRunId: args.runId, ...site, delayMs: index * STAGGER_MS });
        await ctx.runMutation(internal.roleRuns.logRunLine, {
          runId: args.runId,
          companyId: site.companyId,
          heading: site.host,
          detail: started ? "Its own run started." : "Not started.",
          failed: !started,
        });
      }
      await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", `Started a run of its own for ${setup.websites.length === 1 ? "the 1 website" : `each of the ${setup.websites.length} websites`}: ${hosts}.`);
    } catch (error: unknown) {
      await finishRun(ctx, args.runId, args.workflowExecutionId, "FAILED", failureSummary(error));
    }
    return null;
  },
});

/** The daily quick checks are started this far apart, so a portfolio's pages aren't all asked at once. */
const QUICK_STAGGER_MS = 5_000;

/**
 * One website's week, step 1 of 3 (insights-one-voice-plan.md phase 0): the
 * money pages' checks and the sixteen months of history asked of Google,
 * then handed on to the reading and deciding (`decideWebsite`) and, the week
 * saved, to what follows it (`insightsRunAfter.afterWeek`). Each step lives
 * well inside the ten minutes Convex gives an action, and each is watched
 * past them (`insightsRunSteps.ts`): a run cut off at ten minutes on 12
 * October 2026 saved nothing and said it was still going.
 */
export const runWebsite = internalAction({
  args: insightsStepArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    const watchId: Id<"_scheduled_functions"> = await ctx.runMutation(internal.insightsRunSteps.bookInsightsWatch, { ...args, step: "GATHER" });
    try {
      const pagesChanged = await gather(ctx, args);
      await ctx.runMutation(internal.insightsRunSteps.handOnInsights, { ...args, step: "DECIDE", cancelWatchId: watchId, pagesChanged });
    } catch (error: unknown) {
      await ctx.runMutation(internal.insightsRunSteps.cancelInsightsWatch, { watchId });
      await finishRun(ctx, args.runId, args.workflowExecutionId, "FAILED", failureSummary(error));
    }
    return null;
  },
});

/**
 * Step 2 of 3: every source read as facts, the specialists, the Keyword
 * cannibalisation specialist and the Analyst side by side, the Head of
 * Strategy and the Editor, the week saved and every page's decision — then
 * handed on to what follows the save.
 */
export const decideWebsite = internalAction({
  args: { ...insightsStepArgs, watchId: v.id("_scheduled_functions"), pagesChanged: v.array(v.object({ kind: v.string(), page: v.string() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { watchId, pagesChanged, ...run } = args;
    try {
      const done = await readAndDecide(ctx, run, pagesChanged as Array<{ kind: Change["kind"]; page: string }>);
      await ctx.runMutation(internal.insightsRunSteps.handOnInsights, { ...run, step: "AFTER", cancelWatchId: watchId, ...done });
    } catch (error: unknown) {
      await ctx.runMutation(internal.insightsRunSteps.cancelInsightsWatch, { watchId });
      await finishRun(ctx, run.runId, run.workflowExecutionId, "FAILED", failureSummary(error));
    }
    return null;
  },
});

/** Step 1's work: the money pages' weekly checks and the history, each logged; the pages whose parts the checks saw change. */
async function gather(ctx: ActionCtx, args: InsightsRunArgs): Promise<Array<{ kind: Change["kind"]; page: string }>> {
  // 0. The money pages' weekly checks (phase 8), when a week has passed: indexing, speed, structured data.
  let pagesChanged: Array<{ kind: Change["kind"]; page: string }> = [];
  try {
    const checked = await ctx.runAction(internal.moneyPageChecks.checkWebsite, { holdId: args.holdId });
    pagesChanged = checked.changed;
    if (checked.checked > 0 || checked.problems.length > 0) {
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Money pages", detail: `Checked ${checked.checked} money pages.${checked.problems.length > 0 ? ` ${checked.problems.join(" ")}` : ""}`.slice(0, 900), failed: false });
    }
  } catch (error) {
    await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Money pages", detail: failureSummary(error), failed: true });
  }

  // 0b. The research's history (utils/insightHistory.ts): sixteen months of Search Console and Analytics, asked of Google for free.
  try {
    const history: { records: number; asks: number; problems: string[] } = await ctx.runAction(internal.insightHistory.fetchHistory, { holdId: args.holdId });
    await ctx.runMutation(internal.roleRuns.logRunLine, {
      runId: args.runId,
      companyId: args.companyId,
      heading: "History",
      detail: `Kept ${history.records} records of Search Console and Analytics from ${history.asks} asks to Google.${history.problems.length > 0 ? ` ${history.problems.join(" ")}` : ""}`.slice(0, 900),
      failed: history.records === 0 && history.problems.length > 0,
    });
  } catch (error) {
    await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "History", detail: failureSummary(error), failed: true });
  }
  return pagesChanged;
}

/** Step 2's work, returning the week and what it came to, for the step after the save. */
async function readAndDecide(ctx: ActionCtx, runArgs: InsightsRunArgs, pagesChanged: Array<{ kind: Change["kind"]; page: string }>) {
  // A shop is read in sales wherever enquiries are counted (I40).
  const args: InsightsRunArgs = { ...runArgs, shop: await ctx.runQuery(internal.insightsReading.isShopInternal, { holdId: runArgs.holdId }).catch(() => false) };
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const setup = await ctx.runQuery(internal.insightsTeam.teamSetup, {});
  const member = (role: string) => setup.members.find((entry) => entry.role === role && entry.isActive);
  const lead = member(INSIGHTS_LEAD_ROLE);

  // 1. One reading of every source (§2.1), and what the run asks Google itself (§8, I37, I42).
  const reading = await readWebsiteFacts(ctx, args.holdId);
  reading.facts.push(...await askedInRun(ctx, args.holdId));
  // 1b. Why the enquiries moved (insights-intelligence-plan.md phase 8): DataForSEO's week kept with the week, and the
  // newest whole month's six tests, from the sixteen months held, as facts the Analyst and the Head of Strategy may name.
  const rankings = await ctx.runQuery(internal.insightsPeriod.rankSnapshot, { holdId: args.holdId }).catch(() => null);
  const view: WhyView | null = await ctx.runQuery(internal.insightsPeriod.runView, { holdId: args.holdId }).catch(() => null);
  const why = view ? whyFacts(view) : [];
  reading.facts.push(...why);
  const facts = factsByKey(reading.facts);
  const bySource = new Map<string, number>();
  for (const fact of reading.facts) bySource.set(fact.source, (bySource.get(fact.source) ?? 0) + 1);
  const sources = [...bySource.entries()].map(([source, count]) => ({ source, facts: count }));
  await ctx.runMutation(internal.roleRuns.recordObservation, {
    runId: args.runId,
    text: `Read ${reading.facts.length} facts: ${sources.map((entry) => `${entry.facts} from ${entry.source}`).join(", ") || "none"}.${reading.problems.length > 0 ? ` Could not read: ${reading.problems.join("; ")}.` : ""}`,
  });

  // 2. Each specialist's checklist, in code (§2.2).
  const candidates = candidatesFor(reading.facts, args.host);
  await ctx.runMutation(internal.roleRuns.logRunLine, {
    runId: args.runId,
    companyId: args.companyId,
    heading: "Checklists",
    detail: candidates.length === 0 ? "No candidate worth a look." : candidates.map((candidate) => `${candidate.specialist}: ${candidate.pattern}`).join("; "),
    failed: false,
  });

  // Keeping score (§2.7): each finding due today, its watched figure read again against what it was when written.
  try {
    const due = await ctx.runQuery(internal.insightsTeam.dueFindings, { holdId: args.holdId, today });
    const outcomes = due.flatMap((finding) => {
      const then = finding.then, current = facts.get(finding.watch.key);
      if (!then || !current) return [];
      const outcome = outcomeOf(then.value, current.value, finding.watch.direction, then.unit);
      return [{ findingId: finding.findingId, specialist: finding.specialist, outcome, note: `${then.label}: ${formatFact(then)} then, ${formatFact(current)} now.` }];
    });
    if (outcomes.length > 0) await ctx.runMutation(internal.insightsTeam.scoreFindings, { companyId: args.companyId, outcomes });
    // The change log (I25): the page changes the website's own figures show, the parts of money pages
    // this week's check saw change, and its own Google profile's changes, each once, with what followed.
    const found = await ctx.runQuery(internal.insightsReading.pageChangesInternal, { holdId: args.holdId });
    const { notRemoved } = found;
    const changes = [...found.changes, ...await ctx.runQuery(internal.insightsReading.newChangesInternal, { holdId: args.holdId, today, seen: pagesChanged })];
    if (changes.length > 0 || notRemoved.length > 0) await ctx.runMutation(internal.insightsTeam.saveChanges, { holdId: args.holdId, companyId: args.companyId, week: weekOf(now), changes, notRemoved });
  } catch (error) {
    await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Track record", detail: failureSummary(error), failed: true });
  }
  // The enquiry check (I42): the specialists are told when the count may be wrong.
  const check = enquiryCheck(reading.facts);
  // What changes have taught, read when the specialists advise (I30).
  const learnings = await ctx.runQuery(internal.insightsTeam.learningsFor, { holdId: args.holdId }).catch(() => []);
  const caveat = [enquiryCheckBrief(check), learnings.length > 0 ? `What changes have taught (use it when you advise; say "this worked on N of M websites like yours" only from the lines that say so): ${learnings.join("; ")}.` : null].filter(Boolean).join("\n\n") || null;
  // The Measurement check (phase 13): whether the figures can be trusted, for the page and the Measurement specialist.
  const measured = await ctx.runQuery(internal.insightsReading.measurementInternal, { holdId: args.holdId }).catch(() => ({ health: null, byDay: [] }));
  const measurement = { checks: measurementFrom(reading.facts, check, measured.health), byDay: measured.byDay };
  // Opportunities and the page plan (phase 9), for their pages and the Search and content specialist.
  const plan = await ctx.runQuery(internal.insightsReading.planInternal, { holdId: args.holdId }).catch(() => null);
  const briefs: Record<string, string | null> = { measurement: measurementBrief(measurement.checks), search: plan ? planBrief(plan) : null };
  const caveatFor = (specialist: string) => [caveat, briefs[specialist] ?? null].filter(Boolean).join("\n\n") || null;
  // 3. Each specialist thinks and tests, side by side (§2.3) — the Keyword cannibalisation specialist beside them, handed the groups
  // the rule reads anew (insightCompeting.ts): asked after them, it cost the run a minute it had no room for (2026-10-12).
  const competingWork = competingForRun(ctx, args, weekOf(now), rulesFor(args), member(COMPETING_ROLE) ?? lead)
    .catch(async (error: unknown) => {
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Keyword cannibalisation", detail: failureSummary(error), failed: true });
      return { competing: null, drafts: [], facts: [], summary: null };
    });
  // 3b. The Analyst says why the enquiries moved, from the tests' facts, beside them: its words kept only when every figure is held.
  const analystWork = (async (): Promise<{ period: string; compare: "YEAR_AGO" | "BEFORE"; paragraph: string } | undefined> => {
    if (!view?.chosen || !view.why || why.length === 0) return undefined;
    try {
      const paragraph = await askAnalyst(ctx, args, view, why, member("INSIGHTS_ANALYST") ?? lead);
      await ctx.runMutation(internal.roleRuns.logRunLine, {
        runId: args.runId, companyId: args.companyId, heading: "Analyst",
        detail: paragraph ? `Why the enquiries moved in ${view.chosen.id}: ${paragraph}`.slice(0, 900) : "Its words named a figure not held, or typed one: none kept this week.",
        failed: !paragraph,
      });
      return paragraph ? { period: view.chosen.id, compare: view.why.compare, paragraph } : undefined;
    } catch (error) {
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Analyst", detail: failureSummary(error), failed: true });
      return undefined;
    }
  })();
  const drafts: Draft[] = [];
  const answers = await Promise.all(SIDE_BY_SIDE.map(async (specialist) => {
    const mine = candidates.filter((candidate) => candidate.specialist === specialist);
    if (mine.length === 0) return [];
    try {
      return await askSpecialist(ctx, args, specialist, mine, reading.facts, member(SPECIALIST_ROLE[specialist]) ?? lead, caveatFor(specialist));
    } catch (error) {
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: specialist, detail: failureSummary(error), failed: true });
      return [];
    }
  }));
  for (const answer of answers) drafts.push(...answer);
  const whyWords = await analystWork;

  // 3c. The Keyword cannibalisation specialist's write-ups, ranked and checked with the rest.
  const competing = await competingWork;
  drafts.push(...competing.drafts);
  reading.facts.push(...competing.facts);

  // 4. The Head of Strategy connects them, ranks them and writes the week's verdict (§2.4) — and calls each service
  // (insights-one-voice-plan.md phase 3): the rule's call first, its own last week's kept where the rule calls a service the same.
  const services = (await ctx.runQuery(internal.insightsReading.strategyInternal, { holdId: args.holdId }).catch(() => []))
    .map((service) => ({ ...service, signature: serviceReading(service), decidedBy: "RULE" as const }));
  carryServices(services, await ctx.runQuery(internal.insightsRunSteps.lastServices, { holdId: args.holdId, before: weekOf(now) }).catch(() => []));
  const toCall = servicesToCall(services);
  let verdict = "";
  let written: unknown = null;
  let ordered: Draft[] = [...drafts].sort((a, b) => b.stake - a.stake);
  if (drafts.length > 0 || toCall.length > 0) {
    try {
      const strategy = await askStrategy(ctx, args, drafts, reading.facts, lead, toCall);
      ordered = strategy.ordered;
      verdict = strategy.verdict;
      written = strategy.summary;
      const called = applyServiceCalls(toCall, strategy.services, weekOf(now));
      if (toCall.length > 0) {
        await ctx.runMutation(internal.roleRuns.logRunLine, {
          runId: args.runId, companyId: args.companyId, heading: "Strategy's calls",
          detail: `The Head of Strategy called ${called.kept + called.changed} of ${toCall.length} services, changing ${called.changed} of the rule's calls${called.refused > 0 ? `; ${called.refused} of its answers named no service it was given, no call a service can have, or no reason, so the rule's call stands` : ""}.`,
          failed: false,
        });
      }
    } catch (error) {
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Head of Strategy", detail: failureSummary(error), failed: true });
    }
  }

  // 5. The Editor checks every figure, comparison and claim, against a fresh reading (I21, I29).
  const fresh = factsByKey([...(await readWebsiteFacts(ctx, args.holdId)).facts, ...why, ...competing.facts]);
  const saved: SavedFinding[] = [];
  let rank = 0;
  for (const draft of ordered) {
    const verdictOf = editFinding(draft, fresh.size > 0 ? fresh : facts);
    if (!verdictOf.ok) {
      saved.push(sentBack(draft, verdictOf.note));
      continue;
    }
    rank += 1;
    const used = verdictOf.used;
    saved.push({
      specialist: draft.specialist,
      pattern: draft.pattern,
      status: "PUBLISHED",
      rank,
      ...(draft.atStake ? { atStake: draft.atStake } : {}),
      ...verdictOf.filled,
      sure: draft.sure,
      sources: [...new Set(used.map((fact) => fact.source))],
      facts: used,
      comparisons: draft.comparisons,
      ...(draft.watch && facts.has(draft.watch.key) ? { watch: draft.watch } : {}),
      checkOn: shiftDay(today, Math.min(120, Math.max(14, Math.round(draft.checkInDays ?? 56)))),
    });
  }
  // The Measurement check's ways to enquire, said by the run itself unless a specialist already wrote the same (phase 6).
  for (const finding of measurementFindings(measurement.checks, reading.facts, shiftDay(today, 28))) if (!saved.some((held) => held.status === "PUBLISHED" && held.pattern === finding.pattern)) saved.push({ ...finding, status: "PUBLISHED", rank: saved.length + 1 });
  const top = saved.find((finding) => finding.status === "PUBLISHED");
  const verdictText = verdictFrom(verdict, fresh.size > 0 ? fresh : facts) ?? top?.headline ?? (reading.facts.length === 0
    ? "There is nothing to read for this website yet: connect Search Console or Google Analytics."
    : "Nothing this week moved enough to call: the figures are steady.");
  // The executive summary's scorecard and charts, kept with the week (§8).
  const read = await ctx.runQuery(internal.insightsReading.monthlyInternal, { holdId: args.holdId });
  // People each month, Google's count of each month whole, beside the enquiries counted from the days.
  const people = await peopleByMonth(ctx, args.holdId).catch(() => new Map<string, number>());
  const monthly = { ...read, enquiriesByMonth: read.enquiriesByMonth.map((month) => (people.has(month.month) ? { ...month, people: people.get(month.month)! } : month)) };
  // The Head of Strategy's paragraphs, each kept only when every figure it names is held and none is typed;
  // a list or one block of text alike, and the run's log says what was kept and why any wasn't.
  const offered = (typeof written === "string" ? written.split(/\n\s*\n|\n/) : Array.isArray(written) ? written : []).filter((text): text is string => typeof text === "string" && text.trim().length > 0);
  const paragraphs = lines(offered, fresh.size > 0 ? fresh : facts, 3);
  if (offered.length !== paragraphs.length || offered.length === 0) {
    const why = offered.map((text) => whyNotFilled(text, fresh.size > 0 ? fresh : facts)).filter(Boolean);
    await ctx.runMutation(internal.roleRuns.logRunLine, {
      runId: args.runId, companyId: args.companyId, heading: "Head of Strategy's note",
      detail: `Kept ${paragraphs.length} of ${offered.length} paragraphs.${why.length > 0 ? ` ${why.join(" ")}` : ""}`.slice(0, 900),
      failed: paragraphs.length === 0,
    });
  }
  const summary = {
    ...(paragraphs.length > 0 ? { paragraphs } : {}),
    scorecard: scorecardFrom(reading.facts, args.host),
    enquiryCheck: check,
    services,
    ...(rankings ? { rankings } : {}),
    ...(whyWords ? { why: whyWords } : {}),
    ...(competing.summary ? { competing: competing.summary } : {}),
    ...monthly,
    checked: reading.facts.length,
    ruledOut: saved.filter((finding) => finding.status === "PUBLISHED").reduce((sum, finding) => sum + finding.ruledOut.length, 0),
  };
  const costUsd = await ctx.runQuery(internal.insightsTeam.runCost, { runId: args.runId });
  const publishedIds = await ctx.runMutation(internal.insightsTeam.saveWeek, {
    holdId: args.holdId,
    companyId: args.companyId,
    week: weekOf(now),
    runId: args.runId,
    verdict: verdictText,
    sources,
    problems: reading.problems,
    findings: saved,
    costUsd,
    summary,
    measurement,
    ...(plan ? { plan } : {}),
  });
  await keepCompeting(ctx, args, weekOf(now), competing, saved, publishedIds);
  // 6–10 follow the save in a step of their own (insightsRunAfter.ts): the reports, drafts, buyer questions, page reviews and Page decisions.
  const published = saved.filter((finding) => finding.status === "PUBLISHED").length;
  return { week: weekOf(now), today, counts: { facts: reading.facts.length, candidates: candidates.length, written: drafts.length, published, sentBack: saved.length - published } };
}

/**
 * People each month over the last year, as Analytics counts each month whole
 * (`yearMonth` by `totalUsers`): one report, the website's own addresses in
 * its home country, as every figure in the run.
 */
async function peopleByMonth(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const target = await ctx.runQuery(internal.insightsReading.analyticsTargetInternal, { holdId });
  if (!target) return out;
  const opened = await openSession(ctx, target.connectionId);
  if (!opened.ok) return out;
  const answer = await askAnalytics(opened.session, target.property, {
    startDate: `${shiftDay(target.newestDay, -395).slice(0, 7)}-01`, endDate: target.newestDay,
    dimensions: ["yearMonth"], metrics: ["totalUsers"],
    hostNames: target.addresses, countries: [target.country],
  });
  if (!answer.ok) return out;
  for (const row of answer.rows) {
    const key = row.keys[0] ?? "";
    if (/^\d{6}$/.test(key)) out.set(`${key.slice(0, 4)}-${key.slice(4)}`, row.values[0] ?? 0);
  }
  return out;
}

function sentBack(draft: Draft, note: string): SavedFinding {
  return {
    specialist: draft.specialist,
    pattern: draft.pattern,
    status: "SENT_BACK",
    rank: 0,
    headline: draft.headline,
    story: draft.story,
    ruledOut: draft.ruledOut,
    action: draft.action,
    howWeKnow: draft.howWeKnow,
    sure: draft.sure,
    sources: [],
    facts: [],
    comparisons: draft.comparisons,
    editorNote: note,
  };
}

/**
 * What the run asks Google Analytics itself, as a screen asks it when it
 * opens (§8, I37, I42): the people who clicked a link to another website in
 * 12 months, and of them the people who went on to convert — the enquiry
 * check's third sign. Kept only as facts of this run; a refusal leaves the
 * figure unsaid.
 */
async function askedInRun(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<Fact[]> {
  try {
    const target = await ctx.runQuery(internal.insightsReading.analyticsTargetInternal, { holdId });
    if (!target || target.counted.length === 0) return [];
    const opened = await openSession(ctx, target.connectionId);
    if (!opened.ok) return [];
    const from = shiftDay(target.newestDay, -364);
    const funnel = await askFunnel(opened.session, target.property, {
      startDate: from, endDate: target.newestDay, first: "click", then: target.counted, hostNames: target.addresses, countries: [target.country],
    });
    if (!funnel.ok) return [];
    const base = { source: "analytics" as const, unit: "count" as const, from, to: target.newestDay };
    return [
      { ...base, key: "ga.funnel.click.did.365.now", value: funnel.did, label: "people who clicked a link to another website" },
      { ...base, key: "ga.funnel.click.then.365.now", value: funnel.then, label: "of them, the people who went on to convert" },
    ];
  } catch {
    return [];
  }
}

/** The verdict with its figures filled in; null when it names one Hakken doesn't hold or types a number. */
function verdictFrom(text: string, facts: ReadonlyMap<string, Fact>): string | null {
  if (!text.trim() || typedNumbers(text).length > 0) return null;
  const filled = fillFacts(text, facts);
  return filled.missing.length > 0 ? null : filled.text;
}

/** The facts a specialist is handed: its candidates' first, then its discipline's, as words it can read. */
function factsFor(specialist: InsightSpecialist, candidates: readonly Candidate[], all: readonly Fact[]): Fact[] {
  const must = new Set(candidates.flatMap((candidate) => candidate.facts));
  const prefixes = READS[specialist];
  const rest = all.filter((fact) => !must.has(fact.key) && prefixes.some((prefix) => fact.key.startsWith(prefix)));
  return [...all.filter((fact) => must.has(fact.key)), ...rest].slice(0, MOST_FACTS);
}

/** A finding as the model wrote it, made safe; null when it lacks what a finding needs. */
export function draftFrom(raw: unknown, specialist: InsightSpecialist, fallbackPattern: string, stake: number): Draft | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const headline = words(entry.headline, 240), story = words(entry.story, 1200), action = words(entry.action, 400);
  if (!headline || !story || !action) return null;
  const sure = entry.sure === "HIGH" || entry.sure === "LOW" ? entry.sure : "MEDIUM";
  const watchRaw = entry.watch as { key?: unknown; direction?: unknown } | undefined;
  const watch = watchRaw && typeof watchRaw.key === "string" && (watchRaw.direction === "UP" || watchRaw.direction === "DOWN")
    ? { key: watchRaw.key, direction: watchRaw.direction as "UP" | "DOWN" }
    : undefined;
  const comparisons = Array.isArray(entry.comparisons)
    ? entry.comparisons.filter((pair): pair is string[] => Array.isArray(pair) && pair.length === 2 && pair.every((key) => typeof key === "string")).slice(0, 8)
    : [];
  return {
    specialist,
    pattern: words(entry.pattern, 60) || fallbackPattern,
    headline,
    story,
    action,
    howWeKnow: words(entry.howWeKnow, 400),
    ruledOut: Array.isArray(entry.ruledOut) ? entry.ruledOut.map((line) => words(line, 300)).filter(Boolean).slice(0, 5) : [],
    sure,
    ...(watch ? { watch } : {}),
    ...(typeof entry.checkInDays === "number" ? { checkInDays: entry.checkInDays } : {}),
    comparisons,
    stake,
  };
}

async function askSpecialist(
  ctx: ActionCtx,
  args: InsightsRunArgs,
  specialist: Exclude<InsightSpecialist, "strategy">,
  candidates: readonly Candidate[],
  all: readonly Fact[],
  member: TeamMember | undefined,
  caveat: string | null,
): Promise<Draft[]> {
  // The Search and content specialist works where pages compete, so it is given the rule the Keyword cannibalisation screens use.
  const system = [rulesFor(args), briefFor(SPECIALIST_ROLE[specialist], member?.instructions), specialist === "search" ? COMPETING_RULE : "", caveat ?? "", FINDINGS_FORMAT].filter(Boolean).join("\n\n");
  const prompt = JSON.stringify({
    website: args.host,
    candidates: candidates.map((candidate, number) => ({ number, pattern: candidate.pattern, seen: candidate.seen, atStake: Math.round(candidate.stake * 10) / 10, facts: candidate.facts })),
    facts: factLines(factsFor(specialist, candidates, all)),
  });
  const answer = await ask(ctx, args, member, `the ${specialist} specialist`, system, prompt) as { findings?: unknown } | null;
  const found = Array.isArray(answer?.findings) ? answer.findings : [];
  return found.slice(0, 3).flatMap((raw) => {
    const number = typeof (raw as { candidate?: unknown })?.candidate === "number" ? (raw as { candidate: number }).candidate : 0;
    const candidate = candidates[number] ?? candidates[0];
    const draft = draftFrom(raw, specialist, candidate.pattern, candidate.stake);
    // The pattern is the checklist's, never renamed by the model; with what it put at stake.
    return draft ? [{ ...draft, pattern: candidate.pattern, ...(candidate.enquiries ? { atStake: candidate.enquiries } : {}) }] : [];
  });
}

/** The Analyst's words on why the enquiries moved: kept only when every figure is named and held. */
async function askAnalyst(ctx: ActionCtx, args: InsightsRunArgs, view: WhyView, facts: readonly Fact[], member: TeamMember | undefined): Promise<string | null> {
  if (!view.chosen || !view.why) return null;
  const system = [rulesFor(args), briefFor("INSIGHTS_ANALYST", member?.instructions), WHY_FORMAT].filter(Boolean).join("\n\n");
  const prompt = JSON.stringify({
    website: args.host,
    period: view.chosen.id,
    against: view.why.compare === "YEAR_AGO" ? "the same period a year before" : "the period just before",
    tests: view.why.tests.map((test) => ({ test: test.id, verdict: test.verdict, enquiries: test.part })),
    facts: factLines(facts),
  });
  const answer = await ask(ctx, args, member, "the Analyst", system, prompt) as { paragraph?: unknown } | null;
  return verdictFrom(typeof answer?.paragraph === "string" ? answer.paragraph : "", factsByKey(facts));
}

async function askStrategy(
  ctx: ActionCtx,
  args: InsightsRunArgs,
  drafts: readonly Draft[],
  all: readonly Fact[],
  lead: TeamMember | undefined,
  services: readonly Service[],
): Promise<{ ordered: Draft[]; verdict: string; summary: unknown; services: unknown }> {
  const system = [rulesFor(args), briefFor(INSIGHTS_LEAD_ROLE, lead?.instructions), COMPETING_RULE, FINDINGS_FORMAT, STRATEGY_FORMAT].filter(Boolean).join("\n\n");
  const used = new Set(drafts.flatMap((draft) => [...draft.comparisons.flat(), ...[draft.headline, draft.story].flatMap((text) => [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]))]));
  // The figures the Executive summary's boxes show — the last 90 days against the same 90 days a year ago — so the
  // verdict and the note can speak with the page's one voice (Anthony, 2026-10-12: "we're still showing 19 in the box").
  const headline = [
    "ga.conversions.90.now", "ga.conversions.90.year", "ga.people.90.now", "ga.people.90.year", "ga.peoplePerConversion.90.now", "ga.peoplePerConversion.90.year",
    // Month on month: the last 30 days against the 30 before, which the Head of Strategy now weighs too.
    "ga.conversions.30.now", "ga.conversions.30.before", "ga.people.30.now", "ga.people.30.before", "ga.peoplePerConversion.30.now", "ga.peoplePerConversion.30.before",
    "ga.visits.365.now", "ga.visits.365.before", "ga.conversions.365.now", "ga.conversions.365.before", "sc.clicks.90.now", "sc.clicks.30.now", "sc.clicks.30.before",
  ];
  const prompt = JSON.stringify({
    website: args.host,
    findings: drafts.map((draft, number) => ({ number, specialist: draft.specialist, pattern: draft.pattern, atStake: Math.round(draft.stake * 10) / 10, headline: draft.headline, story: draft.story, action: draft.action, sure: draft.sure })),
    // The services to call, each with its figures and the rule's call (insights-one-voice-plan.md phase 3).
    services: services.map((service) => ({
      page: service.page, title: service.title, enquiries_12_months: service.enquiries, enquiries_year_before: service.enquiriesBefore,
      google_clicks: service.clicks, google_clicks_year_before: service.clicksBefore, rule_call: service.verdict,
    })),
    // And why the enquiries moved, the Analyst's tests (phase 8), so the verdict can say what caused the move.
    facts: factLines(all.filter((fact) => used.has(fact.key) || headline.includes(fact.key) || fact.key.startsWith("why."))),
  });
  const answer = await ask(ctx, args, lead, "the Head of Strategy", system, prompt) as { verdict?: unknown; summary?: unknown; order?: unknown; joined?: unknown; services?: unknown } | null;
  const order = Array.isArray(answer?.order) ? answer.order.filter((number): number is number => Number.isInteger(number) && number >= 0 && number < drafts.length) : [];
  const joined = (Array.isArray(answer?.joined) ? answer.joined : []).flatMap((raw) => {
    const listed: unknown[] = Array.isArray((raw as { from?: unknown })?.from) ? (raw as { from: unknown[] }).from : [];
    // A Keyword cannibalisation finding is never joined: it stands as its specialist wrote it, with the group's own decisions (phase 6).
    const from = listed.filter((number): number is number => typeof number === "number" && Number.isInteger(number) && number >= 0 && number < drafts.length && drafts[number].pattern !== "COMPETING_PAGES");
    if (from.length < 2) return [];
    const draft = draftFrom(raw, "strategy", "joinedStory", Math.max(...from.map((number) => drafts[number].stake)));
    // A joined story is the pattern of the finding most at stake it joins.
    const lead = [...from].sort((a, b) => drafts[b].stake - drafts[a].stake)[0];
    const atStake = Math.max(0, ...from.map((number) => drafts[number].atStake ?? 0));
    return draft ? [{ ...draft, from, pattern: drafts[lead].pattern, ...(atStake > 0 ? { atStake } : {}) }] : [];
  });
  // The order the Head of Strategy gave, each joined story in place of the first finding it joins, and the rest after.
  const replaced = new Set(joined.flatMap((draft) => draft.from ?? []));
  const placed = new Set<number>();
  const ordered: Draft[] = [];
  for (const number of [...order, ...drafts.map((_, index) => index)]) {
    if (placed.has(number)) continue;
    placed.add(number);
    const story = joined.find((draft) => draft.from?.[0] === number || (draft.from?.includes(number) && !ordered.includes(draft)));
    if (story && !ordered.includes(story)) ordered.push(story);
    if (!replaced.has(number) && (order.length === 0 || order.includes(number))) ordered.push(drafts[number]);
  }
  return { ordered, verdict: words(answer?.verdict, 300), summary: answer?.summary, services: answer?.services };
}
