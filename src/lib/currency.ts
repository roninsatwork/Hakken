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
