import { v, type ObjectType } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { PAGE_FACT_JOIN, splitChannelKey } from "./googleAnalyticsLists";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { connectionOf, conversionsOf, countedOf, readSlot } from "./googleAnalyticsReads";
import { decodePages, isPageRef } from "./holdPageRefs";
import { pathOfAddress } from "./utils/sees/analytics";
import { MORE, flowChart } from "./utils/landingFlow";

/**
 * Landing pages' chart, "How visits moved through your website"
 * (docs/plans/active/landing-pages-flow-plan.md LF2, LF3, LF5): the website's
 * flow as each collection kept it (`landingFlow`), for the dates, device and
 * home country chosen — nothing asked of Google (ga-stored-figures-plan.md
 * SF1). Only the caller's own website (`requireMySite`).
 */

const flowArgs = { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };

const nodeValidator = v.object({
  id: v.string(),
  column: v.union(v.literal(0), v.literal(1), v.literal(2)),
  /** The page's number, its path to show, or null for the column's "more" box. */
  page: v.string(),
  path: v.union(v.string(), v.null()),
  more: v.number(),
  visits: v.number(),
  left: v.number(),
  conversions: v.number(),
});

const flowValidator = v.object({
  /** The flow is kept: false until a collection has built it for these dates, device and country. */
  held: v.boolean(),
  from: v.union(v.string(), v.null()),
  to: v.union(v.string(), v.null()),
  /** Whether anything counts as a conversion. */
  counting: v.boolean(),
  columns: v.array(v.object({ visits: v.number(), left: v.number(), conversions: v.number() })),
  nodes: v.array(nodeValidator),
  bands: v.array(v.object({ from: v.string(), to: v.string(), visits: v.number(), conversions: v.number(), landings: v.array(v.string()) })),
});

export const analyticsLandingFlow = tenantQuery({
  args: flowArgs,
  returns: flowValidator,
  handler: async (ctx, args) => await readLandingFlow(ctx, args),
});

/** Its screen's read, for the screen and Ask Hakken alike: the caller's own website only. */
export async function readLandingFlow(ctx: SiteReader, args: ObjectType<typeof flowArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const empty = { held: false, from: null, to: null, counting: false, columns: [], nodes: [], bands: [] };
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return empty;
  const country = await keptCountry(ctx, site.hold, args.country);
  const kept = await readSlot(ctx, holdId, slotKey("landingFlow", args.period, "NOW", args.device, country));
  const counted = countedOf(connection);
  if (!kept) return { ...empty, counting: counted.length > 0 };
  const chart = flowChart(kept.rows.map((row) => {
    const { channel: kind, source } = splitChannelKey(row.key);
    return { parts: [kind, ...(source ? source.split(PAGE_FACT_JOIN) : [])], visits: row.visits, times: row.times ?? 0, conversions: conversionsOf(row, counted).conversions };
  }));
  const refs = [...new Set(chart.nodes.map((node) => node.page).filter(isPageRef))];
  const named = refs.length > 0 ? await decodePages(ctx, holdId, refs) : [];
  const pathOf = new Map(refs.map((ref, index) => [ref, pathOfAddress(named[index] ?? ref)]));
  return {
    held: true,
    from: kept.from,
    to: kept.to,
    counting: counted.length > 0,
    columns: chart.columns,
    nodes: chart.nodes.map((node) => ({ ...node, path: node.page === MORE ? null : pathOf.get(node.page) ?? node.page })),
    bands: chart.bands,
  };
}
