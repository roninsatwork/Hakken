"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { failureSummary } from "./roleRuns";
import { finishRun } from "./searchConsoleAgentRun";
import { ask, factLines, filled, insightsStepArgs, lines, rulesFor, type InsightsRunArgs } from "./insightsAsk";
import { readWebsiteFacts } from "./insightsReading";
import { decideForRun } from "./insightDecisions";
import { writeBoxes } from "./insightBoxes";
import { whyFacts, type WhyView } from "./utils/insightWhyFacts";
import { PAGE_DECISIONS_ROLE } from "./utils/insightPageAgent";
import type { TeamMember } from "./insightsTeam";
import type { WrittenFinding } from "./insightsRunSteps";
import { INSIGHTS_LEAD_ROLE } from "./utils/agentRoles";
import { briefFor } from "./utils/insightBriefs";
import { factsByKey, shiftDay, type Fact } from "./utils/insightFacts";
import { typedNumbers } from "./utils/insightEditor";
import { BOARD_FORMAT, MONTH_FORMAT, SHOP_RULE, SPECIALIST_ROLE } from "./utils/insightTeam";
import type { Score } from "./utils/insightSummary";
import { DRAFT_RULES, draftsFrom, type Drafted } from "./utils/insightDrafts";
import { PANEL_RULES, panelFrom } from "./utils/insightPanel";
import { REVIEW_RULES, VERDICTS, funnelFrom, sourcesFrom, verdictByRule, type Verdict } from "./utils/insightConversion";
import { missingStructuredData } from "./utils/moneyPageChecks";
import { ask as askAnalytics, openSession } from "./googleAnalyticsCollect";
import { journeysOf, type Journey } from "./googleAnalyticsLists";
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
    ...insightsStepArgs,
    watchId: v.id("_scheduled_functions"),
    week: v.string(),
    today: v.string(),
    counts: v.object({ facts: v.number(), candidates: v.number(), written: v.number(), published: v.number(), sentBack: v.number() }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { watchId, week, today, counts, workflowExecutionId, ...run } = args;
    const failed = (heading: string) => async (error: unknown) => {
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: run.runId, companyId: run.companyId, heading, detail: failureSummary(error), failed: true });
      return null;
    };
    try {
      const runArgs: InsightsRunArgs = { ...run, shop: await ctx.runQuery(internal.insightsReading.isShopInternal, { holdId: run.holdId }).catch(() => false) };
      const setup = await ctx.runQuery(internal.insightsTeam.teamSetup, {});
      const member = (role: string) => setup.members.find((entry) => entry.role === role && entry.isActive);
      const lead = member(INSIGHTS_LEAD_ROLE);
      const saved = await ctx.runQuery(internal.insightsRunSteps.savedWeek, { holdId: run.holdId, week, runId: run.runId });
      const facts = (await readWebsiteFacts(ctx, run.holdId)).facts;
      // The newest whole month's tests, for the boxes written for the period a screen opens on.
      const view: WhyView | null = await ctx.runQuery(internal.insightsPeriod.runView, { holdId: run.holdId }).catch(() => null);
      const [reports, drafted] = await Promise.all([
        // 6. The Report Writer (§4.1, §4.2): the week's brief every run; the monthly report and the board report when due.
        saved?.summary
          ? writeReports(ctx, runArgs, { week, today, verdict: saved.verdict, findings: saved.findings, summary: saved.summary, facts, writer: member("INSIGHTS_REPORT_WRITER") ?? lead }).catch(failed("Report Writer"))
          : Promise.resolve(null),
        // 7. Drafted fixes for what lives off the website (I23, I39): profile changes and posts, review replies, outreach.
        writeDrafts(ctx, runArgs, week, member(SPECIALIST_ROLE.local) ?? lead, member(SPECIALIST_ROLE.links) ?? lead).catch(failed("Drafts")),
        // 8. The buyer-question panel (I28): built every 90 days by the AI visibility specialist, and asked once its collection is on.
        buildPanel(ctx, runArgs, member(SPECIALIST_ROLE.aiVisibility) ?? lead).catch(failed("Buyer questions")),
        // 9. The Conversion specialist's pages (phase 14): the funnel, each source's rate, each money page reviewed, experiments;
        // then every page's decision, reading those reviews, the Page decisions specialist handed what the rule doesn't simply keep.
        reviewPages(ctx, runArgs, week, facts, member(SPECIALIST_ROLE.conversion) ?? lead).catch(failed("Page reviews"))
          .then(async () => await decideForRun(ctx, runArgs, week, rulesFor(runArgs), member(PAGE_DECISIONS_ROLE) ?? lead))
          // and Page decisions' box, written from the decisions just made.
          .then(async () => await writeBoxes(ctx, runArgs, week, rulesFor(runArgs), facts, member, null, true).catch(failed("Page decisions' box"))),
        // 11. Each screen's "What Hakken sees" box, written by its discipline's specialist (insights-one-voice-plan.md phase 4).
        writeBoxes(ctx, runArgs, week, rulesFor(runArgs), [...facts, ...(view ? whyFacts(view) : [])], member, view?.chosen?.id ?? null).catch(failed("Screens' boxes")),
      ]);
      const costUsd = await ctx.runQuery(internal.insightsTeam.runCost, { runId: run.runId });
      const written = reports ?? [];
      await ctx.runMutation(internal.insightsRunSteps.cancelInsightsWatch, { watchId });
      await finishRun(ctx, run.runId, workflowExecutionId, "SUCCESS", `${run.host}: ${counts.facts} facts read,${written.length > 0 ? ` ${written.join(", ")} written,` : ""}${drafted ? ` ${drafted} fixes drafted,` : ""} ${counts.candidates} candidates, ${counts.written} findings written, ${counts.published} published and ${counts.sentBack} sent back by the Editor. Cost $${costUsd.toFixed(3)}.`);
    } catch (error: unknown) {
      // The week is saved either way: what failed here is said, and the run is finished.
      await ctx.runMutation(internal.insightsRunSteps.cancelInsightsWatch, { watchId });
      await finishRun(ctx, run.runId, workflowExecutionId, "SUCCESS", `${run.host}: the week was saved; what follows it stopped: ${failureSummary(error)}`);
    }
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
async function buildPanel(ctx: ActionCtx, args: InsightsRunArgs, member: TeamMember | undefined): Promise<void> {
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
