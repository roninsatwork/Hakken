import { v } from "convex/values";

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
 * Not one shape. ChatGPT and Claude queue a task and answer later; Gemini and
 * Perplexity only answer live, so their operations are live and the result
 * arrives in the same reply. Gemini's models page lists every model with
 * `task_post_supported: false`, confirmed 2026-09-22 after the sandbox refused
 * a queued request. Two engines take a country and a city for their web
 * search; Gemini takes no location at all, so a client's chosen place reaches
 * ChatGPT and Claude and is silently not sent to Gemini rather than refused.
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
    mode: "QUEUED",
    modelName: "gpt-4o-mini",
    takesLocation: true,
    hasWebSearchSwitch: true,
  },
  claude: {
    platform: "claude",
    mode: "QUEUED",
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
