import type { Id } from "./_generated/dataModel";
import { readChart, readPeriodBeforeChart } from "./googleAnalyticsChartReads";
import { readOverviewSplit, OVERVIEW_SPLITS } from "./googleAnalyticsOverviewSplits";
import { readListPage, readOverview } from "./googleAnalyticsReads";
import { connectionOf } from "./googleAnalyticsRows";
import type { AnalyticsPeriod } from "./googleAnalyticsSchema";
import { requireMySite, type SiteReader } from "./siteAccess";
import { pathOfAddress } from "./utils/sees/analytics";
import { bestFor, biggestChange } from "./utils/channelPicks";
import { isFirstStep, isShop, squaresOutOf } from "./utils/conversionSteps";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { OTHER_KIND } from "./utils/sees/analyticsChannel";
import { overviewFigures, type OverviewSplitAnswer, type OverviewSplitName } from "./utils/sees/overviewFigures";

/**
 * Overview for Ask Hakken (overview-new-page-plan-2026-11-06.md, step 12): what the page says, through the very reads it draws from and
 * the builder the eye reads (`overviewFigures`), so a figure in an answer is the figure on the screen. No money. A shop speaks of what
 * was bought, and any other website of its events. `part` asks the days, or the pages by Classification, as reads of their own.
 */

const WORDS = {
  rule: "These are the figures the screen shows. Give them with the link, in plain words. Overview counts visits, what was bought and conversions, never money. Lead with what was bought, not conversions.",
  ruleService: "These are the figures the screen shows. Give them with the link, in plain words. This website sells nothing here, so the page counts events, never money. Say events, not conversions, enquiries, sales or baskets. A click on Apply now or a phone number is a first step, never the real thing.",
  times: "conversions and events count every time something the website counts happened, and one visit can do several. The squares and visitsThatDid count visits, each visit once. So the two never match, and one can pass the other.",
  lists: "Google counts each list on its own, so a list can add up to a little more or less than the whole website's visits. The whole website's figure is Google's own total. Never set a list against it, or call the gap a change.",
  squares: "squares is how visits ended, as the page draws it: whole squares out of `outOf`, and the visits behind each. A visit doing two things counts in both, so these are close rather than exact.",
  bands: "ofEvery100Visits and ofEvery100Done are the two rows of the page's bands: each row's whole number out of every 100 visits, and out of every 100 sales or events.",
  left: "Left straight away means stayed under 10 seconds and did nothing.",
};

type Common = { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string };
type Ask = { part?: string; linkTo: (segment: string, extra?: Record<string, string>) => string };
type Base = { ok: boolean; website: string; screen: string; period: string; figuresTo: string };

/** An event's words on the server, where the reader's catalogue isn't: `form_submit` as Form submit. */
const eventWords = (name: string) => {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
};

const VISITOR_WORDS: Record<string, string> = { new: "New", returning: "Returning", desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" };

function rowName(split: OverviewSplitName, row: { key: string; name: string | null }): string {
  if (split === "kind") return row.key === NOT_SORTED_KIND ? "Not sorted yet" : row.key === OTHER_KIND ? "Other groups" : row.name ?? row.key;
  return VISITOR_WORDS[row.key] ?? row.key;
}

export async function overviewForAssistant(ctx: SiteReader, common: Common, ask: Ask, base: Base) {
  const site = await requireMySite(ctx, common.siteId);
  const connection = await connectionOf(ctx, site.hold._id);
  const overview = await readOverview(ctx, common);
  const shop = isShop(connection?.shop, overview.now?.purchases, overview.before?.purchases);
  const plain = new Map((connection?.events ?? []).map((event) => [event.eventName, event]));
  const out = { ...base, kind: shop ? "shop" : "service", rule: shop ? WORDS.rule : WORDS.ruleService, from: overview.from, to: overview.to, link: ask.linkTo("") };
  if (!overview.now) return out;
  const build = (input: { splits?: Partial<Record<OverviewSplitName, OverviewSplitAnswer>>; chart?: Awaited<ReturnType<typeof readChart>>; daysBefore?: Awaited<ReturnType<typeof readPeriodBeforeChart>>; pages?: Awaited<ReturnType<typeof readListPage>>["rows"]; cells?: number }) => overviewFigures({
    shop, cells: input.cells ?? 100, now: overview.now, before: overview.before, chart: input.chart, daysBefore: input.daysBefore, splits: input.splits ?? {}, pages: input.pages,
    rowName, eventName: (name) => plain.get(name)?.plainName ?? eventWords(name),
    firstStep: (name) => plain.get(name)?.firstStep ?? isFirstStep(name),
  });

  if (ask.part === "days") {
    const [chart, daysBefore] = [await readChart(ctx, common), await readPeriodBeforeChart(ctx, common)];
    const channel = await readOverviewSplit(ctx, { ...common, split: "channel" });
    const figures = build({ chart, daysBefore, splits: { channel } });
    return { ...out, days: figures.days, daysBefore: figures.daysBefore, ...(figures.daysBefore.length === 0 ? { noDaysBefore: "The dates before aren't kept day by day for dates this long." } : {}) };
  }

  if (ask.part === "pages") {
    const kind = await readOverviewSplit(ctx, { ...common, split: "kind" });
    const list = await readListPage(ctx, { ...common, list: "landing", leaveOut: true, page: 1, rows: 25, sort: "visits", direction: "desc" });
    const figures = build({ splits: { kind }, pages: list.rows });
    return {
      ...out,
      listsRule: WORDS.lists,
      bandsRule: WORDS.bands,
      classifications: figures.classifications,
      whatEachClassificationDid: figures.whatEachDid.classifications,
      topPages: figures.topPages.map((row) => ({ ...row, address: pathOfAddress(row.address) })),
      leftRule: WORDS.left,
    };
  }

  const answers = Object.fromEntries(await Promise.all(OVERVIEW_SPLITS.filter((split) => split !== "kind").map(async (split) => [split, await readOverviewSplit(ctx, { ...common, split })] as const))) as Partial<Record<OverviewSplitName, OverviewSplitAnswer>>;
  const year = await readOverview(ctx, { ...common, period: "last12Months", device: "" });
  const cells = year.now ? squaresOutOf(shop ? year.now.purchases : year.now.conversions, year.now.visits) : 100;
  const figures = build({ splits: answers, cells });
  const rows = answers.channel?.rows ?? [];
  const picks = rows.map((row) => ({ key: row.key, visits: row.visits, visitsBefore: row.visitsBefore, wins: shop ? row.bought : row.conversions }));
  const moved = biggestChange(picks);
  const best = bestFor(picks);
  const done = shop ? overview.now.purchases : overview.now.conversions;
  return {
    ...out,
    wholeWebsite: figures.website,
    boxes: {
      biggestChange: moved ? { channel: moved.key, moreOrFewerVisits: moved.change, against: "the dates before" } : null,
      [shop ? "sellsBest" : "bestForEvents"]: best ? { channel: best.key, [shop ? "boughtPer100Visits" : "eventsPer100Visits"]: Math.round(best.per100 * 10) / 10, wholeWebsitePer100Visits: overview.now.visits > 0 ? Math.round((1000 * done) / overview.now.visits) / 10 : null } : null,
    },
    timesRule: WORDS.times,
    listsRule: WORDS.lists,
    squaresRule: WORDS.squares,
    bandsRule: WORDS.bands,
    leftRule: WORDS.left,
    squares: figures.squares,
    events: figures.events,
    channels: figures.channels,
    devices: figures.devices,
    visitors: figures.visitors,
    whatEachDid: { channels: figures.whatEachDid.channels, devices: figures.whatEachDid.devices, visitors: figures.whatEachDid.visitors },
    squaresBy: { channels: figures.squaresBy.channels, devices: figures.squaresBy.devices },
  };
}
