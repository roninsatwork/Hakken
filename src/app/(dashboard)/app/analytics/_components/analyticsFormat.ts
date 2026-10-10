/**
 * How the Google Analytics screens write their figures
 * (docs/plans/active/google-analytics-plan.md §5): money in the property's
 * own currency (§10, Q8), kept in hundredths; rates as percentages; time
 * engaged as minutes and seconds. Numbers in JetBrains Mono, as every table's.
 */

/** Money kept in hundredths, in the property's currency, whole pounds unless under ten. */
export function formatMoney(hundredths: number | null | undefined, currency: string | null | undefined): string {
  if (hundredths === null || hundredths === undefined) return "–";
  const value = hundredths / 100;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      maximumFractionDigits: Math.abs(value) < 10 && value % 1 !== 0 ? 2 : 0,
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    return value.toLocaleString("en-GB", { maximumFractionDigits: 0 });
  }
}

/** The currency's sign alone, for "Value (£)". */
export function currencySign(currency: string | null | undefined): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP" }).formatToParts(0).find((part) => part.type === "currency")?.value ?? "£";
  } catch {
    return currency ?? "£";
  }
}

/** A share, 0–1, as a percentage with one decimal. */
export function formatPercent(share: number | null | undefined): string {
  if (share === null || share === undefined || Number.isNaN(share)) return "–";
  return `${(share * 100).toFixed(1)}%`;
}

/** Seconds engaged a visit as "1m 05s". */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "–";
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return minutes > 0 ? `${minutes}m ${String(whole % 60).padStart(2, "0")}s` : `${whole}s`;
}

/** A page address as its screens show it: the path, the website's own host left off. */
export function pathOf(address: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/.*)?$/i.exec(address);
  return match ? match[1] || "/" : address;
}

/** A change as a fraction, when there is a span before to compare with. */
export function changeOf(now: number, before: number | null | undefined): number | null {
  if (before === null || before === undefined || before === 0) return null;
  return (now - before) / before;
}
