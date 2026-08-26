/**
 * Money as the dashboards print it: GBP, compact notation, at most two
 * decimals — £1.2M, £45k, £300. One definition so a KPI card and a chart axis
 * cannot disagree about what a number of pounds looks like.
 */
export function formatCurrencyGBP(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Sterling at a stated precision, uncompacted.
 *
 * `formatCurrencyGBP` compacts (£1.2k) and stops at two decimals, which is
 * right for a headline and wrong for a per-message cost of £0.00042. Screens
 * needing the small end were hand-rolling `Intl` — and one of them prefixed a
 * dollar sign to a sterling figure sitting beside a pound icon, which is what
 * hand-rolled currency gets you eventually.
 */
export function formatPreciseGBP(value: number, fractionDigits = 5): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * Exact pounds, never compacted, with the pence dropped when there are none.
 *
 * The opportunity report's figures have to match the working a reader can do
 * on paper, so £1,200 stays £1,200 and £1,200.50 keeps its pence.
 */
export function formatExactGBP(value: number): string {
  return value.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Pounds with at least two decimals, for money read as money.
 */
export function formatMoneyGBP(value: number): string {
  return value.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  });
}

/**
 * Pounds to at most `maxFractionDigits`, trailing zeros dropped.
 *
 * For costs that are usually fractions of a penny but occasionally are not:
 * £0.0042 and £3 both read correctly.
 */
export function formatUpToGBP(value: number, maxFractionDigits = 4): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}
