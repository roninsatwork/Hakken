/**
 * Money as every cost screen in admin writes it. Moved out of the old
 * `CostFigure.tsx` when its number box became the kit's `Figure` (2026-10-03
 * clean-up); the two writers stayed, shared by the company's Collection runs,
 * Data collection and fan-out screens and by Admin → Websites' cost screens.
 */

/** Dollars to the cent, as every cost screen in admin shows them. */
export function dollars(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Dollars too small for cents alone — $0.003 a Google check, $0.067 a press
 * of Generate — written the way `dollars` writes them, with no "US" in front
 * (a prompt's fan-out queries, prompt-fan-out-queries-plan.md).
 */
export function smallDollars(value: number): string {
  if (value === 0) return "$0";
  const digits = value < 0.01 ? 4 : value < 1 ? 3 : 2;
  return `$${Number(value.toFixed(digits))}`;
}
