import type { readCampaignActions } from "../../../googleAnalyticsCampaignReads";
import type { readCampaignChart } from "../../../googleAnalyticsChartReads";
import type { readListPage } from "../../../googleAnalyticsReads";
import { campaignForEye, hasNoName, isCameFromCode } from "../../campaignNames";

/**
 * What Google Analytics Campaigns hands its eye, built in one place for the screen (`campaigns/page.tsx`, `CampaignParts.tsx`)
 * and for a chat app's question (`chatAppEyes/googleAnalytics.ts`), so the two can't disagree
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B): the page's own figures, and each chart's part (`useSeesPart`).
 * The reads and the words come in; the figures the eye reads come out.
 */

type ListPage = Awaited<ReturnType<typeof readListPage>>;
type ListRow = ListPage["rows"][number];
type CampaignChart = Awaited<ReturnType<typeof readCampaignChart>>;
type CampaignActions = Awaited<ReturnType<typeof readCampaignActions>>;
type Totals = { visits: number; visitsBefore: number | null; views: number; viewsBefore: number | null; conversions: number; conversionsBefore: number | null; engaged: number; engagedBefore: number | null };

/** Every campaign the boxes and the eye weigh, from the busiest. A website with more is cut here, and says so in the plan's limits. */
export const EYE_CAMPAIGNS = 100;
/** The map's boxes at most, as on All pages. */
export const MAP_CAMPAIGNS = 40;
/** A campaign with under this share of the page's figure is too small for a box. */
const SMALLEST_BOX = 1 / 500;

/** A screen's words, `useTranslations`-shaped: the reader's on the screen, English on the server. */
type Words = (key: string, values?: Record<string, string | number>) => string;

type Named = { label: string; cameFrom?: string };

/** A campaign and where its link was, in a set of words (`googleAnalytics.campaigns`): the table's, the map's, the squares' and the eye's. */
export function campaignNamesFrom(t: Words) {
  const place = (cameFrom: string) => (isCameFromCode(cameFrom) ? t(`cameFrom.${cameFrom}`) : cameFrom);
  const name = (row: Named) => (hasNoName(row.label) ? t("noName", { place: place(row.cameFrom ?? "notKnown") }) : row.label);
  /** For a place with little room: the last part of "Performance Max > Zombies". */
  const short = (row: Named) => {
    const last = name(row).split(" > ").at(-1) ?? name(row);
    return last.length > 26 ? `${last.slice(0, 25)}…` : last;
  };
  return { place, name, short };
}

export type CampaignNames = ReturnType<typeof campaignNamesFrom>;

/**
 * The page's eye: every campaign, in the page's own names, for its rules to weigh each against all campaign visits together, the
 * whole website's figures beside what was bought, whichever list the table shows (campaigns-new-page-plan-2026-11-05.md, step 8).
 * Undefined while the list is read.
 */
export function campaignsEyeData(
  reads: { every: ListPage | null | undefined; overview: { now?: { purchases?: number } | null; before?: { purchases?: number } | null } | null | undefined; website: Totals | undefined; sells: boolean },
  words: { names: Record<string, string>; campaigns: Pick<CampaignNames, "name" | "place"> },
) {
  const { every, overview, website, sells } = reads;
  if (!every) return undefined;
  const { name, place } = words.campaigns;
  return {
    rows: every.rows.map((row) => campaignForEye(row, name(row), place(row.cameFrom ?? "notKnown"))),
    total: every.total,
    untagged: every.untagged,
    names: words.names,
    sells,
    ...(every.campaignTotals ? { totals: every.campaignTotals } : {}),
    ...(website ? { website: { ...website, bought: overview?.now?.purchases ?? 0, boughtBefore: overview?.before?.purchases ?? null } } : {}),
  };
}

/** No campaign in these dates: the page keeps its boxes and draws none of its charts, so no chart hands the eye anything. */
export function noCampaigns(every: ListPage | null | undefined): boolean {
  return every?.campaignTotals?.visits === 0;
}

export type CampaignShow = "visits" | "bought" | "conversions" | "left";
type DayPoint = { day: string; lastDay?: string; visits: number; engaged: number; conversions: number; bought: number };

/** A day's figure on the chart: the visits that left at once are those not engaged. */
export function campaignDayFigure(point: DayPoint, show: CampaignShow): number {
  return show === "left" ? Math.max(0, point.visits - point.engaged) : point[show];
}

/** The chart's part: each day's visits, what was bought, the events and those who left at once, and the same the dates before. */
export function campaignsByDayForEye(chart: CampaignChart | null | undefined) {
  if (!chart) return undefined;
  const before = chart.before ?? null;
  const dayOf = (point: DayPoint) => ({ day: point.day, ...(point.lastDay ? { lastDay: point.lastDay } : {}), visits: point.visits, bought: point.bought, conversions: point.conversions, leftStraightAway: campaignDayFigure(point, "left") });
  return {
    days: chart.points.map(dayOf),
    ...(before ? { daysBefore: before.points.map(dayOf) } : {}),
  };
}

export type CampaignCount = "visits" | "bought" | "conversions";

/** A campaign's figure by what the map counts: visits, what was bought, or the events. */
export function campaignFigures(row: ListRow, count: CampaignCount): { now: number; before: number | null } {
  if (count === "bought") return { now: row.purchases, before: row.purchasesBefore ?? null };
  if (count === "conversions") return { now: row.conversions, before: row.conversionsBefore };
  return { now: row.visits, before: row.visitsBefore ?? null };
}

/** The most boxes a map can hold, and the smallest it has room to show, as the screen says it. Plain code, for its tests. */
export function boxedCampaigns<R>(rows: readonly R[], figure: (row: R) => number, whole: number, most = MAP_CAMPAIGNS): R[] {
  return rows.filter((row) => figure(row) > 0 && figure(row) >= whole * SMALLEST_BOX).slice(0, most);
}

/** The campaigns the map draws a box for, by what it counts: the busiest, never one with next to nothing. */
export function campaignMapRows(list: ListPage | null | undefined, count: CampaignCount): ListRow[] {
  const totals = list?.campaignTotals;
  const whole = totals ? (count === "bought" ? totals.bought : count === "conversions" ? totals.conversions : totals.visits) : 0;
  return boxedCampaigns(list?.rows ?? [], (row) => campaignFigures(row, count).now, whole);
}

/** The map's part: each campaign with a box, by its name and where its link was, now and the dates before. */
export function campaignMapForEye(list: ListPage | null | undefined, count: CampaignCount, rows: readonly ListRow[], names: Pick<CampaignNames, "name" | "place">) {
  if (!list) return undefined;
  const { name, place } = names;
  return { count, campaigns: rows.map((row) => ({ name: name(row), cameFrom: place(row.cameFrom ?? "notKnown"), visits: row.visits, visitsBefore: row.visitsBefore ?? null, bought: row.purchases, boughtBefore: row.purchasesBefore ?? null, conversions: row.conversions, conversionsBefore: row.conversionsBefore })) };
}

/**
 * What people did after they arrived, the squares' part: the things done, by the busiest campaigns, in visits that did each where
 * Google kept them (so a rate is a true share), else in times. `thing` names a thing done as the page does.
 */
export function whatPeopleDidForEye(answer: CampaignActions | null | undefined, thing: (eventName: string) => string, name: CampaignNames["name"]) {
  if (!answer) return undefined;
  const events = answer.events;
  const hasRates = answerHasRates(answer);
  return {
    things: events.map(thing),
    unit: hasRates ? "visits" : "times",
    campaigns: answer.rows.map((row) => ({ name: name(row), visits: row.visits, ...Object.fromEntries(events.map((event, at) => [thing(event), (hasRates ? row.visitsDid[at] : row.times[at]) ?? 0])) })),
  };
}

/** Saved lists from before both units were kept hold only the times, so there's no rate to offer. */
export function answerHasRates(answer: CampaignActions | null | undefined): boolean {
  return (answer?.rows ?? []).some((row) => row.visitsDid.some((did) => did !== null));
}
