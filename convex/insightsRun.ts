"use node";

import { v } from "convex/values";
import { appError } from "./utils/appError";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { failureSummary } from "./roleRuns";
import { finishRun } from "./searchConsoleAgentRun";
import { readWebsiteFacts } from "./insightsReading";
import { weekOf, type SavedFinding, type TeamMember } from "./insightsTeam";
import type { Score } from "./utils/insightSummary";

type SavedScorecard = Score[];
import { INSIGHTS_LEAD_ROLE } from "./utils/agentRoles";
import { briefFor } from "./utils/insightBriefs";
import { candidatesFor, type Candidate } from "./utils/insightChecks";
import { editFinding, type DraftFinding } from "./utils/insightEditor";
import { factsByKey, fillFacts, formatFact, shiftDay, type Fact } from "./utils/insightFacts";
import {
  BOARD_FORMAT,
  FINDINGS_FORMAT,
  MONTH_FORMAT,
  GROUND_RULES,
  SHOP_RULE,
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
import { measurementBrief, measurementFrom } from "./utils/insightMeasurement";
import { planBrief } from "./utils/insightPlan";
import { DRAFT_RULES, draftsFrom, type Drafted } from "./utils/insightDrafts";
import { PANEL_RULES, panelFrom } from "./utils/insightPanel";
import { REVIEW_RULES, VERDICTS, funnelFrom, sourcesFrom, verdictByRule, type Verdict } from "./utils/insightConversion";
import { missingStructuredData } from "./utils/moneyPageChecks";
import { ask as askAnalytics, askFunnel, openSession } from "./googleAnalyticsCollect";
import { journeysOf, type Journey } from "./googleAnalyticsLists";
import { assistantOf } from "./utils/aiAssistants";

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

/** One website's week. */
export const runWebsite = internalAction({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.id("workflowExecutions"),
    holdId: v.id("companyWebsites"),
    companyId: v.id("companies"),
    host: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      const summary = await readAndWrite(ctx, args);
      await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", summary);
    } catch (error: unknown) {
      await finishRun(ctx, args.runId, args.workflowExecutionId, "FAILED", failureSummary(error));
    }
    return null;
  },
});

type RunArgs = { runId: Id<"agentRuns">; holdId: Id<"companyWebsites">; companyId: Id<"companies">; host: string; shop?: boolean };

/** The ground rules every brief starts from, with a shop read in sales (I40). */
const rulesFor = (args: RunArgs) => (args.shop ? `${GROUND_RULES}\n${SHOP_RULE}` : GROUND_RULES);

async function readAndWrite(ctx: ActionCtx, runArgs: RunArgs): Promise<string> {
  // A shop is read in sales wherever enquiries are counted (I40).
  const args: RunArgs = { ...runArgs, shop: await ctx.runQuery(internal.insightsReading.isShopInternal, { holdId: runArgs.holdId }).catch(() => false) };
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const setup = await ctx.runQuery(internal.insightsTeam.teamSetup, {});
  const member = (role: string) => setup.members.find((entry) => entry.role === role && entry.isActive);
  const lead = member(INSIGHTS_LEAD_ROLE);

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
  // 3. Each specialist thinks and tests, side by side (§2.3).
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

  // 3b. The Analyst says why the enquiries moved, from the tests' facts: its words kept only when every figure is held.
  let whyWords: { period: string; compare: "YEAR_AGO" | "BEFORE"; paragraph: string } | undefined;
  if (view?.chosen && view.why && why.length > 0) {
    try {
      const paragraph = await askAnalyst(ctx, args, view, why, member("INSIGHTS_ANALYST") ?? lead);
      if (paragraph) whyWords = { period: view.chosen.id, compare: view.why.compare, paragraph };
      await ctx.runMutation(internal.roleRuns.logRunLine, {
        runId: args.runId, companyId: args.companyId, heading: "Analyst",
        detail: paragraph ? `Why the enquiries moved in ${view.chosen.id}: ${paragraph}`.slice(0, 900) : "Its words named a figure not held, or typed one: none kept this week.",
        failed: !paragraph,
      });
    } catch (error) {
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Analyst", detail: failureSummary(error), failed: true });
    }
  }

  // 4. The Head of Strategy connects them, ranks them and writes the week's verdict (§2.4).
  let verdict = "";
  let written: unknown = null;
  let ordered: Draft[] = [...drafts].sort((a, b) => b.stake - a.stake);
  if (drafts.length > 0) {
    try {
      const strategy = await askStrategy(ctx, args, drafts, reading.facts, lead);
      ordered = strategy.ordered;
      verdict = strategy.verdict;
      written = strategy.summary;
    } catch (error) {
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Head of Strategy", detail: failureSummary(error), failed: true });
    }
  }

  // 5. The Editor checks every figure, comparison and claim, against a fresh reading (I21, I29).
  const fresh = factsByKey([...(await readWebsiteFacts(ctx, args.holdId)).facts, ...why]);
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
  const top = saved.find((finding) => finding.status === "PUBLISHED");
  const verdictText = verdictFrom(verdict, fresh.size > 0 ? fresh : facts) ?? top?.headline ?? (reading.facts.length === 0
    ? "There is nothing to read for this website yet: connect Search Console or Google Analytics."
    : "Nothing this week moved enough to call: the figures are steady.");
  // The executive summary's scorecard and charts, kept with the week (§8).
  const read = await ctx.runQuery(internal.insightsReading.monthlyInternal, { holdId: args.holdId });
  // People each month, Google's count of each month whole, beside the enquiries counted from the days.
  const people = await peopleByMonth(ctx, args.holdId).catch(() => new Map<string, number>());
  const monthly = { ...read, enquiriesByMonth: read.enquiriesByMonth.map((month) => (people.has(month.month) ? { ...month, people: people.get(month.month)! } : month)) };
  const services = await ctx.runQuery(internal.insightsReading.strategyInternal, { holdId: args.holdId }).catch(() => []);
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
  // 6. The Report Writer (§4.1, §4.2): the week's brief every run; the monthly report and the board report when due.
  const reports: string[] = [];
  try {
    reports.push(...await writeReports(ctx, args, {
      week: weekOf(now),
      today,
      verdict: verdictText,
      findings: saved.filter((finding) => finding.status === "PUBLISHED").map((finding, index) => ({ ...finding, findingId: publishedIds[index] ?? null })),
      summary,
      facts: reading.facts,
      writer: member("INSIGHTS_REPORT_WRITER") ?? lead,
    }));
  } catch (error) {
    await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Report Writer", detail: failureSummary(error), failed: true });
  }
  // 7. Drafted fixes for what lives off the website (I23, I39): profile changes and posts, review replies, outreach.
  let drafted = 0;
  try {
    drafted = await writeDrafts(ctx, args, weekOf(now), member(SPECIALIST_ROLE.local) ?? lead, member(SPECIALIST_ROLE.links) ?? lead);
  } catch (error) {
    await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Drafts", detail: failureSummary(error), failed: true });
  }
  // 8. The buyer-question panel (I28): built every 90 days by the AI visibility specialist, and asked once its collection is on.
  try {
    await buildPanel(ctx, args, member(SPECIALIST_ROLE.aiVisibility) ?? lead);
  } catch (error) {
    await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Buyer questions", detail: failureSummary(error), failed: true });
  }
  // 9. The Conversion specialist's pages (phase 14): the funnel, each source's rate, each money page reviewed, experiments.
  try {
    await reviewPages(ctx, args, weekOf(now), reading.facts, member(SPECIALIST_ROLE.conversion) ?? lead);
  } catch (error) {
    await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Page reviews", detail: failureSummary(error), failed: true });
  }
  const published = saved.filter((finding) => finding.status === "PUBLISHED").length;
  return `${args.host}: ${reading.facts.length} facts read,${reports.length > 0 ? ` ${reports.join(", ")} written,` : ""}${drafted > 0 ? ` ${drafted} fixes drafted,` : ""} ${candidates.length} candidates, ${drafts.length} findings written, ${published} published and ${saved.length - published} sent back by the Editor. Cost $${costUsd.toFixed(3)}.`;
}

/**
 * The week's drafted fixes (I23, phases 10 and 11): the Local and reputation
 * specialist drafts Business Profile changes, posts, a review request and
 * replies; the Links and PR specialist an email to each site linking to
 * rivals but not to the business. Each area is asked only when it has
 * something to fix; Hakken adds each draft's tagged link (I39).
 */
async function writeDrafts(ctx: ActionCtx, args: RunArgs, week: string, local: TeamMember | undefined, links: TeamMember | undefined): Promise<number> {
  const inputs = await ctx.runQuery(internal.insightsDrafts.draftInputs, { holdId: args.holdId });
  if (!inputs) return 0;
  const pages = inputs.pages.map((page) => page.page);
  const recent = inputs.recent.map((row) => `${row.kind}: ${row.target}`);
  const drafted: Drafted[] = [];
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
    const answer = await ask(ctx, args, local, "the Local and reputation specialist's drafts", system, prompt);
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
    const answer = await ask(ctx, args, links, "the Links and PR specialist's drafts", system, prompt);
    drafted.push(...draftsFrom(answer, "LINKS", pages));
  }
  if (drafted.length === 0) return 0;
  return await ctx.runMutation(internal.insightsDrafts.saveDrafts, { holdId: args.holdId, companyId: args.companyId, week, origin: inputs.origin, drafts: drafted });
}

/** The buyer-question panel, built when due (I28); then put on or taken off the company's questions as its collection says. */
async function buildPanel(ctx: ActionCtx, args: RunArgs, member: TeamMember | undefined): Promise<void> {
  const inputs = await ctx.runQuery(internal.insightsPanel.panelInputs, { holdId: args.holdId });
  if (!inputs) return;
  if (inputs.due && inputs.searches.length > 0) {
    const system = [briefFor("INSIGHTS_AI_VISIBILITY", member?.instructions), PANEL_RULES].filter(Boolean).join("\n\n");
    const prompt = JSON.stringify({ business: inputs.name, website: inputs.host, searches: inputs.searches.map((row) => ({ search: row.search, monthly: row.volume, page: row.page })), services: inputs.services, guides: inputs.guides });
    const answer = await ask(ctx, args, member, "the buyer-question panel", system, prompt);
    const sources = new Map<string, number | null>([...inputs.searches.map((row) => [row.search.toLowerCase(), row.volume] as [string, number]), ...inputs.guides.map((guide) => [guide.toLowerCase(), null] as [string, null])]);
    const questions = panelFrom(answer, inputs.name, sources);
    if (questions.length > 0) await ctx.runMutation(internal.insightsPanel.savePanel, { holdId: args.holdId, companyId: args.companyId, questions });
  }
  const synced = await ctx.runMutation(internal.insightsPanel.syncPanel, { holdId: args.holdId });
  if (synced.overLimit > 0) {
    await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Buyer questions", detail: `${synced.overLimit} of the panel's questions are past the website's limit of questions and aren't asked.`, failed: false });
  }
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
async function reviewPages(ctx: ActionCtx, args: RunArgs, week: string, facts: readonly Fact[], member: TeamMember | undefined): Promise<void> {
  const inputs = (await ctx.runQuery(internal.insightsConversion.reviewInputs, { holdId: args.holdId })).slice(0, PAGES_REVIEWED);
  let answered = new Map<string, { verdict: Verdict; reason: string; steps: string[] }>();
  // Where each page's visitors were just before (I36): one ask of Analytics, the last 90 days.
  const beforeOf = await pagesBefore(ctx, args.holdId, inputs.map((page) => page.page)).catch(() => new Map<string, Journey[]>());
  if (inputs.length > 0) {
    const system = [briefFor("INSIGHTS_CONVERSION", member?.instructions), REVIEW_RULES, args.shop ? SHOP_RULE : ""].filter(Boolean).join("\n\n");
    const prompt = JSON.stringify({
      website: args.host,
      pages: inputs.map((page) => ({
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
    const answer = await ask(ctx, args, member, "the Conversion specialist's page reviews", system, prompt).catch(() => null) as { pages?: unknown } | null;
    const list = Array.isArray(answer?.pages) ? answer.pages : [];
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
  const pages = inputs.map((page) => {
    const said = answered.get(page.page);
    return {
      page: page.page, title: page.title, kind: page.kind, visits: page.visits, enquiries: page.enquiries, visitsBefore: page.visitsBefore, enquiriesBefore: page.enquiriesBefore, visits90: page.visits90, enquiries90: page.enquiries90,
      verdict: said?.verdict ?? verdictByRule(page, page.facts, page.structured), reason: said?.reason ?? "", steps: said?.steps ?? [],
      before: beforeOf.get(page.page) ?? [],
    };
  });
  await ctx.runMutation(internal.insightsConversion.saveConversion, { holdId: args.holdId, companyId: args.companyId, week, conversion: { funnel: funnelFrom(facts), sources: sourcesFrom(facts), pages } });
}

type WrittenFinding = SavedFinding & { findingId: Id<"insightFindings"> | null };

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

/** A written line with its figures filled in, or null when it names a figure not held or types one. */
function filled(text: unknown, facts: ReadonlyMap<string, Fact>): string | null {
  if (typeof text !== "string" || !text.trim()) return null;
  if (typedNumbers(text).length > 0) return null;
  const answer = fillFacts(text.trim(), facts);
  return answer.missing.length > 0 ? null : answer.text;
}

/** The Report Writer's own brief: none when the writing falls to the Head of Strategy, whose brief is its own. */
const writerBrief = (writer: TeamMember | undefined) => (writer?.role === "INSIGHTS_REPORT_WRITER" ? writer.instructions : undefined);

/** Why a written line was left out, for the run's log: a number typed, or a figure Hakken doesn't hold. */
function whyNotFilled(text: string, facts: ReadonlyMap<string, Fact>): string | null {
  const typed = typedNumbers(text);
  if (typed.length > 0) return `Typed ${typed.join(", ")}.`;
  const missing = fillFacts(text.trim(), facts).missing;
  return missing.length > 0 ? `Named figures not held: ${missing.join(", ")}.` : null;
}

function lines(value: unknown, facts: ReadonlyMap<string, Fact>, most: number): string[] {
  return (Array.isArray(value) ? value : []).map((line) => filled(line, facts)).filter((line): line is string => Boolean(line)).slice(0, most);
}

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
  args: RunArgs,
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
    holdId: args.holdId, companyId: args.companyId, kind: "WEEKLY", from: input.week, to: weekEnd, period: input.week, title: "Weekly brief", runId: args.runId,
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
  const due = await ctx.runQuery(internal.insightsTeam.reportsDue, { holdId: args.holdId, today: input.today });
  const used = (facts: ReadonlyMap<string, Fact>) => [...facts.values()].map((fact) => ({ key: fact.key, label: fact.label, value: fact.value, unit: fact.unit }));
  if (due.month) {
    const monthFacts = await ctx.runQuery(internal.insightsReading.monthFactsInternal, { holdId: args.holdId, month: due.month });
    const facts = factsByKey([...monthFacts, ...input.facts.filter((fact) => fact.source === "market" && fact.key.endsWith(".now"))]);
    const system = [rulesFor(args), briefFor("INSIGHTS_REPORT_WRITER", writerBrief(input.writer)), MONTH_FORMAT].filter(Boolean).join("\n\n");
    const prompt = JSON.stringify({ website: args.host, month: monthName(due.month), facts: factLines([...facts.values()]), findings: input.findings.slice(0, 5).map((finding) => ({ headline: finding.headline, action: finding.action })) });
    const answer = await ask(ctx, args, input.writer, "the Report Writer's monthly report", system, prompt) as Record<string, unknown> | null;
    const headline = filled(answer?.headline, facts) ?? input.verdict;
    await ctx.runMutation(internal.insightsTeam.saveReport, {
      holdId: args.holdId, companyId: args.companyId, kind: "MONTHLY", from: `${due.month}-01`, to: monthFacts.find((fact) => fact.key === "month.enquiries.now")?.to ?? `${due.month}-28`,
      period: due.month, title: `Monthly report: ${monthName(due.month)}`, runId: args.runId,
      body: {
        ...base,
        headline,
        summary: filled(answer?.summary, facts) ?? headline,
        points: lines(answer?.points, facts, 4),
        next: lines(answer?.next, facts, 3),
        risks: [], opportunities: [], decision: null,
        facts: used(facts),
      },
    });
    written.push(`the ${monthName(due.month)} report`);
  }
  if (due.quarter) {
    const facts = factsByKey(input.facts.filter((fact) => /\.(90|365)\.(now|year|before)$/.test(fact.key) && /^(ga\.(conversions|people|visits|peoplePerConversion|channel\.(Organic Search|AI assistants|Direct)\.(visits|conversions))|sc\.clicks)/.test(fact.key) || fact.source === "market" || /^ai\.[^.]+\.mentions/.test(fact.key) || /^local\./.test(fact.key)));
    const system = [rulesFor(args), briefFor("INSIGHTS_REPORT_WRITER", writerBrief(input.writer)), BOARD_FORMAT].filter(Boolean).join("\n\n");
    const prompt = JSON.stringify({ website: args.host, quarter: due.quarter, facts: factLines([...facts.values()]), findings: input.findings.slice(0, 6).map((finding) => ({ headline: finding.headline, story: finding.story, action: finding.action })) });
    const answer = await ask(ctx, args, input.writer, "the Report Writer's board report", system, prompt) as Record<string, unknown> | null;
    const from = shiftDay(input.today, -90);
    const to = shiftDay(input.today, -1);
    const headline = typeof answer?.headline === "string" && typedNumbers(answer.headline).length === 0 && !/\[\[/.test(answer.headline) ? answer.headline.trim().slice(0, 80) : "The quarter, against last year and our rivals";
    await ctx.runMutation(internal.insightsTeam.saveReport, {
      holdId: args.holdId, companyId: args.companyId, kind: "BOARD", from, to, period: due.quarter, title: `Board report: ${dayName(from)} to ${dayName(to)}`, runId: args.runId,
      body: {
        ...base,
        headline,
        summary: filled(answer?.summary, facts) ?? input.verdict,
        points: lines(answer?.points, facts, 3),
        risks: lines(answer?.risks, facts, 3),
        opportunities: lines(answer?.opportunities, facts, 3),
        next: lines(answer?.next, facts, 3),
        decision: filled(answer?.decision, facts),
        facts: used(facts),
      },
    });
    written.push(`the ${due.quarter} board report`);
  }
  return written;
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

function factLines(facts: readonly Fact[]) {
  return facts.map((fact) => ({
    key: fact.key,
    what: fact.label,
    value: formatFact(fact),
    ...(fact.from ? { from: fact.from } : {}),
    ...(fact.to ? { to: fact.to } : {}),
    ...(fact.country ? { country: fact.country } : {}),
  }));
}

/** The model a member works with, or the lead's, or the platform's default for agents. */
async function modelFor(ctx: ActionCtx, args: RunArgs, member: TeamMember | undefined) {
  return await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
    ...(member?.requestedModelId ? { requestedModelId: member.requestedModelId } : {}),
    companyId: args.companyId,
    useCase: "agent",
  });
}

/** Ask the model, record the call and its cost on the run, and give back its JSON (or null). */
async function ask(ctx: ActionCtx, args: RunArgs, member: TeamMember | undefined, what: string, system: string, prompt: string): Promise<unknown> {
  const spend = await ctx.runQuery(internal.roleRuns.runSpendLeft, { runId: args.runId });
  if (spend.limitReached) throw appError("CONFLICT", `The run reached its spend limit ($${spend.spentUsd.toFixed(2)}), so ${what} was not asked.`);
  const model = await modelFor(ctx, args, member);
  let text = "";
  let tokens = { input: 0, output: 0 };
  let failed = false;
  try {
    const response = await generateTextWithResolvedModel({
      model,
      systemInstruction: system,
      contents: [{ type: "text", text: prompt }],
      temperature: 0.2,
    });
    text = response.text ?? "";
    tokens = { input: response.inputTokens ?? 0, output: response.outputTokens ?? 0 };
  } catch (error) {
    failed = true;
    text = failureSummary(error);
  }
  const parsed = failed ? null : readJson(text);
  await ctx.runMutation(internal.roleRuns.recordRunModelCall, {
    runId: args.runId,
    companyId: args.companyId,
    actionContext: `Insights: ${what} for ${args.host}`,
    modelId: model.modelId,
    providerKey: model.providerKey,
    providerModelId: model.providerModelId,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    promptContent: prompt,
    responseContent: text,
    failed: failed || parsed === null,
  });
  if (failed) throw appError("UPSTREAM_FAILURE", text);
  return parsed;
}

/** A model's JSON answer, its code fences taken off; null when it isn't JSON. */
export function readJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{"), end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const words = (value: unknown, most = 600) => (typeof value === "string" ? value.trim().slice(0, most) : "");

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
  args: RunArgs,
  specialist: Exclude<InsightSpecialist, "strategy">,
  candidates: readonly Candidate[],
  all: readonly Fact[],
  member: TeamMember | undefined,
  caveat: string | null,
): Promise<Draft[]> {
  const system = [rulesFor(args), briefFor(SPECIALIST_ROLE[specialist], member?.instructions), caveat ?? "", FINDINGS_FORMAT].filter(Boolean).join("\n\n");
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
async function askAnalyst(ctx: ActionCtx, args: RunArgs, view: WhyView, facts: readonly Fact[], member: TeamMember | undefined): Promise<string | null> {
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
  args: RunArgs,
  drafts: readonly Draft[],
  all: readonly Fact[],
  lead: TeamMember | undefined,
): Promise<{ ordered: Draft[]; verdict: string; summary: unknown }> {
  const system = [rulesFor(args), briefFor(INSIGHTS_LEAD_ROLE, lead?.instructions), FINDINGS_FORMAT, STRATEGY_FORMAT].filter(Boolean).join("\n\n");
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
    // And why the enquiries moved, the Analyst's tests (phase 8), so the verdict can say what caused the move.
    facts: factLines(all.filter((fact) => used.has(fact.key) || headline.includes(fact.key) || fact.key.startsWith("why."))),
  });
  const answer = await ask(ctx, args, lead, "the Head of Strategy", system, prompt) as { verdict?: unknown; summary?: unknown; order?: unknown; joined?: unknown } | null;
  const order = Array.isArray(answer?.order) ? answer.order.filter((number): number is number => Number.isInteger(number) && number >= 0 && number < drafts.length) : [];
  const joined = (Array.isArray(answer?.joined) ? answer.joined : []).flatMap((raw) => {
    const listed: unknown[] = Array.isArray((raw as { from?: unknown })?.from) ? (raw as { from: unknown[] }).from : [];
    const from = listed.filter((number): number is number => typeof number === "number" && Number.isInteger(number) && number >= 0 && number < drafts.length);
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
  return { ordered, verdict: words(answer?.verdict, 300), summary: answer?.summary };
}
