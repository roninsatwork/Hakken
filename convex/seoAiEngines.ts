import { v } from "convex/values";

import { DEFAULT_LOCATION_CODE, findSeoLocation } from "./utils/seoLocations";

/**
 * The AI engines whose answers we watch for citations.
 *
 * Named in one file so the platform names appear once rather than scattered
 * through a schema, a screen and a registry. That matters here more than usual:
 * the provider-classification guard treats these names as stale platform
 * language wherever it finds them, and the one place it should not is the file
 * whose subject they are.
 *
 * The ids are DataForSEO's own, because they are path segments in
 * `/v3/ai_optimization/{platform}/...` and inventing our own spelling would
 * mean a translation table that can only ever go wrong.
 */
export const AI_ENGINES = ["chatgpt", "perplexity", "gemini", "claude"] as const;

export type AiEngine = (typeof AI_ENGINES)[number];

/**
 * Built from the list rather than written out again, so adding an engine is one
 * edit and the schema cannot fall behind the code that writes to it.
 */
export const aiEngineValidator = v.union(
  v.literal("chatgpt"),
  v.literal("perplexity"),
  v.literal("gemini"),
  v.literal("claude"),
);

export function isAiEngine(value: string): value is AiEngine {
  return (AI_ENGINES as readonly string[]).includes(value);
}

/** The engines a prompt is asked of when nobody has chosen. All of them. */
export const DEFAULT_AI_ENGINES: readonly AiEngine[] = AI_ENGINES;

/**
 * How each engine is actually asked, read from DataForSEO's docs on 2026-09-22.
 *
 * **Every engine is asked live, and the reason is cost.** Queued is a flat
 * penny a question. Live is six hundredths of a cent plus the engine's own
 * token price, and for the cheap models named below that comes to about a
 * quarter of a penny — four times cheaper. The plan assumed the opposite until
 * the price list was read on 2026-09-22; Anthony, the same day: "cost is a
 * driver here for us." Live also removes the pingback from this path. The
 * price is a worker waiting up to two minutes per answer, which at these
 * volumes is nothing.
 *
 * Gemini and Perplexity could never queue anyway: every model on their pages
 * is published with `task_post_supported: false`. Two engines take a country
 * and a city for their web search; Gemini takes no location at all, so a
 * client's chosen place reaches ChatGPT and Claude and is silently not sent to
 * Gemini rather than refused.
 *
 * The model names are DataForSEO parameter values, not our runtime model
 * choices, and each is the cheapest one on their list that supports web search
 * — without web search there are no citations to read. Gemini's flash-lite is
 * cheaper and explicitly lacks it, which is why flash is named instead.
 *
 * `web_search` is on for every engine that has the switch. It is the whole
 * point: an answer with no sources is an answer with nothing to cite.
 */
export const AI_ENGINE_CALLS: Record<AiEngine, {
  /** DataForSEO's path segment, verbatim. */
  platform: string;
  mode: "QUEUED" | "LIVE";
  modelName: string;
  /** Whether `web_search_country_iso_code` and `web_search_city` are accepted. */
  takesLocation: boolean;
  /** Whether the `web_search` switch exists. Perplexity searches regardless. */
  hasWebSearchSwitch: boolean;
}> = {
  chatgpt: {
    platform: "chat_gpt",
    mode: "LIVE",
    modelName: "gpt-4o-mini",
    takesLocation: true,
    hasWebSearchSwitch: true,
  },
  claude: {
    platform: "claude",
    mode: "LIVE",
    // The dated name rather than the `-latest` alias. Their docs mark both as
    // queueable, but the sandbox refused the alias with "this model does not
    // support task_post mode" on 2026-09-22, and a dated name is what they
    // resolve an alias to anyway.
    modelName: "claude-3-5-haiku-20241022",
    takesLocation: true,
    hasWebSearchSwitch: true,
  },
  gemini: {
    platform: "gemini",
    mode: "LIVE",
    modelName: "gemini-2.0-flash",
    takesLocation: false,
    hasWebSearchSwitch: true,
  },
  perplexity: {
    platform: "perplexity",
    mode: "LIVE",
    modelName: "sonar",
    takesLocation: false,
    hasWebSearchSwitch: false,
  },
};

/**
 * The place an engine's answer is filed under, for a watcher in `locationCode`.
 *
 * An engine that takes no location answers the same wherever it is asked
 * from, so its answer is filed — and must be read — under the default place,
 * whoever asked. Reading a Leeds watcher's Perplexity answers under Leeds found
 * nothing, because nothing was ever filed there: one rule, used by every
 * writer and reader of answers, is what keeps the two from disagreeing again.
 */
export function answerPlace(engine: AiEngine, locationCode: number | undefined): number {
  return AI_ENGINE_CALLS[engine].takesLocation ? locationCode ?? DEFAULT_LOCATION_CODE : DEFAULT_LOCATION_CODE;
}

/**
 * The same, as the `place` string fan-out rows are keyed on: what was sent.
 *
 * Undefined when nothing was sent — an engine that takes no location, or a
 * watcher who never chose one, in which case the engine was asked with no
 * place at all. A chosen "United Kingdom" sends the country, so it is "GB".
 */
export function fanOutPlace(engine: AiEngine, locationCode: number | undefined): string | undefined {
  if (!AI_ENGINE_CALLS[engine].takesLocation || locationCode === undefined) return undefined;
  const place = findSeoLocation(locationCode);
  if (!place) return undefined;
  return place.city ? `${place.countryIso}/${place.city}` : place.countryIso;
}

/** The registry operation id that asks one engine. One per engine. */
export function aiCitationOperationId(engine: AiEngine): string {
  return `ai_citation_${engine}`;
}

/** The engine an operation id asks, or null if it is not one of these. */
export function engineForOperationId(operationId: string): AiEngine | null {
  const prefix = "ai_citation_";
  if (!operationId.startsWith(prefix)) return null;
  const engine = operationId.slice(prefix.length);
  return isAiEngine(engine) ? engine : null;
}
