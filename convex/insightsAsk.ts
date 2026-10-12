import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { failureSummary } from "./roleRuns";
import type { TeamMember } from "./insightsTeam";
import { appError } from "./utils/appError";
import { fillFacts, formatFact, type Fact } from "./utils/insightFacts";
import { typedNumbers } from "./utils/insightEditor";
import { GROUND_RULES, SHOP_RULE } from "./utils/insightTeam";

/**
 * How the Insights team asks a model (moved out of `insightsRun.ts` on 12
 * October 2026, when the Keyword cannibalisation agent needed it too): the
 * run's spend limit checked first, the member's own model or the lead's, and
 * every call recorded on the run with its cost — one way for every agent.
 */

/** The run a question is asked in: whose spend it is, and the website it is about. */
export type AskRun = { runId: Id<"agentRuns">; companyId: Id<"companies">; host: string };

/** A website's weekly run, as each of its steps is given it; a shop is read in sales (I40). */
export type InsightsRunArgs = AskRun & { holdId: Id<"companyWebsites">; shop?: boolean };

/** What each step of a website's week is started with (`insightsRun.ts`, `insightsRunAfter.ts`, `insightsRunSteps.ts`). */
export const insightsStepArgs = {
  runId: v.id("agentRuns"),
  workflowExecutionId: v.id("workflowExecutions"),
  holdId: v.id("companyWebsites"),
  companyId: v.id("companies"),
  host: v.string(),
};

/** The ground rules every brief starts from, with a shop read in sales (I40). */
export const rulesFor = (args: InsightsRunArgs) => (args.shop ? `${GROUND_RULES}\n${SHOP_RULE}` : GROUND_RULES);

/**
 * The longest one question waits for its answer. A model that hasn't
 * answered by then is given up, recorded as failed, and the step goes on
 * without it: on 12 October 2026 a model said nothing for five minutes, its
 * client asked again, and the run was stopped at Convex's ten minutes having
 * saved nothing (insights-one-voice-plan.md phase 0).
 */
export const ASK_LIMIT_MS = 3 * 60 * 1000;

/** The answer, or a refusal once `limitMs` has passed. */
export async function within<T>(work: Promise<T>, limitMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(appError("UPSTREAM_FAILURE", `The model gave no answer within ${Math.round(limitMs / 1000)} seconds, so it was given up.`)), limitMs);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The model a member works with, or the lead's, or the platform's default for agents. */
async function modelFor(ctx: ActionCtx, args: AskRun, member: TeamMember | undefined) {
  return await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
    ...(member?.requestedModelId ? { requestedModelId: member.requestedModelId } : {}),
    companyId: args.companyId,
    useCase: "agent",
  });
}

/** Ask the model, record the call and its cost on the run, and give back its JSON (or null). */
export async function ask(ctx: ActionCtx, args: AskRun, member: TeamMember | undefined, what: string, system: string, prompt: string): Promise<unknown> {
  const spend = await ctx.runQuery(internal.roleRuns.runSpendLeft, { runId: args.runId });
  if (spend.limitReached) throw appError("CONFLICT", `The run reached its spend limit ($${spend.spentUsd.toFixed(2)}), so ${what} was not asked.`);
  const model = await modelFor(ctx, args, member);
  let text = "";
  let tokens = { input: 0, output: 0 };
  let failed = false;
  try {
    const response = await within(generateTextWithResolvedModel({
      model,
      systemInstruction: system,
      contents: [{ type: "text", text: prompt }],
      temperature: 0.2,
    }), ASK_LIMIT_MS);
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

/** Facts as a model reads them: each by its key, what it is, its value written out, and its span and country. */
export function factLines(facts: readonly Fact[]) {
  return facts.map((fact) => ({
    key: fact.key,
    what: fact.label,
    value: formatFact(fact),
    ...(fact.from ? { from: fact.from } : {}),
    ...(fact.to ? { to: fact.to } : {}),
    ...(fact.country ? { country: fact.country } : {}),
  }));
}

/** A written line with its figures filled in, or null when it names a figure not held or types one. */
export function filled(text: unknown, facts: ReadonlyMap<string, Fact>): string | null {
  if (typeof text !== "string" || !text.trim()) return null;
  if (typedNumbers(text).length > 0) return null;
  const answer = fillFacts(text.trim(), facts);
  return answer.missing.length > 0 ? null : answer.text;
}

/** Why a written line was left out, for the run's log: a number typed, or a figure Hakken doesn't hold. */
export function whyNotFilled(text: string, facts: ReadonlyMap<string, Fact>): string | null {
  const typed = typedNumbers(text);
  if (typed.length > 0) return `Typed ${typed.join(", ")}.`;
  const missing = fillFacts(text.trim(), facts).missing;
  return missing.length > 0 ? `Named figures not held: ${missing.join(", ")}.` : null;
}

/** A model's lines, each with its figures filled in; those that name a figure not held, or type one, left out. */
export function lines(value: unknown, facts: ReadonlyMap<string, Fact>, most: number): string[] {
  return (Array.isArray(value) ? value : []).map((line) => filled(line, facts)).filter((line): line is string => Boolean(line)).slice(0, most);
}

/** A model's answer as words, trimmed and cut to `most` letters; nothing when it isn't text. */
export const words = (value: unknown, most = 600) => (typeof value === "string" ? value.trim().slice(0, most) : "");
