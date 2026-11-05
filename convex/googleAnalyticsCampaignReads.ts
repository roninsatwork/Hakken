import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { keptCountry } from "./googleAnalyticsCountries";
import { UNTAGGED, splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { analyticsPeriodValidator, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { connectionOf, countedOf, readFor } from "./googleAnalyticsReads";
import { PURCHASE_EVENT } from "./utils/analyticsEvents";
import { chosenActions } from "./utils/campaignActions";
import { cameFromOf } from "./utils/campaignNames";
import type { Id } from "./_generated/dataModel";

/**
 * What people did after they arrived (docs/plans/active/campaigns-new-page-plan-2026-11-05.md, step 5): the busiest campaigns and how
 * many times people did each counted thing, from the saved list, so it holds for any dates. Times, not people: one visit can add to the
 * basket more than once. What was bought is the list's own figure, so a square and the table never say two numbers for one thing.
 * Nothing is asked of Google.
 */
export const CAMPAIGN_ACTION_ROWS = 10;

const actionsArgs = { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()), cameFrom: v.optional(v.string()) };

export const analyticsCampaignActions = tenantQuery({
  args: actionsArgs,
  returns: v.object({
    live: v.boolean(),
    /** The things people did, the most counted first, in the order of each row's `times`. */
    events: v.array(v.string()),
    rows: v.array(v.object({
      key: v.string(), label: v.string(), cameFrom: v.string(), visits: v.number(), times: v.array(v.number()),
      /** The visits that did each thing, where Google's kept them: what a conversion rate is worked out from, as it can't pass 100%. */
      visitsDid: v.array(v.union(v.number(), v.null())),
    })),
  }),
  handler: async (ctx, args) => await readCampaignActions(ctx, args),
});

/** Its read, for the screen and Ask Hakken alike: the caller's own website only. */
export async function readCampaignActions(ctx: SiteReader, args: { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string; cameFrom?: string; q?: string }) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  const none = { live: false, events: [] as string[], rows: [] as Array<{ key: string; label: string; cameFrom: string; visits: number; times: number[]; visitsDid: Array<number | null> }> };
  if (!connection?.newestDay) return none;
  const counted = countedOf(connection).map((event) => event.eventName);
  const list = await readFor(ctx, holdId, "campaign", args.period, "NOW", args.device, undefined, country, { events: new Set(counted), units: true });
  if (list === "LIVE") return { ...none, live: true };
  if (!list) return none;
  const placeOf = (row: ListRow) => cameFromOf(splitChannelKey(row.key).source);
  const rows = list.rows.filter((row) => row.key !== UNTAGGED && (!args.cameFrom || placeOf(row) === args.cameFrom));
  const timesOf = (row: ListRow, event: string) => (event === PURCHASE_EVENT ? row.purchases : row.counts.get(event) ?? 0);
  const totals = new Map(counted.map((event) => [event, rows.reduce((sum, row) => sum + timesOf(row, event), 0)]));
  const events = chosenActions(totals);
  // Ask Hakken can look for a campaign past the page's ten. The columns stay the page's.
  const q = args.q?.trim().toLowerCase();
  const found = q ? rows.filter((row) => splitChannelKey(row.key).channel.toLowerCase().includes(q)) : rows;
  const busiest = [...found].sort((left, right) => right.visits - left.visits || left.key.localeCompare(right.key)).slice(0, CAMPAIGN_ACTION_ROWS);
  return {
    live: false,
    events,
    rows: busiest.map((row) => ({ key: row.key, label: splitChannelKey(row.key).channel, cameFrom: placeOf(row), visits: row.visits, times: events.map((event) => timesOf(row, event)), visitsDid: events.map((event) => (row.eventVisits && row.eventVisits.size > 0 ? row.eventVisits.get(event) ?? 0 : null)) })),
  };
}
