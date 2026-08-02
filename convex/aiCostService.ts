/**
 * What a model call cost.
 *
 * This was a private helper inside `agentRuntime.ts` that charged every input
 * token at the standard rate. The model catalogue has carried
 * `cachedInputCostBelow200k` and `cachedInputCostAbove200k` for some time, and
 * the admin model page collects both — but nothing read them, so cached tokens
 * were billed internally as though they had been sent in full. Now that the
 * runtime actually caches prompts, that gap would have grown into a materially
 * wrong spend figure, and spend is what the run budget is enforced against.
 */

/** The rate fields this needs, structurally — not the whole model record. */
export type ModelCostRates = {
  standardInputCostBelow200k?: number;
  standardInputCostAbove200k?: number;
  cachedInputCostBelow200k?: number;
  cachedInputCostAbove200k?: number;
  outputResponseCost?: number;
};

/** Rates are quoted per million tokens. */
const TOKENS_PER_RATE_UNIT = 1_000_000;

/** The tier boundary the catalogue prices against. */
const LARGE_CONTEXT_TOKEN_THRESHOLD = 200_000;

export function calculateModelCostGBP(args: {
  inputTokens: number;
  outputTokens: number;
  /**
   * The portion of `inputTokens` the provider served from cache. Providers
   * report this as part of the total rather than in addition to it, so it is
   * subtracted rather than added.
   */
  cachedInputTokens?: number;
  rates?: ModelCostRates | null;
}) {
  const rates = args.rates;
  if (!rates) return 0;

  const isLargeContext = args.inputTokens > LARGE_CONTEXT_TOKEN_THRESHOLD;
  // The above-200k rate falls back to the standard one when it is missing or
  // zero, for the same reason the cached rate does below.
  //
  // Provider sync leaves it at zero for models it has no tiered price for, and
  // "zero" was then read as free rather than as unknown: every input token past
  // two hundred thousand cost nothing. That was invisible while runs stopped at
  // a two hundred thousand token budget — no run ever reached the tier. Raising
  // the budget to ten million makes it the normal case, and it would have
  // hollowed out the spend ceiling exactly where that ceiling is the only thing
  // left holding a long run.
  const configuredStandardRate = isLargeContext
    ? rates.standardInputCostAbove200k
    : rates.standardInputCostBelow200k;
  const standardRate = (typeof configuredStandardRate === "number" && configuredStandardRate > 0
    ? configuredStandardRate
    : rates.standardInputCostBelow200k) || 0;

  // An unset cached rate falls back to the standard rate rather than to zero.
  // Over-stating spend slightly is safe; under-stating it would let a run pass a
  // cost ceiling it had actually exceeded.
  const configuredCachedRate = isLargeContext
    ? rates.cachedInputCostAbove200k
    : rates.cachedInputCostBelow200k;
  const cachedRate = typeof configuredCachedRate === "number" && configuredCachedRate > 0
    ? configuredCachedRate
    : standardRate;

  const cachedInputTokens = Math.min(
    Math.max(args.cachedInputTokens ?? 0, 0),
    Math.max(args.inputTokens, 0),
  );
  const uncachedInputTokens = Math.max(args.inputTokens - cachedInputTokens, 0);
  const outputRate = rates.outputResponseCost || 0;

  return (
    (uncachedInputTokens / TOKENS_PER_RATE_UNIT) * standardRate
    + (cachedInputTokens / TOKENS_PER_RATE_UNIT) * cachedRate
    + (Math.max(args.outputTokens, 0) / TOKENS_PER_RATE_UNIT) * outputRate
  );
}
