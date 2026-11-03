/**
 * Suggested credit prices keep a margin (page-screen-redo-plan-2026-11-03.md,
 * step 7). Pure, and shared: Admin → Settings → Credit prices works the
 * suggestions out as a person types, and `creditPricesAdmin.ts` with the
 * saved settings.
 */

/**
 * The share of every credit sold that we keep, in percent (Anthony,
 * 2026-11-03, page-screen-redo-plan-2026-11-03.md step 7: "a usual SaaS
 * margin"). At 80 we keep 80p of every £1. Admin → Settings → Credit prices
 * suggests prices with it; it never changes a price by itself.
 */
export const DEFAULT_MARGIN_PERCENT = 80;
/** The most a margin may be set to. Near 100 a suggestion runs away, and at 100 it divides by nothing. */
export const MAX_MARGIN_PERCENT = 95;

/**
 * The price a kind of work would need (page-screen-redo-plan-2026-11-03.md,
 * step 7): what one unit cost us, raised so the margin is kept, in credits of
 * what a credit covers, for every `per` units. Rounded up to a whole credit,
 * never below one, and null with no cost to go on.
 */
export function suggestedCredits(costPerUnitUsd: number | null, per: number, creditCoversUsd: number, marginPercent: number): number | null {
  if (costPerUnitUsd === null || !Number.isFinite(costPerUnitUsd) || !(creditCoversUsd > 0)) return null;
  const kept = Math.min(Math.max(marginPercent, 0), MAX_MARGIN_PERCENT) / 100;
  const priceUsd = costPerUnitUsd / (1 - kept);
  return Math.max(1, Math.ceil((priceUsd * per) / creditCoversUsd - 1e-9));
}
