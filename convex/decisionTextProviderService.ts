"use node";

import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import type { ResolvedAiModelConfig } from "./aiRuntimeTypes";
import { confidenceFromProbabilities } from "./decisionService";
import type { TypesafeAnswer, TypesafeAskResult, TypesafeQuestion } from "./typesafeProviderService";
import { appError } from "./utils/appError";

/**
 * A Decision answered by an ordinary text model.
 *
 * Anthony's ruling, 2026-09-17: Sonae must never depend on TypeSafe. So the
 * Decisions job takes any model, and this is the path for the ones that
 * write text. The model is handed the same state and the same questions
 * TypeSafe would get, and asked for the same shape back — a probability of
 * yes, or the chosen option with a probability per option, or a score with
 * a probability per level — as strict JSON against a schema built from the
 * questions, so every provider's structured-output path can enforce it.
 *
 * The result is the TypeSafe wire shape, so the engine and everything
 * behind it need not know which path answered. The one honest difference:
 * these probabilities are the model's own estimate written down, not a
 * measured calibration, which is why `decisionService` cuts this path's
 * certainty bands higher.
 */

const SYSTEM_INSTRUCTION =
  "You are a careful judge. You will be given some STATE (a JSON object describing a situation) and a map of " +
  "QUESTIONS about it. For each question, answer exactly as its type requires and say how sure you are as " +
  "probabilities between 0 and 1. A 'noul' question is yes/no: give the probability that the answer is yes. " +
  "A 'choice' question names its options in 'criteria': pick one and give a probability for every option; the " +
  "probabilities must sum to 1. A 'score' question lists ordered levels in 'criteria' (level 0 first): give a " +
  "probability for every level (summing to 1) and the score as the probability-weighted level. Be honest about " +
  "uncertainty: when the state does not settle a question, spread the probability rather than guessing. Answer " +
  "with JSON only.";

type JsonSchema = Record<string, unknown>;

function probabilitySchema(keys: string[]): JsonSchema {
  return {
    type: "object",
    properties: Object.fromEntries(keys.map((key) => [key, { type: "number", minimum: 0, maximum: 1 }])),
    required: keys,
    additionalProperties: false,
  };
}

/** The JSON schema for one question's answer, from the question itself. */
export function answerSchemaFor(question: TypesafeQuestion): JsonSchema {
  if (question.type === "noul") {
    return {
      type: "object",
      properties: { noul: { type: "number", minimum: 0, maximum: 1, description: "Probability that the answer is yes." } },
      required: ["noul"],
      additionalProperties: false,
    };
  }
  if (question.type === "choice") {
    const options = Object.keys(question.criteria);
    return {
      type: "object",
      properties: {
        choice: { type: "string", enum: options },
        probabilities: probabilitySchema(options),
      },
      required: ["choice", "probabilities"],
      additionalProperties: false,
    };
  }
  const levels = question.criteria.map((_level, index) => String(index));
  return {
    type: "object",
    properties: {
      score: { type: "number", minimum: 0, maximum: Math.max(0, question.criteria.length - 1) },
      probabilities: probabilitySchema(levels),
    },
    required: ["score", "probabilities"],
    additionalProperties: false,
  };
}

export function buildDecisionJsonSchema(questions: Record<string, TypesafeQuestion>): JsonSchema {
  const ids = Object.keys(questions);
  return {
    type: "object",
    properties: {
      answers: {
        type: "object",
        properties: Object.fromEntries(ids.map((id) => [id, answerSchemaFor(questions[id])])),
        required: ids,
        additionalProperties: false,
      },
    },
    required: ["answers"],
    additionalProperties: false,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Probabilities as the model wrote them, normalised to sum to 1 and clamped to [0, 1]. */
function normaliseProbabilities(raw: unknown, keys: string[]): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const values = keys.map((key) => {
    const value = record[key];
    return isFiniteNumber(value) ? Math.max(0, Math.min(1, value)) : 0;
  });
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return Object.fromEntries(keys.map((key, index) => [key, values[index] / total]));
}

/**
 * One question's answer in TypeSafe's shape, or a named reason it cannot be
 * used — the engine then runs the rule for that question rather than act on
 * something half-formed.
 */
export function parseTextModelAnswer(
  questionId: string,
  question: TypesafeQuestion,
  raw: unknown,
): TypesafeAnswer {
  const answer = (raw ?? {}) as Record<string, unknown>;
  const reject = (why: string) => appError("UPSTREAM_FAILURE", `The model's answer for '${questionId}' ${why}.`);

  if (question.type === "noul") {
    if (!isFiniteNumber(answer.noul)) throw reject("has no yes/no probability");
    return { type: "noul", noul: Math.max(0, Math.min(1, answer.noul)) };
  }

  if (question.type === "choice") {
    const options = Object.keys(question.criteria);
    const probabilities = normaliseProbabilities(answer.probabilities, options);
    if (!probabilities) throw reject("has no probability per option");
    // The chosen option is whatever the model said, if it is an option; else
    // the most probable — the spread is the truth the bands read.
    const choice = typeof answer.choice === "string" && options.includes(answer.choice)
      ? answer.choice
      : options.reduce((best, option) => (probabilities[option] > probabilities[best] ? option : best), options[0]);
    return { type: "choice", choice, probabilities, confidence: confidenceFromProbabilities(probabilities) };
  }

  const levels = question.criteria.map((_level, index) => String(index));
  const probabilities = normaliseProbabilities(answer.probabilities, levels);
  if (!probabilities) throw reject("has no probability per level");
  const weighted = levels.reduce((sum, level) => sum + Number(level) * probabilities[level], 0);
  return {
    type: "score",
    score: isFiniteNumber(answer.score) ? answer.score : weighted,
    legend: Object.fromEntries(question.criteria.map((text, index) => [String(index), text])),
    probabilities,
    confidence: confidenceFromProbabilities(probabilities),
  };
}

export async function askTextModel(args: {
  model: ResolvedAiModelConfig;
  state: unknown;
  questions: Record<string, TypesafeQuestion>;
  generate?: typeof generateTextWithResolvedModel;
}): Promise<TypesafeAskResult> {
  const ids = Object.keys(args.questions);
  if (ids.length === 0) throw appError("INVALID_INPUT", "A Decision request needs at least one question.");

  const response = await (args.generate ?? generateTextWithResolvedModel)({
    model: args.model,
    systemInstruction: SYSTEM_INSTRUCTION,
    contents: [
      {
        type: "text",
        text: `STATE:\n${JSON.stringify(args.state, null, 2)}\n\nQUESTIONS:\n${JSON.stringify(args.questions, null, 2)}`,
      },
    ],
    jsonSchema: buildDecisionJsonSchema(args.questions),
  });

  const text = response.text?.trim() ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw appError("UPSTREAM_FAILURE", "The model answered the Decision with no JSON.");
  let parsed: { answers?: Record<string, unknown> };
  try {
    parsed = JSON.parse(jsonMatch[0]) as { answers?: Record<string, unknown> };
  } catch {
    throw appError("UPSTREAM_FAILURE", "The model answered the Decision with JSON that does not parse.");
  }

  const answers: Record<string, TypesafeAnswer> = {};
  for (const id of ids) {
    if (!parsed.answers || !(id in parsed.answers)) {
      throw appError("UPSTREAM_FAILURE", `The model gave no answer for '${id}'.`);
    }
    answers[id] = parseTextModelAnswer(id, args.questions[id], parsed.answers[id]);
  }

  return {
    model: args.model.providerModelId,
    answers,
    usage: {
      inputTokens: response.inputTokens ?? 0,
      outputTokens: response.outputTokens ?? 0,
    },
  };
}
