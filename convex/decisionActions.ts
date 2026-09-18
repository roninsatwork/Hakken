"use node";

import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { DECISION_MODEL_USE_CASE, TYPESAFE_PROVIDER_KEY } from "./aiModelService";
import { getDecision, toDecisionAnswer, type DecisionDefinition } from "./decisionRegistry";
import {
  answerText,
  certaintyOf,
  outcomeFor,
  verdictFor,
  type CertaintyBand,
  type DecisionAnswer,
  type DecisionMode,
  type DecisionOutcome,
  type DecisionSource,
  type DecisionVerdict,
} from "./decisionService";
import { askTextModel } from "./decisionTextProviderService";
import { askTypesafe, type TypesafeAskResult, type TypesafeQuestion } from "./typesafeProviderService";
import type { ResolvedAiModelConfig } from "./aiRuntimeTypes";
import { appError } from "./utils/appError";
import { getErrorMessage } from "./utils/lang";

/**
 * The one door through which the platform asks a Decision.
 *
 * A caller names the Decisions it needs over one piece of state, and for each
 * gives the rule it used before Decisions existed. This function works out
 * each Decision's mode, asks TypeSafe once for every Decision that is
 * switched on, turns each answer into a certainty and a verdict, writes the
 * run rows, the cost row and any audit entry, and hands back a result the
 * caller can branch on without ever seeing a probability.
 *
 * Whatever goes wrong — provider off, no TypeSafe model chosen, the request
 * failing — the caller gets the rule's answer with `verdict: "RULES"` and the
 * run row says why. Nothing here throws for a provider problem; it only
 * throws for a caller error (an unregistered key).
 *
 * docs/plans/active/decisions-typesafe-plan.md, commitments 2 and 4.
 */

export type FallbackReason = "MODE_OFF" | "NO_MODEL" | "PROVIDER_FAILED";

export type DecisionRequest = {
  key: string;
  /**
   * Set when one call asks the same Decision about several things (the
   * four pages a chooser picked): each request then has its own id and
   * its own result, in one provider request rather than four.
   */
  id?: string;
  /** The rule the platform used before this Decision existed. */
  fallback: () => DecisionAnswer | Promise<DecisionAnswer>;
};

export type DecisionResult = {
  key: string;
  answer: DecisionAnswer;
  certainty: CertaintyBand | null;
  mode: DecisionMode;
  verdict: DecisionVerdict;
  outcome: DecisionOutcome;
  source: DecisionSource;
  fallbackReason?: FallbackReason;
  /** What acting on this answer means, when it means anything. */
  action: string | null;
};

export type RunDecisionsArgs = {
  companyId?: Id<"companies">;
  /** What is being judged, by reference only; the text goes to the model, never to a table. */
  subject: { kind: string; id: string };
  state: unknown;
  requests: DecisionRequest[];
  links?: {
    agentRunId?: Id<"agentRuns">;
    threadId?: Id<"threads">;
    messageId?: Id<"messages">;
  };
};

type Asker = (args: {
  model: string;
  state: unknown;
  questions: Record<string, TypesafeQuestion>;
}) => Promise<TypesafeAskResult>;

type TextAsker = (args: {
  model: ResolvedAiModelConfig;
  state: unknown;
  questions: Record<string, TypesafeQuestion>;
}) => Promise<TypesafeAskResult>;

/** A test can hand in its own askers; production asks TypeSafe or the chosen text model. */
export type RunDecisionsDeps = { ask?: Asker; askText?: TextAsker; now?: () => number };

export async function runDecisions(
  ctx: ActionCtx,
  args: RunDecisionsArgs,
  deps: RunDecisionsDeps = {},
): Promise<Record<string, DecisionResult>> {
  const definitions = new Map<string, DecisionDefinition>();
  for (const request of args.requests) {
    const definition = getDecision(request.key);
    if (!definition) throw appError("INVALID_INPUT", `Unknown decision '${request.key}'.`);
    definitions.set(request.key, definition);
  }
  if (args.requests.length === 0) return {};

  const modes = await ctx.runQuery(internal.decisionRuns.resolveModesInternal, {
    decisionKeys: [...new Set(args.requests.map((request) => request.key))],
    ...(args.companyId ? { companyId: args.companyId } : {}),
  });

  const idOf = (request: DecisionRequest) => request.id ?? request.key;
  const ids = args.requests.map(idOf);
  if (new Set(ids).size !== ids.length) {
    throw appError("INVALID_INPUT", "Each request in one Decision call needs its own id when a Decision is asked more than once.");
  }
  const askedRequests = args.requests.filter((request) => modes[request.key] !== "OFF");
  const askedKeys = [...new Set(askedRequests.map((request) => request.key))];

  let asked: TypesafeAskResult | null = null;
  let answeredBy: "TYPESAFE" | "TEXT_MODEL" = "TYPESAFE";
  let fallbackReason: FallbackReason | null = null;
  let usage: {
    modelId: string;
    providerKey: string;
    providerModelId: string;
    inputTokens: number;
    outputTokens: number;
  } | null = null;

  if (askedRequests.length > 0) {
    const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      useCase: DECISION_MODEL_USE_CASE,
      ...(args.companyId ? { companyId: args.companyId } : {}),
    });

    if (model.source === "failsafe") {
      // Nothing is configured for the Decisions job, nor as a platform
      // default: resolution reached the compiled-in failsafe. The rule
      // answers, and the row says so.
      fallbackReason = "NO_MODEL";
    } else {
      const questions: Record<string, TypesafeQuestion> = {};
      for (const request of askedRequests) questions[idOf(request)] = definitions.get(request.key)!.question;
      // Any model can answer a Decision (Anthony's ruling, 2026-09-17).
      // TypeSafe measures its certainty; a text model estimates it, in the
      // same wire shape, and its bands are cut higher for that.
      answeredBy = model.providerKey === TYPESAFE_PROVIDER_KEY ? "TYPESAFE" : "TEXT_MODEL";
      try {
        asked = answeredBy === "TYPESAFE"
          ? await (deps.ask ?? askTypesafe)({ model: model.providerModelId, state: args.state, questions, maxAttempts: 2 })
          : await (deps.askText ?? askTextModel)({ model, state: args.state, questions });
        usage = {
          modelId: model.modelId,
          providerKey: model.providerKey,
          providerModelId: model.providerModelId,
          inputTokens: asked.usage.inputTokens,
          outputTokens: asked.usage.outputTokens,
        };
      } catch (error) {
        console.warn("Decision request failed; the simple rules answered instead.", {
          decisions: askedKeys,
          subject: args.subject,
          message: getErrorMessage(error, "Unknown error"),
        });
        fallbackReason = "PROVIDER_FAILED";
      }
    }
  }

  const results: Record<string, DecisionResult> = {};
  for (const request of args.requests) {
    const definition = definitions.get(request.key)!;
    const mode = modes[request.key];
    const wireAnswer = asked?.answers[idOf(request)];

    if (mode === "OFF" || !wireAnswer) {
      const answer = await request.fallback();
      const reason: FallbackReason = mode === "OFF" ? "MODE_OFF" : (fallbackReason ?? "PROVIDER_FAILED");
      results[idOf(request)] = {
        key: request.key,
        answer,
        certainty: null,
        mode,
        verdict: "RULES",
        outcome: "RECORDED",
        source: "RULES",
        fallbackReason: reason,
        action: definition.describeAction(answer),
      };
      continue;
    }

    const answer = toDecisionAnswer(wireAnswer);
    const certainty = certaintyOf(answer, answeredBy);
    const verdict = verdictFor({ mode, certainty, stakes: definition.stakes, source: answeredBy });
    const action = definition.describeAction(answer);
    results[idOf(request)] = {
      key: request.key,
      answer,
      certainty,
      mode,
      verdict,
      outcome: outcomeFor({ verdict, actionable: action !== null }),
      source: answeredBy,
      action,
    };
  }

  await ctx.runMutation(internal.decisionRuns.recordRunsInternal, {
    ...(args.companyId ? { companyId: args.companyId } : {}),
    subjectKind: args.subject.kind,
    subjectId: args.subject.id,
    ...(args.links?.agentRunId ? { agentRunId: args.links.agentRunId } : {}),
    ...(args.links?.threadId ? { threadId: args.links.threadId } : {}),
    ...(args.links?.messageId ? { messageId: args.links.messageId } : {}),
    ...(usage ? { usage } : {}),
    runs: args.requests.map((request) => {
      const result = results[idOf(request)];
      const probabilities =
        result.answer.kind === "yes-no"
          ? typeof result.answer.probability === "number"
            ? { yes: result.answer.probability, no: Number((1 - result.answer.probability).toFixed(6)) }
            : undefined
          : result.answer.probabilities;
      return {
        decisionKey: request.key,
        answer: answerText(result.answer),
        ...(probabilities ? { probabilities: JSON.stringify(probabilities) } : {}),
        ...(result.certainty ? { certainty: result.certainty } : {}),
        mode: result.mode,
        outcome: result.outcome,
        source: result.source,
        ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
        ...(result.outcome === "ACTED" && result.action ? { action: result.action } : {}),
      };
    }),
  });

  return results;
}
