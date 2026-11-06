import { v, type Infer, type ObjectType } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { decodePages } from "./holdPageRefs";
import { titlesOf } from "./pageTitles";
import { readPageKinds } from "./pageKinds";
import { keptCountry } from "./googleAnalyticsCountries";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { connectionOf, type ShownRow } from "./googleAnalyticsRows";
import { readAnalyticsList } from "./googleAnalyticsReads";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { isUnknownValue } from "./utils/analyticsUnknown";

/**
 * Funnel's page panels (first built for the old Overview, ga-overview-plan.md OV3 and OV4): the classifications and landing pages
 * with the most visits, from the lists the night's run keeps, never asked of Google. The new Overview reads `analyticsOverviewSplit`.
 */

/** The rows each panel shows (OV9); Who visited shows one a kind. */
export const OVERVIEW_TOP = 3;

/** Landing pages named beyond the three: Google's rows for no page recorded, passed over. */
const PASSED_OVER = 3;

const topRowValidator = v.object({
  key: v.string(),
  /** A channel's name, a page's address, or a classification's id. */
  label: v.string(),
  /** The classification's name — of a classification row, or of a landing page's; null for Unclassified. */
  kindName: v.optional(v.union(v.string(), v.null())),
  /** A page's title (GA27). */
  title: v.optional(v.string()),
  visits: v.number(),
  /** Visits against the span before, as a fraction; null with none to compare. */
  change: v.union(v.number(), v.null()),
  /** The share of the visits that left from the page they landed on: pages and classifications only. */
  left: v.optional(v.union(v.number(), v.null())),
  conversions: v.number(),
  value: v.number(),
});
type TopRow = Infer<typeof topRowValidator>;

/** The page panels: the classifications and the landing pages, from one read of the landing pages. */
export const overviewPagePanelsValidator = v.object({
  /** Null when the website's pages have no classifications. */
  kinds: v.union(v.null(), v.object({ rows: v.array(topRowValidator), count: v.number() })),
  landing: v.object({
    rows: v.array(topRowValidator),
    count: v.number(),
    /** The share of every visit that left from the page it landed on. */
    left: v.union(v.number(), v.null()),
  }),
});

const overviewPanelsArgs = { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };
type PanelArgs = ObjectType<typeof overviewPanelsArgs>;

export const analyticsOverviewPagePanels = tenantQuery({
  args: overviewPanelsArgs,
  returns: v.union(v.null(), overviewPagePanelsValidator),
  handler: async (ctx, args) => await readOverviewPagePanels(ctx, args),
});

/** The most visits first, then by name: the panels' order. */
const byVisits = (left: ShownRow, right: ShownRow) => right.visits - left.visits || left.label.localeCompare(right.label);

/** The share who left from the page they landed on: what did not go on (Funnel's `onward`). */
const leftOf = (row: ShownRow) => (row.visits > 0 && row.onward !== undefined && row.onward !== null ? Math.max(0, row.visits - row.onward) / row.visits : null);

/** Overview's page panels (OV3, OV4): null before the first collection. */
export async function readOverviewPagePanels(ctx: SiteReader, args: PanelArgs): Promise<Infer<typeof overviewPagePanelsValidator> | null> {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const listArgs = { period: args.period, device: args.device, country };

  // OV3: the classifications, with what left from their landing pages — and the landing pages from the same read.
  const kinds = await readPageKinds(ctx, holdId);
  const groups = kinds ? await readAnalyticsList(ctx, holdId, { ...listArgs, list: "groups", pages: true }) : null;
  const groupRows = groups ? [...groups.every].sort(byVisits) : [];

  // OV4: the landing pages, each with its classification; no page recorded left out of the three. Without
  // classifications they are read on their own, named only as far as the three need: a few more for the visits with no
  // page recorded passed over.
  const pages = [...(groups?.pages ?? (await readAnalyticsList(ctx, holdId, { ...listArgs, list: "landing" })).every)].sort(byVisits);
  const first = pages.slice(0, OVERVIEW_TOP + PASSED_OVER);
  const addresses = groups?.pages ? first.map((row) => row.label) : await decodePages(ctx, holdId, first.map((row) => row.key));
  const named = first.map((row, at) => ({ row, address: addresses[at] })).filter(({ address }) => address !== "" && !isUnknownValue(address));
  const top = named.slice(0, OVERVIEW_TOP);
  const titles = await titlesOf(ctx, holdId, top.map(({ address }) => address));
  const landed = pages.reduce((sum, row) => sum + row.visits, 0);
  const stayed = pages.reduce((sum, row) => sum + (row.onward ?? 0), 0);

  return {
    kinds: kinds && groups ? {
      rows: groupRows.slice(0, OVERVIEW_TOP).map((row) => topRow(row, { kindName: row.key === NOT_SORTED_KIND ? null : kinds.nameOf(row.key), left: leftOf(row) })),
      count: groupRows.length,
    } : null,
    landing: {
      rows: top.map(({ row, address }) => {
        const title = titles.get(address);
        return topRow(row, {
          label: address,
          ...(kinds ? { kindName: kinds.nameOf(kinds.kindOf(address)) } : {}),
          ...(title ? { title } : {}),
          left: leftOf(row),
        });
      }),
      count: pages.length,
      left: landed > 0 && pages.some((row) => row.onward !== undefined) ? Math.max(0, landed - stayed) / landed : null,
    },
  };
}

function topRow(row: ShownRow, extra: Partial<TopRow> = {}): TopRow {
  return { key: row.key, label: row.label, visits: row.visits, change: row.change, conversions: row.conversions, value: row.value, ...extra };
}
