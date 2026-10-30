"use node";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { prepareDecisions, runDecisions, type DecisionResult, type PreparedDecisions } from "./decisionActions";
import { failureSummary } from "./roleRuns";
import { findingWords, type Finding } from "./utils/sees/findings";

/**
 * Jev's common-sense calls for What Hakken sees (sees-findings-in-code-plan-2026-10-31.md, phases 2, 4 and 5),
 * through the Decisions engine: each question fixed in the registry, each answer recorded, each switchable in
 * Admin → Decisions, each with the rule it had before. Asked of the catalogue's enabled Jev model
 * (`seesJudgeModelInternal`), so every other Decision keeps the platform's own model. A Decision switched off, or
 * not sure enough to act, leaves the rule's answer: the bubble behaves as it did before.
 */

/** Who is asking and for what: the company, the Head's run the calls are recorded on. */
export type JudgeRun = { companyId: Id<"companies">; runId: Id<"agentRuns"> };

const KEYS = ["sees.finding-matters", "sees.gap-or-tracking", "sees.guess-as-fact", "sees.generic-step", "sees.point-covered"];

/** The eye's Decisions' modes and the model they ask, looked up once per bubble. */
export async function prepareSeesJudge(ctx: ActionCtx, run: JudgeRun): Promise<PreparedDecisions> {
  const prepared = await prepareDecisions(ctx, { keys: KEYS, companyId: run.companyId });
  if (!prepared.model) return prepared;
  const jev = await ctx.runQuery(internal.seesFindings.seesJudgeModelInternal, { companyId: run.companyId });
  return jev ? { ...prepared, model: jev } : prepared;
}

const acted = (result: DecisionResult | undefined) => result?.verdict === "ACT" && result.answer.kind === "yes-no";
const yes = (result: DecisionResult | undefined) => acted(result) && result!.answer.kind === "yes-no" && result!.answer.yes;
const no = (result: DecisionResult | undefined) => acted(result) && result!.answer.kind === "yes-no" && !result!.answer.yes;
/** Jev leaned no but was not sure enough to act: asked, answered no, not acted on. */
const leansNo = (result: DecisionResult | undefined) => !!result && result.source !== "RULES" && result.verdict !== "ACT" && result.answer.kind === "yes-no" && !result.answer.yes;

/**
 * Code's findings, judged: one Jev would call obvious or of no use is left out; a device gap Jev calls behaviour is
 * said as a gap, not as broken tracking. Notes for the run's log say what changed.
 */
export async function judgeFindings(ctx: ActionCtx, run: JudgeRun, prepared: PreparedDecisions, page: { host: string; shop: boolean; about: string }, findings: readonly Finding[]): Promise<{ findings: Finding[]; notes: string[] }> {
  if (findings.length === 0) return { findings: [], notes: [] };
  const notes: string[] = [];
  try {
    const requests = findings.flatMap((finding, at) => [
      { key: "sees.finding-matters", id: `matters-${at}`, subjectId: finding.id, fallback: () => ({ kind: "yes-no" as const, yes: true }) },
      ...(finding.kind === "trackingGap" ? [{ key: "sees.gap-or-tracking", id: `gap-${at}`, subjectId: finding.id, fallback: () => ({ kind: "yes-no" as const, yes: true }) }] : []),
    ]);
    // One request per finding's questions: the state names the one finding each is about.
    const kept: Finding[] = [];
    // Those Jev leans to calling obvious go to the end: still shown in the panel, no longer first to be written up.
    const later: Finding[] = [];
    for (const [at, finding] of findings.entries()) {
      const mine = requests.filter((request) => request.id.endsWith(`-${at}`));
      const results = await runDecisions(ctx, {
        companyId: run.companyId,
        subject: { kind: "seesFinding", id: finding.id },
        state: { website: { host: page.host, shop: page.shop }, page: page.about, finding: { words: findingWords(finding), figures: finding.facts.map((fact) => ({ what: fact.label, value: fact.value })) } },
        requests: mine,
        links: { agentRunId: run.runId },
        prepared,
      });
      if (no(results[`matters-${at}`])) {
        notes.push(`Left out as obvious or of no use: ${findingWords(finding)}`);
        continue;
      }
      if (leansNo(results[`matters-${at}`])) {
        notes.push(`Moved to the end, as probably obvious: ${findingWords(finding)}`);
        later.push(finding.kind === "trackingGap" ? { ...finding, params: { ...finding.params, tracking: "check" } } : finding);
        continue;
      }
      if (finding.kind === "trackingGap" && no(results[`gap-${at}`])) {
        notes.push(`Called behaviour, not tracking: ${findingWords(finding)}`);
        kept.push({ ...finding, params: { ...finding.params, tracking: "behaviour" } });
        continue;
      }
      kept.push(finding.kind === "trackingGap" ? { ...finding, params: { ...finding.params, tracking: "check" } } : finding);
    }
    // Their keys follow their new places, so the team names f1 for the first finding it is shown.
    const ordered = [...kept, ...later].map((finding, at) => ({ ...finding, facts: finding.facts.map((fact) => ({ ...fact, key: fact.key.replace(/^f\d+\./, `f${at + 1}.`) })) }));
    return { findings: ordered, notes };
  } catch (error) {
    return { findings: [...findings], notes: [`Jev could not judge the findings (${failureSummary(error)}); all are kept.`] };
  }
}

/**
 * The words judged: a sentence that states a guess as fact, or a step that would fit any website, sends them back
 * with why. Null when they stand.
 */
export async function judgeWords(ctx: ActionCtx, run: JudgeRun, prepared: PreparedDecisions, host: string, says: readonly string[], steps: readonly string[], figures: ReadonlyArray<{ what: string; value: number }>): Promise<string | null> {
  try {
    for (const [at, sentence] of says.entries()) {
      const results = await runDecisions(ctx, {
        companyId: run.companyId,
        subject: { kind: "seesSentence", id: `${run.runId}:${at}` },
        state: { sentence, figures },
        requests: [{ key: "sees.guess-as-fact", fallback: () => ({ kind: "yes-no" as const, yes: false }) }],
        links: { agentRunId: run.runId },
        prepared,
      });
      if (yes(results["sees.guess-as-fact"])) return `A sentence states a reason the figures don't show as fact: "${sentence}". Say only what the figures show, or offer the reason as a possibility.`;
    }
    for (const [at, step] of steps.entries()) {
      const results = await runDecisions(ctx, {
        companyId: run.companyId,
        subject: { kind: "seesStep", id: `${run.runId}:${at}` },
        state: { step, website: host },
        requests: [{ key: "sees.generic-step", fallback: () => ({ kind: "yes-no" as const, yes: false }) }],
        links: { agentRunId: run.runId },
        prepared,
      });
      if (yes(results["sees.generic-step"])) return `A step would fit any website: "${step}". Say where: the page, channel, device, step or product.`;
    }
    return null;
  } catch {
    // Jev unreachable: the Editor's own checks have run; the words stand.
    return null;
  }
}

/** The eval set graded by Jev: each of the notes found or missed. Null when the Decision is off or unsure throughout. */
export async function judgePoints(ctx: ActionCtx, run: JudgeRun, prepared: PreparedDecisions, points: readonly string[], bubble: { says: readonly string[]; steps: readonly string[] }): Promise<{ score: number; notes: string[] } | null> {
  try {
    const results = await runDecisions(ctx, {
      companyId: run.companyId,
      subject: { kind: "seesEval", id: run.runId },
      state: { bubble },
      requests: points.map((point, at) => ({ key: "sees.point-covered", id: `point-${at}`, subjectId: point.slice(0, 120), fallback: () => ({ kind: "yes-no" as const, yes: false }) })),
      links: { agentRunId: run.runId },
      prepared,
    });
    // Each point is its own question about the same bubble: the state carries the bubble, the point goes with it.
    if (points.every((_, at) => !acted(results[`point-${at}`]))) return null;
    const found = points.map((_, at) => yes(results[`point-${at}`]));
    return {
      score: Math.round((found.filter(Boolean).length / points.length) * 100) / 100,
      notes: points.map((point, at) => `${found[at] ? "Found" : "Missed"} (Jev): ${point}`),
    };
  } catch {
    return null;
  }
}
