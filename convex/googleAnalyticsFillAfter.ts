import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { countriesKeptReady } from "./searchConsoleCountries";
import { isTrackedHold } from "./utils/websitePairing";
import { coverageOf, filledLists } from "./googleAnalyticsCoverage";
import { DAY_FACT_LISTS } from "./googleAnalyticsSchema";

/**
 * Two years filled by themselves once a collection is in (ga-stored-figures-plan.md
 * SF9; Anthony, 2026-10-14: "both"): a new website's, and each new home
 * country's, every day list and each page — and a fill that stopped short,
 * at the next collection. Each list's days already held are not asked again.
 */
export async function fillAfterCollection(ctx: MutationCtx, connection: Doc<"googleAnalyticsConnections">) {
  const hold = await ctx.db.get(connection.companyWebsiteId);
  const others = hold && !isTrackedHold(hold) ? await countriesKeptReady(ctx, hold) : [];
  for (const country of ["", ...others]) {
    const coverage = coverageOf(connection, country);
    if (!coverage.newestDay) continue;
    const of = country ? { country } : {};
    const filled = filledLists(coverage);
    const lists = DAY_FACT_LISTS.filter((list) => list !== "product" || connection.shop === true).filter((list) => !filled.includes(list));
    if (lists.length > 0) await ctx.scheduler.runAfter(0, internal.googleAnalyticsHistory.fillHistory, { connectionId: connection._id, lists, ...of });
    if (!coverage.pageHistoryFrom) await ctx.scheduler.runAfter(0, internal.googleAnalyticsPageSeries.fillPageHistory, { connectionId: connection._id, ...of });
  }
}
