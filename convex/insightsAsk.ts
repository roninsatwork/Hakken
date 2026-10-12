import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { failureSummary } from "./roleRuns";
import type { TeamMember } from "./insightsTeam";
import { appError } from "./utils/appError";
import { formatFact, type Fact } from "./utils/insightFacts";

/**
 * How the Insights team asks a model (moved out of `insightsRun.ts` on 12
 * October 2026, when the Keyword cannibalisation agent needed it too): the
 * run's spend limit checked first, the member's own model or the lead's, and
 * every call recorded on the run with its cost — one way for every agent.
 */

/** The run a question is asked in: whose spend it is, and the website it is about. */
export type AskRun = { runId: Id<"agentRuns">; companyId: Id<"companies">; host: string };

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
