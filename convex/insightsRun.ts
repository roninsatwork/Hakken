"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { failureSummary } from "./roleRuns";
import { finishRun } from "./searchConsoleAgentRun";
import { readWebsiteFacts } from "./insightsReading";
import { weekOf, type SavedFinding, type TeamMember } from "./insightsTeam";
import { INSIGHTS_LEAD_ROLE } from "./utils/agentRoles";
import { candidatesFor, type Candidate } from "./utils/insightChecks";
import { editFinding, type DraftFinding } from "./utils/insightEditor";
import { factsByKey, fillFacts, formatFact, shiftDay, type Fact } from "./utils/insightFacts";
import {
  DISCIPLINE,
  FINDINGS_FORMAT,
  GROUND_RULES,
  READS,
  SIDE_BY_SIDE,
  SPECIALIST_ROLE,
  STRATEGY_FORMAT,
  type InsightSpecialist,
} from "./utils/insightTeam";
import { typedNumbers } from "./utils/insightEditor";
import { scorecardFrom } from "./utils/insightSummary";

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

type RunArgs = { runId: Id<"agentRuns">; holdId: Id<"companyWebsites">; companyId: Id<"companies">; host: string };

async function readAndWrite(ctx: ActionCtx, args: RunArgs): Promise<string> {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const setup = await ctx.runQuery(internal.insightsTeam.teamSetup, {});
  const member = (role: string) => setup.members.find((entry) => entry.role === role && entry.isActive);
  const lead = member(INSIGHTS_LEAD_ROLE);

  // 1. One reading of every source (§2.1).
  const reading = await readWebsiteFacts(ctx, args.holdId);
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

  // 3. Each specialist thinks and tests, side by side (§2.3).
  const drafts: Draft[] = [];
  const answers = await Promise.all(SIDE_BY_SIDE.map(async (specialist) => {
    const mine = candidates.filter((candidate) => candidate.specialist === specialist);
    if (mine.length === 0) return [];
    try {
      return await askSpecialist(ctx, args, specialist, mine, reading.facts, member(SPECIALIST_ROLE[specialist]) ?? lead);
    } catch (error) {
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: specialist, detail: failureSummary(error), failed: true });
      return [];
    }
  }));
  for (const answer of answers) drafts.push(...answer);

  // 4. The Head of Strategy connects them, ranks them and writes the week's verdict (§2.4).
  let verdict = "";
  let ordered: Draft[] = [...drafts].sort((a, b) => b.stake - a.stake);
  if (drafts.length > 0) {
    try {
      const strategy = await askStrategy(ctx, args, drafts, reading.facts, lead);
      ordered = strategy.ordered;
      verdict = strategy.verdict;
    } catch (error) {
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading: "Head of Strategy", detail: failureSummary(error), failed: true });
    }
  }

  // 5. The Editor checks every figure, comparison and claim, against a fresh reading (I21, I29).
  const fresh = factsByKey((await readWebsiteFacts(ctx, args.holdId)).facts);
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
    ? "Hakken has nothing to read for this website yet: connect Search Console or Google Analytics."
    : "Nothing this week moved enough to call: the figures are steady.");
  // The executive summary's scorecard and charts, kept with the week (§8).
  const monthly = await ctx.runQuery(internal.insightsReading.monthlyInternal, { holdId: args.holdId });
  const summary = {
    scorecard: scorecardFrom(reading.facts, args.host),
    ...monthly,
    checked: reading.facts.length,
    ruledOut: saved.filter((finding) => finding.status === "PUBLISHED").reduce((sum, finding) => sum + finding.ruledOut.length, 0),
  };
  const costUsd = await ctx.runQuery(internal.insightsTeam.runCost, { runId: args.runId });
  await ctx.runMutation(internal.insightsTeam.saveWeek, {
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
  });
  const published = saved.filter((finding) => finding.status === "PUBLISHED").length;
  return `${args.host}: ${reading.facts.length} facts read, ${candidates.length} candidates, ${drafts.length} findings written, ${published} published and ${saved.length - published} sent back by the Editor. Cost $${costUsd.toFixed(3)}.`;
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
  if (spend.limitReached) throw new Error(`The run reached its spend limit ($${spend.spentUsd.toFixed(2)}), so ${what} was not asked.`);
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
  if (failed) throw new Error(text);
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
): Promise<Draft[]> {
  const system = [GROUND_RULES, `Your discipline is ${DISCIPLINE[specialist]}.`, member?.instructions ?? "", FINDINGS_FORMAT].filter(Boolean).join("\n\n");
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

async function askStrategy(
  ctx: ActionCtx,
  args: RunArgs,
  drafts: readonly Draft[],
  all: readonly Fact[],
  lead: TeamMember | undefined,
): Promise<{ ordered: Draft[]; verdict: string }> {
  const system = [GROUND_RULES, `You are the Head of Strategy: ${DISCIPLINE.strategy}. Connect findings that share one cause across specialists into one story, rank everything by what is at stake for the business — enquiries or sales won or lost first (each finding's "atStake" is the checklist's measure of it); a measurement problem ranks first only when it makes the other findings untrustworthy — and keep one voice. The week's biggest story must be a finding of its own, not only the verdict.`, lead?.instructions ?? "", FINDINGS_FORMAT, STRATEGY_FORMAT].filter(Boolean).join("\n\n");
  const used = new Set(drafts.flatMap((draft) => [...draft.comparisons.flat(), ...[draft.headline, draft.story].flatMap((text) => [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]))]));
  const headline = ["ga.visits.365.now", "ga.visits.365.before", "ga.conversions.365.now", "ga.conversions.365.before", "sc.clicks.90.now", "sc.clicks.30.now", "sc.clicks.30.before"];
  const prompt = JSON.stringify({
    website: args.host,
    findings: drafts.map((draft, number) => ({ number, specialist: draft.specialist, pattern: draft.pattern, atStake: Math.round(draft.stake * 10) / 10, headline: draft.headline, story: draft.story, action: draft.action, sure: draft.sure })),
    facts: factLines(all.filter((fact) => used.has(fact.key) || headline.includes(fact.key))),
  });
  const answer = await ask(ctx, args, lead, "the Head of Strategy", system, prompt) as { verdict?: unknown; order?: unknown; joined?: unknown } | null;
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
  return { ordered, verdict: words(answer?.verdict, 300) };
}
