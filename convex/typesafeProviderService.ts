"use node";

import { TYPESAFE_PROVIDER_KEY } from "./aiModelService";
import { requestProviderJson, type ProviderFetch } from "./providerHttpService";
import { appError } from "./utils/appError";

/**
 * TypeSafe: the platform's judgment provider.
 *
 * TypeSafe's System One models (`jev-latest` is the flagship) do not write
 * text. You hand them some state plus a map of typed questions and get one
 * typed answer per question, each with its probability spread:
 *
 * - a **noul** is a yes/no, answered as a probability of yes;
 * - a **choice** picks one option from a set you name, with a probability per
 *   option and a `confidence` derived from that spread;
 * - a **score** places the state on an ordered scale you describe, with a
 *   probability per level and the same kind of `confidence`.
 *
 * This is the only file that speaks TypeSafe's wire shape. The Decision engine
 * (`convex/decisions/`) is its only caller; nothing else should import it, and
 * it never joins either text registry — a judgment model asked for prose is a
 * provider error, so `canProviderServeUseCase` keeps it out of every text job.
 *
 * Wire contract from https://docs.typesafe.ai/api.md, checked 2026-09-17.
 * The official SDK is deliberately not used: it carries its own retry policy,
 * and two retry loops stacked on one call multiply the wait on every outage.
 */

const TYPESAFE_BASE_URL = "https://api.typesafe.ai";
const TYPESAFE_PROVIDER_NAME = "TypeSafe";

/**
 * A Decision sits on a live path (an email, a chat turn): a stalled provider
 * must fail fast so the rule can answer. And a reply is a few kilobytes of
 * JSON; anything approaching this is not an answer.
 */
export const TYPESAFE_TIMEOUT_MS = 20_000;
export const TYPESAFE_MAX_RESPONSE_BYTES = 256 * 1024;

/**
 * The reply read a chunk at a time and refused past the size cap, before
 * anything tries to hold the whole of it (review, 2026-09-18). Returned as
 * a fresh Response so the shared JSON parser reads it as it would any other.
 */
export function boundedFetch(fetchImpl: ProviderFetch, maxBytes = TYPESAFE_MAX_RESPONSE_BYTES): ProviderFetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw appError("UPSTREAM_FAILURE", `TypeSafe reply is too large (${declared} bytes).`);
    }
    if (!response.body) return response;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw appError("UPSTREAM_FAILURE", `TypeSafe reply is too large (over ${maxBytes} bytes).`);
      }
      chunks.push(value);
    }
    const body = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

/** The model every TypeSafe example uses; the sync lists what the key can see. */
export const TYPESAFE_DEFAULT_MODEL_ID = "jev-latest";

export type TypesafeProviderEnv = {
  TYPESAFE_API_KEY?: string;
};

export function buildTypesafeProviderConfig(args: { env: TypesafeProviderEnv }) {
  if (!args.env.TYPESAFE_API_KEY) {
    throw appError("NOT_CONFIGURED", "TypeSafe credentials are missing TYPESAFE_API_KEY.");
  }

  return {
    apiKey: args.env.TYPESAFE_API_KEY,
    baseUrl: TYPESAFE_BASE_URL,
  };
}

/**
 * A question's instructions may be a sentence or a structured object when
 * definitions, contrasts or examples make the judgment clearer. TypeSafe
 * accepts both; the registry chooses per question.
 */
export type TypesafeInstructions = string | Record<string, unknown> | unknown[];

export type TypesafeNoulQuestion = {
  type: "noul";
  instructions: TypesafeInstructions;
};

export type TypesafeChoiceQuestion = {
  type: "choice";
  instructions: TypesafeInstructions;
  /** Option key → its description, or null when the key says enough. */
  criteria: Record<string, string | null>;
};

export type TypesafeScoreQuestion = {
  type: "score";
  instructions: TypesafeInstructions;
  /** Ordered level descriptions, lowest first; at least two. */
  criteria: string[];
};

export type TypesafeQuestion = TypesafeNoulQuestion | TypesafeChoiceQuestion | TypesafeScoreQuestion;

export type TypesafeNoulAnswer = {
  type: "noul";
  /** Probability of yes, 0 to 1. Carries no separate confidence. */
  noul: number;
};

export type TypesafeChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

export type TypesafeScoreAnswer = {
  type: "score";
  /** Probability-weighted position across the levels; may land between two. */
  score: number;
  /** Level index (as a string) → its description. */
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};

export type TypesafeAnswer = TypesafeNoulAnswer | TypesafeChoiceAnswer | TypesafeScoreAnswer;

export type TypesafeUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type TypesafeAskResult = {
  model: string;
  answers: Record<string, TypesafeAnswer>;
  usage: TypesafeUsage;
};

type TypesafeSystemOnePayload = {
  model?: unknown;
  answers?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
};

type TypesafeModelListPayload = {
  models?: Array<{
    name?: unknown;
    description?: unknown;
    release_date?: unknown;
  }>;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isProbabilityMap(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isFiniteNumber);
}

/**
 * Accept only an answer the caller can act on.
 *
 * A malformed answer is dropped with a named reason rather than passed through
 * as `unknown`, because the Decision engine turns these into actions — an
 * answer with no probability is not "uncertain", it is unusable, and the
 * engine should fall back to its rule rather than act on a shape it cannot read.
 */
const inUnit = (value: number) => value >= 0 && value <= 1;
/** Probabilities that should sum to one, allowing for rounding. */
const sumsToOne = (values: number[]) => Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= 0.02;

/**
 * An answer is checked against the question it answers (review, 2026-09-18):
 * a probability outside 0..1, an option the question never offered, a
 * missing option, a spread that does not sum to one, or a score off the
 * scale is refused, and the engine runs the rule rather than act on it.
 */
export function parseTypesafeAnswer(questionId: string, raw: unknown, question?: TypesafeQuestion): TypesafeAnswer {
  const answer = (raw ?? {}) as Record<string, unknown>;
  const reject = (why: string) =>
    appError("UPSTREAM_FAILURE", `TypeSafe answer for '${questionId}' ${why}.`);
  if (question && answer.type !== question.type) throw reject(`answers a '${String(answer.type)}' question, not the '${question.type}' one asked`);

  if (answer.type === "noul") {
    if (!isFiniteNumber(answer.noul)) throw reject("has no yes/no probability");
    if (!inUnit(answer.noul)) throw reject("has a yes/no probability outside 0 to 1");
    return { type: "noul", noul: answer.noul };
  }

  if (answer.type === "choice") {
    if (typeof answer.choice !== "string") throw reject("names no chosen option");
    if (!isProbabilityMap(answer.probabilities)) throw reject("has no probability per option");
    if (!isFiniteNumber(answer.confidence) || !inUnit(answer.confidence)) throw reject("has no usable confidence");
    const probabilities = answer.probabilities;
    if (!Object.values(probabilities).every(inUnit)) throw reject("has an option probability outside 0 to 1");
    if (!sumsToOne(Object.values(probabilities))) throw reject("has option probabilities that do not sum to one");
    if (question?.type === "choice") {
      const options = Object.keys(question.criteria);
      if (!options.includes(answer.choice)) throw reject(`chose '${answer.choice}', which was not an option`);
      if (options.some((option) => !(option in probabilities))) throw reject("is missing a probability for an option");
      if (Object.keys(probabilities).some((option) => !options.includes(option))) throw reject("has a probability for something that was not an option");
    } else if (!(answer.choice in probabilities)) {
      throw reject("chose an option it gave no probability for");
    }
    return { type: "choice", choice: answer.choice, probabilities, confidence: answer.confidence };
  }

  if (answer.type === "score") {
    if (!isFiniteNumber(answer.score)) throw reject("has no score");
    if (!isProbabilityMap(answer.probabilities)) throw reject("has no probability per level");
    if (!isFiniteNumber(answer.confidence) || !inUnit(answer.confidence)) throw reject("has no usable confidence");
    const legend = answer.legend;
    if (!legend || typeof legend !== "object" || Array.isArray(legend)) throw reject("has no legend");
    const probabilities = answer.probabilities;
    if (!Object.values(probabilities).every(inUnit)) throw reject("has a level probability outside 0 to 1");
    if (!sumsToOne(Object.values(probabilities))) throw reject("has level probabilities that do not sum to one");
    const topLevel = question?.type === "score" ? question.criteria.length - 1 : Object.keys(probabilities).length - 1;
    if (answer.score < 0 || answer.score > topLevel) throw reject("has a score off the scale");
    if (question?.type === "score") {
      const levels = question.criteria.map((_level, index) => String(index));
      if (levels.some((level) => !(level in probabilities))) throw reject("is missing a probability for a level");
    }
    return {
      type: "score",
      score: answer.score,
      legend: Object.fromEntries(
        Object.entries(legend as Record<string, unknown>).map(([level, text]) => [level, String(text)]),
      ),
      probabilities,
      confidence: answer.confidence,
    };
  }

  throw reject(`has an unknown type '${String(answer.type)}'`);
}

export function parseTypesafeSystemOnePayload(
  payload: TypesafeSystemOnePayload,
  questionIds: string[],
  questions?: Record<string, TypesafeQuestion>,
): TypesafeAskResult {
  const rawAnswers = (payload.answers ?? {}) as Record<string, unknown>;
  const answers: Record<string, TypesafeAnswer> = {};
  for (const questionId of questionIds) {
    if (!(questionId in rawAnswers)) {
      throw appError("UPSTREAM_FAILURE", `TypeSafe returned no answer for '${questionId}'.`);
    }
    answers[questionId] = parseTypesafeAnswer(questionId, rawAnswers[questionId], questions?.[questionId]);
  }

  const inputTokens = payload.usage?.input_tokens;
  const outputTokens = payload.usage?.output_tokens;

  return {
    model: typeof payload.model === "string" ? payload.model : TYPESAFE_DEFAULT_MODEL_ID,
    answers,
    usage: {
      inputTokens: isFiniteNumber(inputTokens) ? inputTokens : 0,
      outputTokens: isFiniteNumber(outputTokens) ? outputTokens : 0,
    },
  };
}

/**
 * Ask one or more questions over one piece of state.
 *
 * Every question in the map is answered in the same request and in parallel
 * on TypeSafe's side; questions cannot see each other's answers. That is why
 * the Decision engine asks all of a Decision's questions at once rather than
 * one call per question.
 *
 * Retries: TypeSafe signals "back off" with 429 and 529, both of which the
 * house retry policy treats as retryable; the attempt count stays low because
 * a Decision sits on a live path (a mailbox message, a chat turn) and a long
 * wait is worse than a fallback to the rule.
 */
export async function askTypesafe(args: {
  model: string;
  state: unknown;
  questions: Record<string, TypesafeQuestion>;
  env?: TypesafeProviderEnv;
  fetchImpl?: ProviderFetch;
  maxAttempts?: number;
}): Promise<TypesafeAskResult> {
  const env = args.env ?? { TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY };
  const config = buildTypesafeProviderConfig({ env });
  const fetchImpl = args.fetchImpl ?? fetch;
  const questionIds = Object.keys(args.questions);
  if (questionIds.length === 0) {
    throw appError("INVALID_INPUT", "A TypeSafe request needs at least one question.");
  }

  const payload = await requestProviderJson({
    providerKey: TYPESAFE_PROVIDER_KEY,
    providerName: TYPESAFE_PROVIDER_NAME,
    operation: "systemOne",
    fetchImpl: boundedFetch(fetchImpl),
    url: `${config.baseUrl}/v1/systemone`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: args.state,
        model: args.model,
        questions: args.questions,
      }),
      signal: AbortSignal.timeout(TYPESAFE_TIMEOUT_MS),
    },
    retryPolicy: {
      maxAttempts: args.maxAttempts ?? 3,
    },
  }) as TypesafeSystemOnePayload;

  return parseTypesafeSystemOnePayload(payload, questionIds, args.questions);
}

/**
 * The models this key can see. Free to call, so it is what the Sync button and
 * the hourly connection probe both use — the same proof the other providers
 * give, without spending a token on a question nobody asked.
 */
export async function listTypesafeModels(args: {
  env?: TypesafeProviderEnv;
  fetchImpl?: ProviderFetch;
} = {}) {
  const env = args.env ?? { TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY };
  const config = buildTypesafeProviderConfig({ env });
  const fetchImpl = args.fetchImpl ?? fetch;

  const payload = await requestProviderJson({
    providerKey: TYPESAFE_PROVIDER_KEY,
    providerName: TYPESAFE_PROVIDER_NAME,
    operation: "listModels",
    fetchImpl: boundedFetch(fetchImpl),
    url: `${config.baseUrl}/v1/models`,
    init: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: AbortSignal.timeout(TYPESAFE_TIMEOUT_MS),
    },
    retryPolicy: {
      maxAttempts: 3,
    },
  }) as TypesafeModelListPayload;

  const models: Array<{ id: string; description?: string; releaseDate?: string }> = [];
  for (const model of payload.models ?? []) {
    if (typeof model.name !== "string" || model.name.trim().length === 0) continue;
    models.push({
      id: model.name,
      ...(typeof model.description === "string" ? { description: model.description } : {}),
      ...(typeof model.release_date === "string" ? { releaseDate: model.release_date } : {}),
    });
  }

  return models;
}
