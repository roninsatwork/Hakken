import { describe, expect, test } from "vitest";
import {
  MIN_EXPLICIT_CACHE_TOKENS,
  MIN_TURNS_BEFORE_EXPLICIT_CACHE,
  estimatePromptTokens,
  fingerprintPromptPrefix,
  getPromptCacheStyle,
  isCachedPrefixStillValid,
  resolvePromptCacheSegments,
  shouldCreateExplicitCache,
} from "./promptCacheService";

describe("provider cache styles", () => {
  test("knows how each wired provider caches", () => {
    expect(getPromptCacheStyle("google")).toBe("EXPLICIT_RESOURCE");
    expect(getPromptCacheStyle("anthropic")).toBe("INLINE_BREAKPOINTS");
    expect(getPromptCacheStyle("openai")).toBe("AUTOMATIC_PREFIX");
  });

  test("a provider nobody has taught it about still keeps prompts stable", () => {
    // The platform takes any model and a gateway provider is coming, so the
    // default has to be safe for something unknown. Automatic-prefix adds
    // nothing to the request, so it cannot break a provider that does not cache;
    // NONE would instead opt a new provider out of a discount it may support.
    expect(getPromptCacheStyle("openrouter")).toBe("AUTOMATIC_PREFIX");
    expect(getPromptCacheStyle(undefined)).toBe("AUTOMATIC_PREFIX");
    expect(getPromptCacheStyle("")).toBe("AUTOMATIC_PREFIX");
  });

  test("only the explicit-resource style builds a cache object", () => {
    const shared = {
      estimatedPrefixTokens: MIN_EXPLICIT_CACHE_TOKENS * 2,
      completedTurns: MIN_TURNS_BEFORE_EXPLICIT_CACHE,
      alreadyCached: false,
    };

    expect(shouldCreateExplicitCache({ ...shared, style: "EXPLICIT_RESOURCE" })).toBe(true);
    // These providers cache without being handed a resource; creating one would
    // be a round trip that buys nothing.
    expect(shouldCreateExplicitCache({ ...shared, style: "AUTOMATIC_PREFIX" })).toBe(false);
    expect(shouldCreateExplicitCache({ ...shared, style: "INLINE_BREAKPOINTS" })).toBe(false);
    expect(shouldCreateExplicitCache({ ...shared, style: "NONE" })).toBe(false);
  });
});

describe("when an explicit cache is worth creating", () => {
  const base = {
    style: "EXPLICIT_RESOURCE" as const,
    estimatedPrefixTokens: MIN_EXPLICIT_CACHE_TOKENS * 2,
    completedTurns: MIN_TURNS_BEFORE_EXPLICIT_CACHE,
    alreadyCached: false,
  };

  test("not for a run that has barely started", () => {
    // Most chat runs answer in one or two turns. Creating a cache writes the
    // whole prefix, so a run that would never read it back must not pay.
    expect(shouldCreateExplicitCache({ ...base, completedTurns: 0 })).toBe(false);
    expect(shouldCreateExplicitCache({ ...base, completedTurns: 1 })).toBe(false);
  });

  test("not for a prefix too small to repay the round trip", () => {
    expect(shouldCreateExplicitCache({
      ...base,
      estimatedPrefixTokens: MIN_EXPLICIT_CACHE_TOKENS - 1,
    })).toBe(false);
  });

  test("not a second time", () => {
    expect(shouldCreateExplicitCache({ ...base, alreadyCached: true })).toBe(false);
  });

  test("yes once a long run has a substantial prefix", () => {
    expect(shouldCreateExplicitCache(base)).toBe(true);
  });
});

describe("splitting a request into stable and volatile parts", () => {
  test("keeps the opening turns and hands back what the loop appended", () => {
    const turns = [
      { role: "user", parts: [{ text: "history" }] },
      { role: "model", parts: [{ text: "earlier reply" }] },
      { role: "user", parts: [{ text: "the objective" }] },
      { role: "model", parts: [{ functionCall: { name: "search" } }] },
      { role: "function", parts: [{ functionResponse: { name: "search" } }] },
    ];

    const segments = resolvePromptCacheSegments({ turns, stableTurnCount: 3 });
    expect(segments.stable).toHaveLength(3);
    expect(segments.volatile).toHaveLength(2);
    expect(segments.stable.at(-1)?.role).toBe("user");
  });

  test("never ends the stable part inside a tool exchange", () => {
    // A tool call is two turns: a model turn carrying the calls and a function
    // turn carrying the results. A prefix ending between them describes a
    // request the model never made, and the provider rejects it.
    const turns = [
      { role: "user", parts: [{ text: "the objective" }] },
      { role: "model", parts: [{ functionCall: { name: "search" } }] },
      { role: "function", parts: [{ functionResponse: { name: "search" } }] },
    ];

    const segments = resolvePromptCacheSegments({ turns, stableTurnCount: 2 });
    expect(segments.stable).toHaveLength(1);
    expect(segments.stable[0]?.role).toBe("user");
    expect(segments.volatile).toHaveLength(2);
  });

  test("copes with a count that overruns the conversation", () => {
    const turns = [{ role: "user", parts: [{ text: "only turn" }] }];
    const segments = resolvePromptCacheSegments({ turns, stableTurnCount: 99 });
    expect(segments.stable).toHaveLength(1);
    expect(segments.volatile).toHaveLength(0);
  });

  test("returns nothing stable when there is no prefix to cache", () => {
    const turns = [{ role: "user", parts: [{ text: "only turn" }] }];
    const segments = resolvePromptCacheSegments({ turns, stableTurnCount: 0 });
    expect(segments.stable).toHaveLength(0);
    expect(segments.volatile).toHaveLength(1);
  });
});

describe("noticing when a cached prefix no longer applies", () => {
  test("accepts an unchanged prefix", () => {
    const fingerprint = fingerprintPromptPrefix("the objective and its knowledge");
    expect(isCachedPrefixStillValid({
      cachedPrefixLength: 3,
      currentTurnCount: 5,
      cachedPrefixFingerprint: fingerprint,
      currentPrefixFingerprint: fingerprint,
    })).toBe(true);
  });

  test("rejects a prefix whose content was rewritten", () => {
    // Trimming a checkpointed transcript drops turns from the front, so the
    // cached prefix describes a different conversation from the one being sent.
    expect(isCachedPrefixStillValid({
      cachedPrefixLength: 3,
      currentTurnCount: 5,
      cachedPrefixFingerprint: fingerprintPromptPrefix("original opening"),
      currentPrefixFingerprint: fingerprintPromptPrefix("trimmed opening"),
    })).toBe(false);
  });

  test("rejects a prefix longer than the conversation it should sit inside", () => {
    const fingerprint = fingerprintPromptPrefix("same");
    expect(isCachedPrefixStillValid({
      cachedPrefixLength: 9,
      currentTurnCount: 4,
      cachedPrefixFingerprint: fingerprint,
      currentPrefixFingerprint: fingerprint,
    })).toBe(false);
  });

  test("fingerprints differ when order changes, not just content", () => {
    expect(fingerprintPromptPrefix("ab")).not.toBe(fingerprintPromptPrefix("ba"));
  });
});

describe("prefix size estimation", () => {
  test("scales with length and never reports zero for real text", () => {
    expect(estimatePromptTokens("")).toBe(0);
    expect(estimatePromptTokens("a")).toBe(1);
    expect(estimatePromptTokens("x".repeat(4000))).toBe(1000);
  });
});
