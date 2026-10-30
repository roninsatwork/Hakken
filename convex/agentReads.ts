import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { readConversionsMap, conversionColumnsValidator } from "./googleAnalyticsConversionsMap";
import type { AnalyticsPeriod } from "./googleAnalyticsSchema";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { NO_PAGE_KIND, OTHER_KIND } from "./utils/sees/analyticsChannel";

/**
 * Reads an Insights agent makes that Ask Hakken's reads don't cover (stronger-agents-plan-2026-10-30.md A1): the
 * Conversions screen's map, through the very function the map reads (`readConversionsMap`), so what an agent reads
 * is what the map shows. Every rate is worked out here, in code, never by a model: each conversion's share of a
 * column's visits — the map's "Conversion rate" — and the visits it took for one, as the page's chart counts them.
 * The company is the run's; `readConversionsMap` refuses a website the company doesn't hold.
 */

/** A share as a percentage to one place; null with nothing to divide by. */
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
/** Visits for one, to one place; null with none done. */
const forOne = (visits: number, did: number) => (did > 0 ? Math.round((visits / did) * 10) / 10 : null);

/** A column's name as the map heads it: its own, or what the special kinds stand for. */
function columnName(key: string, name: string | null): string {
  if (name) return name;
  if (key === NO_PAGE_KIND) return "no page recorded";
  if (key === OTHER_KIND) return "other kinds of page";
  if (key === NOT_SORTED_KIND) return "unclassified";
  return key;
}

export const conversionsByInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    siteId: v.id("companyWebsites"),
    period: v.string(),
    device: v.string(),
    country: v.optional(v.string()),
    columns: conversionColumnsValidator,
  },
  handler: async (ctx, args) => {
    const map = await readConversionsMap({ db: ctx.db, companyId: args.companyId }, {
      siteId: args.siteId, period: args.period as AnalyticsPeriod, device: args.device, columns: args.columns, ...(args.country ? { country: args.country } : {}),
    });
    if (map.collecting) return { ok: false, problem: "The map holds nothing for these dates yet." };
    const columns = map.columns.map((column) => ({ ...column, name: columnName(column.key, column.name) }));
    const siteVisits = columns.reduce((sum, column) => sum + column.visits, 0);
    const siteVisitsBefore = map.hasBefore ? columns.reduce((sum, column) => sum + (column.visitsBefore ?? 0), 0) : null;
    return {
      ok: true,
      by: args.columns,
      visits: columns.map((column) => ({ column: column.name, visits: column.visits, ...(column.visitsBefore !== null ? { visitsBefore: column.visitsBefore } : {}) })),
      // Each conversion the website counts: the visits that did it, the visits it took for one, and each column's rate.
      conversions: map.rows.filter((row) => row.counted).map((row) => {
        const did = row.cells.reduce((sum, cell) => sum + cell.visits, 0);
        const didBefore = map.hasBefore ? row.cells.reduce((sum, cell) => sum + (cell.visitsBefore ?? 0), 0) : null;
        return {
          event: row.eventName,
          visitsThatDidIt: did,
          ...(didBefore !== null ? { visitsThatDidItBefore: didBefore } : {}),
          visitsForOne: forOne(siteVisits, did),
          ...(siteVisitsBefore !== null && didBefore !== null ? { visitsForOneBefore: forOne(siteVisitsBefore, didBefore) } : {}),
          by: columns.map((column, at) => ({
            column: column.name,
            visitsThatDidIt: row.cells[at].visits,
            ratePercent: percent(row.cells[at].visits, column.visits),
            ...(map.hasBefore && column.visitsBefore !== null && row.cells[at].visitsBefore !== null ? { ratePercentBefore: percent(row.cells[at].visitsBefore!, column.visitsBefore) } : {}),
          })),
        };
      }),
    };
  },
});
