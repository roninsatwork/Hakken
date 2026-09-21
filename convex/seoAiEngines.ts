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
