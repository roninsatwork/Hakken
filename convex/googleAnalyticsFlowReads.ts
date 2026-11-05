import { v, type ObjectType } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { PAGE_FACT_JOIN, splitChannelKey } from "./googleAnalyticsLists";
import { readPageRows } from "./googleAnalyticsPageLists";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { connectionOf, conversionsOf, countedOf, readAnalyticsList, readSlot } from "./googleAnalyticsReads";
import { decodePages, isPageRef } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { busyVisitsFor } from "./utils/pageMoves";
import { pathOfAddress } from "./utils/sees/analytics";
import { FLOW_NODES, NOT_SET, OTHER_GROUPS, flowChart, groupNode, isCurrentFlow, isGroupNode, kindOfNode, type FirstGroup } from "./utils/landingFlow";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { SHOP_PAGES_KIND, isShopPage } from "./utils/shopPages";

/**
 * Funnel's chart, "Where people went next" (docs/plans/active/funnel-way-1-plan-2026-11-05.md, steps 1 and 2): the
 * website's flow as each collection kept it (`landingFlow`), for the dates, device and home country chosen. Nothing is
 * asked of Google. The first column is the table's own figures, grouped: the pages ticked come out of their groups on the
 * screen, with each one's routes (`landingRoutes`). Only the caller's own website (`requireMySite`).
 */

/** The pages the first column can show at once. */
export const MOST_TICKED = FLOW_NODES;

const flowArgs = {
  siteId: v.id("companyWebsites"),
  period: analyticsPeriodValidator,
  device: v.string(),
  country: v.optional(v.string()),
  /** The landing pages ticked in the table, by their numbers. Left out, the ones the page opens with (`starts`). */
  pages: v.optional(v.array(v.string())),
  /** What the table's menu says: which pages the page opens with ticked. */
  leaveOut: v.optional(v.boolean()),
  group: v.optional(v.string()),
};

const routeValidator = v.object({ to: v.string(), visits: v.number(), conversions: v.number() });

const flowValidator = v.object({
  /** The flow is kept: false until a collection has built it for these dates, device and country. */
  held: v.boolean(),
  from: v.union(v.string(), v.null()),
  to: v.union(v.string(), v.null()),
  /** Whether anything counts as a conversion. */
  counting: v.boolean(),
  nodes: v.array(v.object({
    id: v.string(),
    column: v.number(),
    /** A group's Classification: its id, `NOT_SORTED`, `SHOP_PAGES` or the smaller groups together. Null for a page. */
    kind: v.union(v.string(), v.null()),
    /** A Classification's own name; null where the screen says it in its own words. */
    name: v.union(v.string(), v.null()),
    /** How many groups an "other groups" box holds. */
    more: v.number(),
    /** A page's address; null for a group. */
    address: v.union(v.string(), v.null()),
    visits: v.number(),
    left: v.number(),
    conversions: v.number(),
  })),
  bands: v.array(v.object({ from: v.string(), to: v.string(), visits: v.number(), conversions: v.number() })),
  /** The pages the page opens with ticked: the busiest, as the table's menu says. */
  starts: v.array(v.string()),
  /** The website's visits that went on from their first page, and those that left there. */
  onward: v.number(),
  left: v.number(),
  /** Visits with no page known. */
  noPageVisits: v.number(),
  /** Pages with enough visits to trust, and those people leave more than the website's average: the worst first. */
  busy: v.union(v.null(), v.object({
    visitsAtLeast: v.number(),
    pages: v.number(),
    losing: v.number(),
    lost: v.number(),
    top: v.array(v.object({ key: v.string(), address: v.string(), visits: v.number(), left: v.number() })),
  })),
  /** Each ticked page: the table's own figures, the group it comes out of, and its routes to the second column. */
  ticked: v.array(v.object({
    key: v.string(),
    id: v.string(),
    address: v.string(),
    group: v.string(),
    visits: v.number(),
    visitsBefore: v.union(v.number(), v.null()),
    left: v.number(),
    conversions: v.number(),
    routes: v.array(routeValidator),
  })),
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
  const empty = { held: false, from: null, to: null, counting: false, nodes: [], bands: [], starts: [], onward: 0, left: 0, noPageVisits: 0, busy: null, ticked: [] };
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return empty;
  const country = await keptCountry(ctx, site.hold, args.country);
  const kept = await readSlot(ctx, holdId, slotKey("landingFlow", args.period, "NOW", args.device, country));
  const counted = countedOf(connection);
  const parts = kept ? kept.rows.map((row) => {
    const { channel: kind, source } = splitChannelKey(row.key);
    return { parts: [kind, ...(source ? source.split(PAGE_FACT_JOIN) : [])], visits: row.visits, times: row.times ?? 0, conversions: conversionsOf(row, counted).conversions };
  }) : [];
  // A flow kept before these columns existed reads as not collected yet.
  if (!kept || !isCurrentFlow(parts)) return { ...empty, counting: counted.length > 0 };

  // The first column: the table's own figures, by group.
  const list = await readAnalyticsList(ctx, holdId, { period: args.period, device: args.device, country, list: "landing", named: true });
  const kinds = await readPageKinds(ctx, holdId);
  const rows = [...list.every].sort((left, right) => right.visits - left.visits || left.key.localeCompare(right.key));
  const kindOfRow = (row: { key: string; label: string }) => {
    if (row.key === NOT_SET) return NOT_SORTED_KIND;
    if (isShopPage(row.label)) return SHOP_PAGES_KIND;
    return kinds ? kinds.kindOf(row.label) : NOT_SORTED_KIND;
  };
  const groups = new Map<string, FirstGroup>();
  let onward = 0;
  let left = 0;
  for (const row of rows) {
    const kind = kindOfRow(row);
    const group = groups.get(kind) ?? { kind, visits: 0, left: 0, conversions: 0 };
    const gone = Math.max(0, row.visits - (row.onward ?? 0));
    group.visits += row.visits;
    group.left += gone;
    group.conversions += row.conversions;
    groups.set(kind, group);
    onward += row.onward ?? 0;
    left += gone;
  }
  const chart = flowChart(parts, [...groups.values()]);

  // Busy pages people leave more than the website does, the shop's own pages and no page known aside.
  const leavesAt = onward + left > 0 ? left / (onward + left) : 0;
  const busyAtLeast = busyVisitsFor(list.from, list.to);
  const busyRows = rows.filter((row) => row.key !== NOT_SET && !isShopPage(row.label) && row.visits >= busyAtLeast);
  const losing = busyRows.map((row) => ({ key: row.key, address: row.label, visits: row.visits, left: Math.max(0, row.visits - (row.onward ?? 0)) })).filter((row) => row.left / row.visits > leavesAt);
  const busy = {
    visitsAtLeast: busyAtLeast,
    pages: busyRows.length,
    losing: losing.length,
    lost: losing.reduce((sum, row) => sum + row.left, 0),
    top: [...losing].sort((one, other) => other.left - one.left || one.key.localeCompare(other.key)).slice(0, 5),
  };

  // The pages the page opens with: the busiest the table's menu leaves in.
  const inMenu = (row: { key: string; label: string }) => {
    if (args.group === SHOP_PAGES_KIND) return row.key !== NOT_SET && isShopPage(row.label);
    if (args.leaveOut && row.key !== NOT_SET && isShopPage(row.label)) return false;
    return args.group === undefined || kindOfRow(row) === args.group;
  };
  const starts = rows.filter(inMenu).slice(0, FLOW_NODES).map((row) => row.key);
  const wanted = (args.pages ?? starts).slice(0, MOST_TICKED);
  const secondIds = new Set(chart.nodes.filter((node) => node.column === 1).map((node) => node.id));
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const ticked = await Promise.all(wanted.flatMap((key) => {
    const row = byKey.get(key);
    if (!row) return [];
    return [(async () => {
      const own = await readPageRows(ctx, holdId, "landingRoutes", args.period, args.device, key, "NOW", country);
      const routes = new Map<string, { to: string; visits: number; conversions: number }>();
      for (const one of own?.rows ?? []) {
        const box = `1:${chart.secondColumn.get(one.key) ?? one.key}`;
        const to = secondIds.has(box) ? box : `1:${groupNode(OTHER_GROUPS)}`;
        const held = routes.get(to) ?? { to, visits: 0, conversions: 0 };
        held.visits += one.visits;
        held.conversions += conversionsOf(one, counted).conversions;
        routes.set(to, held);
      }
      return {
        key,
        id: `0:${key}`,
        address: row.label,
        group: `0:${chart.firstColumn.get(kindOfRow(row)) ?? groupNode(OTHER_GROUPS)}`,
        visits: row.visits,
        visitsBefore: row.visitsBefore ?? null,
        left: Math.max(0, row.visits - (row.onward ?? 0)),
        conversions: row.conversions,
        routes: [...routes.values()],
      };
    })()];
  }));

  const refs = [...new Set(chart.nodes.map((node) => node.node).filter((node) => !isGroupNode(node) && isPageRef(node)))];
  const named = refs.length > 0 ? await decodePages(ctx, holdId, refs) : [];
  const addressOf = new Map(refs.map((ref, index) => [ref, named[index]]));
  return {
    held: true,
    from: kept.from,
    to: kept.to,
    counting: counted.length > 0,
    nodes: chart.nodes.map((node) => {
      const kind = isGroupNode(node.node) ? kindOfNode(node.node) : null;
      return {
        id: node.id,
        column: node.column,
        kind,
        name: kind && kinds ? kinds.nameOf(kind) : null,
        more: node.more,
        address: kind ? null : pathOfAddress(addressOf.get(node.node) ?? node.node),
        visits: node.visits,
        left: node.left,
        conversions: node.conversions,
      };
    }),
    bands: chart.bands,
    starts,
    onward,
    left,
    noPageVisits: byKey.get(NOT_SET)?.visits ?? 0,
    busy,
    ticked,
  };
}
