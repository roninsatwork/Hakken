/**
 * What the objective loop needs from a model provider.
 *
 * The loop was written against Google's SDK types and called
 * `getGoogleVertexProviderModelId`, which throws for anything else — so
 * "Sonae supports any model" was true of the catalogue and the chat assistant,
 * but not of the agent runtime, where only Vertex could actually run.
 *
 * This is the seam. It is deliberately narrow: one call that streams a turn and
 * reports what came back. Everything provider-shaped — how a tool request is
 * represented, how a stream is framed, how caching is expressed — lives behind
 * it, because those are exactly the things the two providers disagree about.
 *
 * The transcript stays in the shape the runtime already stores (and
 * checkpoints), and each adapter translates on the way out. Rewriting the
 * stored shape would invalidate every in-flight checkpoint on deploy.
 */

import type { RuntimeTurn } from "./anthropicMessageService";

export type { RuntimeTurn };

/** A tool offered to the model, in the runtime's neutral shape. */
export type AgentToolDeclaration = {
  name: string;
  description: string;
  parametersJsonSchema?: Record<string, unknown>;
};

export type AgentTurnRequest = {
  /** Resolved from the catalogue: which provider, and its own id for the model. */
  model: { modelId: string; providerKey: string; providerModelId: string };
  systemInstruction: string;
  turns: RuntimeTurn[];
  tools: AgentToolDeclaration[];
  temperature: number;
  /**
   * A provider-side cache to read from, where the provider works that way.
   *
   * Only the explicit-resource style uses this (see `promptCacheService`).
   * Providers that cache by inline breakpoints or automatically ignore it, and
   * their adapters mark the prefix themselves.
   */
  cacheName?: string;
  /** How many leading turns the cache covers, when one is in use. */
  cachedPrefixTurns?: number;
};

export type AgentTurnToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type AgentTurnResponse = {
  text: string;
  toolCalls: AgentTurnToolCall[];
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  /**
   * Why the model stopped, normalised across providers.
   *
   * `REFUSED` is the one the loop must not treat as a completed answer — it
   * carries no reply, and posting it as one shows the reader an empty message
   * where an answer should be.
   */
  outcome: "COMPLETE" | "RUN_TOOLS" | "TRUNCATED" | "REFUSED" | "CONTINUE";
};

export type AgentStreamOptions = {
  /** Called with each text fragment as it arrives. Awaited — see the adapters. */
  onText?: (fragment: string) => Promise<void> | void;
  /** Labels the call in provider retry logs. */
  operation?: string;
};

export type PromptCacheRequest = {
  model: { modelId: string; providerKey: string; providerModelId: string };
  systemInstruction: string;
  tools: AgentToolDeclaration[];
  /** The leading turns the cache should cover. */
  turns: RuntimeTurn[];
  ttlSeconds: number;
  label: string;
};

export interface AgentProviderAdapter {
  providerKey: string;
  streamTurn(request: AgentTurnRequest, options: AgentStreamOptions): Promise<AgentTurnResponse>;

  /**
   * Upload the stable prefix as a reusable cache object, where the provider
   * works that way.
   *
   * Optional because it only applies to the explicit-resource style. A provider
   * that caches by inline breakpoints or automatically has nothing to create —
   * its adapter omits this, and the loop simply never has a cache name to pass
   * back. Returning `undefined` (rather than throwing) on failure keeps the
   * rule that a caching optimisation can never be the reason a run fails.
   */
  createPromptCache?(request: PromptCacheRequest): Promise<string | undefined>;

  /** Release a cache created by `createPromptCache`. Never throws. */
  releasePromptCache?(name: string): Promise<void>;
}
