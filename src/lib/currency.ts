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
