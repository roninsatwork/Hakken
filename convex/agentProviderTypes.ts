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
  /**
   * How hard the model should think before answering.
   *
   * The agent has carried this setting since it was first built, and the screen
   * has always offered Low, Medium and High with a note about depth, latency
   * and cost — but nothing read it. Every agent ran at whatever the model does
   * by default, whichever button was lit.
   *
   * Each provider expresses it differently, so it crosses this seam as the
   * agent's own three levels and each adapter translates.
   */
  reasoningEffort?: AgentReasoningEffort;
  /**
   * Whether the model may search the web while answering.
   *
   * Also long-standing and, until now, only honoured when an agent ran as a
   * step inside a workflow. Pressing Launch Run on the agent itself ignored it,
   * so the same agent searched in one place and not the other with nothing on
   * screen saying so.
   */
  webSearch?: boolean;
  /**
   * A fixed shape the answer must come back in.
   *
   * Set on the agent as its output schema, and — like web access — only ever
   * honoured when the agent ran as a workflow node. A direct run ignored it, so
   * the screen's warning that the agent "will exclusively reply in raw JSON"
   * was untrue everywhere the reader could actually press Launch Run.
   *
   * Standard JSON Schema. Two of the three providers can enforce it; the third
   * is told the shape in its instruction, which its adapter does rather than
   * the loop, because that is where provider differences belong.
   */
  responseJsonSchema?: Record<string, unknown>;
};

export type AgentReasoningEffort = "LOW" | "MEDIUM" | "HIGH";

export type AgentTurnToolCall = {
  name: string;
  args: Record<string, unknown>;
  /**
   * An opaque token some models attach to a call and require back verbatim when
   * the conversation continues. A model that issues one rejects the turn that
   * answers the call without it. Optional: only one provider issues them today,
   * and naming it here is exactly the provider-specific knowledge this layer
   * exists to keep out.
   */
  thoughtSignature?: string;
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
