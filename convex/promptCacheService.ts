/**
 * Prompt caching policy, written to outlive any one provider.
 *
 * The agent loop re-sends the same system instruction, the same tool
 * declarations and the same retrieved knowledge on every turn of every run.
 * That is the largest recurring, avoidable line item on a platform like this,
 * and none of it was being cached.
 *
 * Providers do not agree on how caching works:
 *
 * - **Explicit resource** (Google Vertex): the prefix is uploaded once as a
 *   cache object with a lifetime, and later requests reference it by name. Costs
 *   a round trip to create and storage while it lives, so it only pays off when
 *   the prefix is large and gets reused several times.
 * - **Inline breakpoints** (Anthropic): the request carries markers saying "this
 *   much is cacheable". No object, no lifecycle, but the markers have to be
 *   placed correctly and there are only a few of them per request.
 * - **Automatic prefix** (OpenAI, and most gateways passing through to it): the
 *   provider matches the leading portion of the request against recent ones on
 *   its own. There is no API at all.
 *
 * The one requirement common to all three — and to any provider added later,
 * including an OpenRouter-style gateway — is that the unchanging part of the
 * prompt comes **first** and stays byte-identical between calls. That is the
 * universal mechanism, it costs nothing, and it is what
 * `resolvePromptCacheSegments` exists to protect.
 *
 * Everything here is pure. Which requests get made, and the cache objects
 * themselves, belong to the provider adapters.
 */

export type PromptCacheStyle =
  /** A cache object is created, referenced by name, and deleted. */
  | "EXPLICIT_RESOURCE"
  /** Markers inside the request say how much of it is cacheable. */
  | "INLINE_BREAKPOINTS"
  /** The provider matches leading content itself; nothing to send. */
  | "AUTOMATIC_PREFIX"
  /** Caching is known not to apply. */
  | "NONE";

/**
 * How a provider caches.
 *
 * Keyed by the same provider keys the model catalogue uses. Deliberately not
 * exhaustive: see `getPromptCacheStyle` for what an unrecognised provider gets.
 */
const PROMPT_CACHE_STYLES: Record<string, PromptCacheStyle> = {
  google: "EXPLICIT_RESOURCE",
  anthropic: "INLINE_BREAKPOINTS",
  openai: "AUTOMATIC_PREFIX",
};

/**
 * The caching style for a provider.
 *
 * An unknown provider gets `AUTOMATIC_PREFIX`, not `NONE`. That is the
 * conservative answer rather than the optimistic one: automatic-prefix handling
 * adds nothing to the request and changes no behaviour, so it is safe against a
 * provider that turns out not to cache at all — the platform simply keeps its
 * prompts stable and gains nothing. Returning `NONE` would instead mean a newly
 * added provider silently opts out of a discount it may well support.
 */
export function getPromptCacheStyle(providerKey: string | undefined | null): PromptCacheStyle {
  if (!providerKey) return "AUTOMATIC_PREFIX";
  return PROMPT_CACHE_STYLES[providerKey] ?? "AUTOMATIC_PREFIX";
}

/**
 * Rough token count for a piece of prompt text.
 *
 * Four characters per token is the usual English approximation and is close
 * enough for the only decision it informs: whether a prefix is big enough to be
 * worth an explicit cache. It is never used for billing — actual usage comes
 * back from the provider, and that is what gets recorded.
 */
export function estimatePromptTokens(text: string) {
  return Math.ceil(text.length / 4);
}

/**
 * Smallest prefix worth creating an explicit cache object for.
 *
 * Providers impose their own minimums and they differ by model, so this is a
 * platform floor rather than a mirror of any one provider's rule: below this,
 * the round trip to create the cache and the storage it occupies are not repaid
 * by the discount. A provider rejecting a too-small cache is handled anyway —
 * every explicit-cache path fails open.
 */
export const MIN_EXPLICIT_CACHE_TOKENS = 4096;

/**
 * How many turns a run must already have completed before an explicit cache is
 * created.
 *
 * Creating one costs a write of the whole prefix, so it has to be read back
 * more than once to be worth it. Most chat runs answer in one or two turns and
 * must never pay for a cache they would not reuse; by the third turn the run has
 * demonstrated it is the long kind, which is exactly the kind P3.1's raised step
 * limits made possible.
 */
export const MIN_TURNS_BEFORE_EXPLICIT_CACHE = 2;

/** Lifetime of an explicit cache object. */
export const EXPLICIT_CACHE_TTL_SECONDS = 15 * 60;

export function shouldCreateExplicitCache(args: {
  style: PromptCacheStyle;
  estimatedPrefixTokens: number;
  completedTurns: number;
  alreadyCached: boolean;
  minTokens?: number;
  minTurns?: number;
}) {
  if (args.style !== "EXPLICIT_RESOURCE") return false;
  if (args.alreadyCached) return false;
  if (args.completedTurns < (args.minTurns ?? MIN_TURNS_BEFORE_EXPLICIT_CACHE)) return false;
  return args.estimatedPrefixTokens >= (args.minTokens ?? MIN_EXPLICIT_CACHE_TOKENS);
}

type PromptTurn = { role?: string };

/**
 * Split a request into the part that must stay identical between calls and the
 * part that changes.
 *
 * The stable prefix is everything up to and including the turn that states the
 * objective — the system instruction, the tool declarations, the conversation
 * history, the retrieved knowledge. The volatile suffix is what the loop appends
 * as it works: the model's tool requests and their results.
 *
 * Splitting at a tool interaction would be wrong. A tool call is two turns, a
 * `model` turn carrying the calls and a `function` turn carrying the results,
 * and a prefix ending between them describes a request the model never made. So
 * the boundary is pulled back to the last turn that is neither.
 */
export function resolvePromptCacheSegments<T extends PromptTurn>(args: {
  turns: T[];
  /** How many leading turns were present before the loop began appending. */
  stableTurnCount: number;
}) {
  const bounded = Math.max(0, Math.min(args.stableTurnCount, args.turns.length));
  let boundary = bounded;

  // Never end the prefix on a tool exchange, in either half of it.
  while (boundary > 0) {
    const last = args.turns[boundary - 1];
    if (last?.role === "function" || last?.role === "model") {
      boundary -= 1;
      continue;
    }
    break;
  }

  return {
    stable: args.turns.slice(0, boundary),
    volatile: args.turns.slice(boundary),
  };
}

/**
 * Whether the leading turns of a request still match what was cached.
 *
 * A cache is only a saving while the prefix it was built from is unchanged. If
 * anything earlier in the conversation is rewritten — trimming a checkpointed
 * transcript is the case that actually arises — the cached prefix no longer
 * describes this request and referencing it would send the model the wrong
 * conversation.
 */
export function isCachedPrefixStillValid(args: {
  cachedPrefixLength: number;
  currentTurnCount: number;
  cachedPrefixFingerprint: string;
  currentPrefixFingerprint: string;
}) {
  if (args.cachedPrefixLength > args.currentTurnCount) return false;
  return args.cachedPrefixFingerprint === args.currentPrefixFingerprint;
}

/**
 * A cheap, order-sensitive fingerprint of a prompt prefix.
 *
 * Compared only against another fingerprint produced the same way, to answer
 * "is this the same prefix I cached?". It is not a security control and makes
 * no collision guarantees; it exists so the check does not require holding a
 * second copy of the whole transcript.
 */
export function fingerprintPromptPrefix(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return `${value.length}:${(hash >>> 0).toString(36)}`;
}
