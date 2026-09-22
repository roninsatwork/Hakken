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
 * right for a headline and wrong for a per-message cost of £0.00042, so the
 * screens needing the small end were hand-rolling `Intl`.
 *
 * A caution for anyone extending this file: not every cost on the platform is
 * sterling, and that is deliberate.
 *
 * What the platform spends on AI is billed by the providers in US dollars and
 * stored without conversion, and Anthony settled on 2026-08-26 that it reports
 * in dollars throughout. The screens printing a dollar sign are correct — even
 * though the columns holding those values are named `costGBP`, `totalCostGBP`
 * and `maxCostGBP`. The names are the inaccuracy, not the symbol, and renaming
 * stored columns for a question that is now settled was judged not worth it.
 *
 * So: never change a currency symbol on the strength of a field name. Check
 * what billed the number. That mistake has been made here once already.
 *
 * **It had been made four more times, found 2026-09-22.** Four screens were
 * calling the sterling helpers on provider spend, so a pound sign sat over a
 * dollar figure on the Decisions detail, agent observability, agent memory and
 * — the one that matters most — a customer's own settings page. The cause was
 * the same each time: this file offered nothing else to call. It does now, at
 * the end, and the dollar-named columns are being renamed to match.
 *
 * The helpers immediately below are for the other kind — what a customer
 * earns. Sales and opportunity figures come from the customer's own
 * spreadsheet import and are genuinely sterling, as are Hakken's own plan
 * prices. Both kinds live on this platform at once.
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

/**
 * What the platform spends, which is dollars.
 *
 * Providers bill in US dollars, DataForSEO bills in US dollars, and nothing
 * converts anywhere. These exist so a screen showing spend has something
 * correct to reach for: before them the only shared helpers were sterling, and
 * four screens reached for those.
 *
 * Formatted in `en-GB` like their sterling twins, because the reader is the
 * same person and only the currency differs.
 */
export function formatCurrencyUsd(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Dollars at a stated precision, for a per-message cost of $0.00042. */
export function formatPreciseUsd(value: number, fractionDigits = 5): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Dollars to at most `maxFractionDigits`, trailing zeros dropped. */
export function formatUpToUsd(value: number, maxFractionDigits = 4): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}
