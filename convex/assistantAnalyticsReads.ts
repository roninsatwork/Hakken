import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalQuery, type QueryCtx } from "./_generated/server";
import { readVisitorMap } from "./googleAnalyticsConversionReads";
import type { SiteReader } from "./siteAccess";
import { holdFor } from "./assistantReads";
import { isTrackedHold } from "./utils/websitePairing";
import { readConversions, readListPage, readOverview, type ShownRow } from "./googleAnalyticsReads";
import { readOverviewPagePanels, readOverviewPanels, type OverviewPanels } from "./googleAnalyticsOverviewReads";
import { readEvent, readEvents } from "./googleAnalyticsEventReads";
import { readVisitorBars, readVisitors } from "./googleAnalyticsVisitorReads";
import { readPageKindViews } from "./googleAnalyticsPageKindViews";
import { productChart, readProducts, shownProductList } from "./googleAnalyticsProductReads";
import { findPage, readLandingPage, readPageMain, readPageStoryPart } from "./googleAnalyticsPageReads";
import { readPageBoxes } from "./googleAnalyticsPageBoxes";
import { LIVE_LISTS, askLiveFigures } from "./googleAnalyticsRealtime";
import { pathOfAddress } from "./utils/sees/analytics";
import { MOVE_VIEWS, PAGE_MOVES } from "./utils/pageMoves";
import { readPageKinds } from "./pageKinds";
import { SHOP_PAGES_KIND } from "./utils/shopPages";
import { ALL_PAGES_ORDERS, ALL_PAGES_ORDER_NAMES, ANALYTICS_PARTS, ANALYTICS_SCREENS, type AnalyticsScreen } from "./utils/analyticsScreens";
import { viewsCountedDifferently } from "./utils/viewsCounted";
import { readChannelTop, readChannelsTop } from "./googleAnalyticsChannelReads";
import { NO_PAGE_KIND, OTHER_KIND } from "./utils/sees/analyticsChannel";
import { leftWithout } from "./utils/sees/analyticsProducts";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { calendarPeriodValidator } from "./utils/calendarPeriods";

/**
 * Every Google Analytics screen, as the Assistant reads it
 * (docs/plans/active/google-analytics-plan.md §18.6.8; Anthony, 2026-10-11:
 * "ask hakken will be able to pull from every screen and every peice of data
 * we hold"). Each screen is read through the very function its page reads
 * through (`readOverview`, `readListPage`, `readEvents`, …), so a figure in an
 * answer is the figure on the screen, with the screen's address to check it.
 * The company is the conversation's, never one the model names; the website is
 * found among that company's own holds (`holdFor`). Live is asked of Google
 * as the Live page asks it, and kept no more than it is.
 */

type Screen = AnalyticsScreen;

/** Visitors' lists, by the names its tool offers. */
const VISITOR_VIEWS = ["visitorType", "browser", "system", "age", "gender", "interest"] as const;

/** Rows an answer carries of any list: the most first, as the screen opens. */
const ROWS = 25;

const reader = (ctx: Pick<QueryCtx, "db">, companyId: Id<"companies">): SiteReader => ({ db: ctx.db, companyId });

/** Money as the property's currency, from the hundredths every figure is kept in. */
const money = (hundredths: number | null | undefined) => (hundredths === null || hundredths === undefined ? null : Math.round(hundredths) / 100);
/** A share as a percentage, to one place. */
const percent = (share: number | null | undefined) => (share === null || share === undefined ? null : Math.round(share * 1000) / 10);

/** Overview's panels in plain words (ga-overview-plan.md OV2–OV7): the rows the screen shows, money in the currency. */
function overviewPanelParts(panels: Omit<OverviewPanels, "kinds" | "landing">) {
  return {
    whereVisitsCameFrom: {
      channels: panels.channels.count,
      visitsFromTaggedLinks: panels.channels.tagged,
      visitsFromAdKeywords: panels.channels.keywords,
      mostVisits: panels.channels.rows.map((row) => ({ channel: row.label, visits: row.visits, changePercent: percent(row.change), conversions: row.conversions, value: money(row.value) })),
    },
    keyEvents: panels.conversions.rows.map((row) => ({
      event: row.eventName,
      status: row.status === "counted" ? "counted as a conversion" : row.status === "never" ? "counted, but never happened" : "not counted",
      times: row.times, value: money(row.value), changePercent: percent(row.change),
    })),
    whoVisited: panels.who.map((row) => ({ kind: row.kind, biggestGroup: row.label, sharePercent: percent(row.share), sharePercentBefore: percent(row.shareBefore) })),
    ...(panels.shop ? {
      // Items, never the shop's money (Anthony, 2026-11-03: "Take money off").
      shop: {
        bought: panels.shop.bought, addedToBasket: panels.shop.basket,
        bestSellers: panels.shop.rows.map((row) => ({ product: row.name, viewed: row.looks, addedToBasket: row.basket, bought: row.bought })),
      },
    } : {}),
  };
}

/** Overview's page panels (OV3, OV4), a read of their own: the screen's rows, in plain names. */
function overviewPageParts(panels: Pick<OverviewPanels, "kinds" | "landing">) {
  const kindName = (name: string | null | undefined) => (name === undefined ? undefined : name ?? "unclassified");
  return {
    pagesByClassification: panels.kinds
      ? { classifications: panels.kinds.count, mostVisits: panels.kinds.rows.map((row) => ({ classification: kindName(row.kindName), visits: row.visits, changePercent: percent(row.change), leftFromItPercent: percent(row.left), conversions: row.conversions })) }
      : "The website's pages have no classifications yet.",
    whereVisitsLanded: {
      leftFromTheirLandingPagePercent: percent(panels.landing.left),
      mostVisits: panels.landing.rows.map((row) => ({
        page: row.title ? `${row.title} — ${pathOfAddress(row.label)}` : pathOfAddress(row.label),
        classification: kindName(row.kindName), visits: row.visits, changePercent: percent(row.change), leftFromItPercent: percent(row.left), conversions: row.conversions,
      })),
    },
  };
}

/** A list's row as the Assistant reads it: plain names and units, the screen's own figures. */
/** A page of All pages as its screen shows it: no money, its views and conversions against the span before. */
function pageRowOf(row: ShownRow) {
  return {
    name: row.title ? `${row.title} — ${pathOfAddress(row.label)}` : pathOfAddress(row.label),
    visits: row.visits,
    pageViews: row.views,
    pageViewsBefore: row.viewsBefore,
    pageViewsChange: row.viewsBefore === null ? null : row.views - row.viewsBefore,
    secondsEngagedPerVisit: row.timePerVisit === null ? null : Math.round(row.timePerVisit),
    conversionsMadeHere: row.conversions,
    conversionsPer100Visits: percent(row.conversionRate),
    conversionsMadeHereBefore: row.conversionsBefore,
  };
}

/** What All pages' conversion figure means, so a basket's 302 is never told as 302% (Anthony, 2026-11-04). */
const PAGE_CONVERSIONS_RULE = "conversionsPer100Visits counts every time something the website counts happened, for every 100 visits to the page. One visit can do several of those things, so a page everyone passes through, like the basket, can show well over 100, such as 302. It is not a percentage of visits or people: never call it a conversion rate of 302%. If someone asks about a high figure, explain this.";

/** Said first when page views look counted differently (`viewsCountedDifferently`), wherever whole-website views are read. */
function viewsWarning(now: { views: number; visits: number } | null | undefined, before: { views: number; visits: number } | null | undefined) {
  const counted = now ? viewsCountedDifferently({ views: now.views, viewsBefore: before?.views, visits: now.visits, visitsBefore: before?.visits }) : null;
  return counted ? {
    warning: `Say this first, in plain words. Pages a visit went from ${counted.pagesAVisitBefore} to ${counted.pagesAVisit} on these dates. That is too big a jump for people to have changed what they do, and it usually means page views were being counted differently for part of these dates. So page views, and every page's ups and downs in views, may not be real. Use visits to judge how the website did, and never explain these moves in views as something people did.`,
  } : {};
}

/** The screen's menu choice for the shop's own pages, in its own words. */
const SHOP_PAGES_NAME = "Search, basket and account";

/** A classification by the name it was asked for: its id, or the names there are to choose from. */
async function classificationNamed(ctx: Pick<QueryCtx, "db">, holdId: Id<"companyWebsites">, asked: string): Promise<{ id: string; name: string } | { problem: string }> {
  const wanted = asked.trim().toLowerCase();
  if (wanted === "not sorted" || wanted === "not sorted yet") return { id: NOT_SORTED_KIND, name: "Not sorted yet" };
  const all = (await readPageKinds(ctx, holdId))?.choices ?? [];
  const found = all.find((one) => one.name.trim().toLowerCase() === wanted);
  const close = all.filter((one) => one.name.toLowerCase().includes(wanted));
  const match = found ?? (close.length === 1 ? close[0] : null);
  if (match) return { id: match.id, name: match.name };
  // Not a classification, but a choice in the screen's menu all the same.
  if (/\b(search|basket|cart|checkout|account)/.test(wanted)) return { id: SHOP_PAGES_KIND, name: SHOP_PAGES_NAME };
  return { problem: all.length === 0 ? "This website's pages have no classifications yet." : `There is no classification called "${asked}". There are: ${all.map((one) => one.name).join(", ")}, ${SHOP_PAGES_NAME}, and Not sorted yet.` };
}

function rowOf(row: ShownRow) {
  return {
    name: row.title ? `${row.title} — ${pathOfAddress(row.label)}` : pathOfAddress(row.label),
    ...(row.source ? { source: row.source } : {}),
    visits: row.visits,
    pageViews: row.views,
    people: row.people,
    engagedPercent: percent(row.engagementRate),
    bouncePercent: percent(row.bounceRate),
    pagesPerVisit: row.pagesPerVisit === null ? null : Math.round(row.pagesPerVisit * 10) / 10,
    secondsEngagedPerVisit: row.timePerVisit === null ? null : Math.round(row.timePerVisit),
    conversions: row.conversions,
    value: money(row.value),
    changeInVisitsPercent: percent(row.change),
  };
}

/** A page group in plain words: the website's own classification, or Hakken's page type ("case study"). */
function kindWords(kind: string, name: string | null): string {
  if (name) return name;
  if (kind === NO_PAGE_KIND) return "no page recorded";
  if (kind === NOT_SORTED_KIND) return "unclassified";
  if (kind === OTHER_KIND) return "other classifications";
  return kind.toLowerCase().replace(/_/g, " ");
}

/**
 * A page's story as its redone screen shows it (page-screen-redo-plan-2026-11-03.md, step 5): the visits that started
 * on it, how far its readers got, its visitors by where they came from, who looks at it and its busiest days. A read of
 * its own (`part: "story"`), so a page's figures never run past Convex's second.
 */
function pageStoryParts(story: NonNullable<Awaited<ReturnType<typeof readPageStoryPart>>>["story"]) {
  if (story.live) return { storyNote: "Who looks at the page and where its visitors came from are asked of Google when the page's screen opens: open the link." };
  return {
    visitsThatStartedHere: story.started ? {
      visits: story.started.visits,
      visitsTheSpanBefore: story.started.visitsBefore,
      percentOfAllTheWebsitesVisits: percent(story.started.websiteVisits > 0 ? story.started.visits / story.started.websiteVisits : null),
    } : null,
    scrolledToTheBottomPercent: percent(story.read),
    ...(story.group ? { similarPages: story.group, similarPagesScrolledToTheBottomPercent: percent(story.groupRead) } : {}),
    visitsThatStartedHereByChannel: [...story.sources.reduce((into, row) => into.set(row.channel, (into.get(row.channel) ?? 0) + row.visits), new Map<string, number>())]
      .sort((a, b) => b[1] - a[1]).map(([channel, visits]) => ({ channel, visits })),
    bySource: story.sources.slice(0, ROWS).map((row) => ({
      source: row.name ?? (row.source === "(direct)" ? "typed in or a bookmark" : "not known"), channel: row.channel, visits: row.visits,
      pagesAVisit: row.pages, scrolledToTheBottomPercent: percent(row.read), cameBackPercent: percent(row.back), conversionsCountedEachTime: row.conversions,
    })),
    wentNext: story.next.slice(0, ROWS).map((row) => ({ went: row.kind === "again" ? "this page again" : row.kind === "left" ? "left the website" : pathOfAddress(row.address), views: row.views, sharePercent: percent(row.share) })),
    whoLooks: {
      devices: story.devices.map((row) => ({ device: row.device, percentOfViews: percent(row.share), wholeWebsitePercent: percent(row.websiteShare) })),
      countries: story.countries.slice(0, ROWS).map((row) => ({ country: row.code, people: row.people })),
      ages: { googleKnowsTheAgeOf: story.ages.readersPlaced, of: story.ages.readers, groups: story.ages.rows.map((row) => ({ age: row.key, percent: percent(row.share), wholeWebsitePercent: percent(row.websiteShare), conversions: row.conversions })) },
      genders: { googleKnowsTheGenderOf: story.genders.readersPlaced, of: story.genders.readers, groups: story.genders.rows.map((row) => ({ gender: row.key, percent: percent(row.share), wholeWebsitePercent: percent(row.websiteShare), conversions: row.conversions })) },
      note: "Shares are of the people Google could place, not of every visitor.",
    },
    busiestDaysOfTheWeek: story.weekdays.map((row) => ({ day: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][Number(row.day)] ?? row.day, views: row.views })),
  };
}

/**
 * Channels' parts above its table, as its screen shows them
 * (ga-channel-pages-plan.md CH9): the channel converting best over 12
 * months, the key events not counted, each channel by page group, and how
 * often a visit converts by channel — never money (Anthony, 2026-11-03).
 */
function channelsParts(top: Awaited<ReturnType<typeof readChannelsTop>>) {
  const names = new Map(top.map.kinds.map((kind) => [kind.kind, kindWords(kind.kind, kind.name)]));
  return {
    convertsBest: top.figures?.best ? { channel: top.figures.best.channel, conversionRatePercent: percent(top.figures.best.rate), websitePercent: percent(top.figures.best.siteRate), over: "the last 12 months" } : null,
    keyEventsNotCounted: top.figures?.uncounted.map((event) => ({ event: event.eventName, times: event.count, looksLikeAnEnquiry: event.enquiry })) ?? [],
    whereEachChannelLands: top.map.rows.map((row) => ({
      channel: row.channel,
      visits: row.visits,
      byKindOfPage: row.cells.filter((cell) => cell.visits > 0).map((cell) => ({ kindOfPage: names.get(cell.kind) ?? cell.kind, visits: cell.visits, conversions: cell.conversions })),
    })),
    conversionsAVisitByChannel: top.perVisit.rows.map((row) => ({
      channel: row.channel, visits: row.visits, conversions: row.conversions,
      conversionRatePercent: percent(row.visits > 0 ? row.conversions / row.visits : null),
      ...(row.fewVisits ? { note: "under 100 visits: too few to trust" } : {}),
    })),
    conversionsAVisitByChannelOver: "the last 12 months, every device",
  };
}

/**
 * A channel's own page above its table (CH3–CH8): its conversions started
 * and dwell time, where it lands by page group, the pages behind the change,
 * and AI assistants by how Google filed them.
 */
function channelParts(top: Awaited<ReturnType<typeof readChannelTop>>) {
  const figures = top.figures;
  return {
    conversionsItStarted: figures ? { now: figures.started, before: figures.startedBefore, rule: "conversions by people this channel brought first, on that visit or any later one" } : null,
    secondsEngagedPerVisit: figures && figures.visits > 0 ? Math.round(figures.seconds / figures.visits) : null,
    websiteSecondsEngagedPerVisit: figures && figures.siteVisits > 0 ? Math.round(figures.siteSeconds / figures.siteVisits) : null,
    whereItLands: top.kinds.map((kind) => ({ kindOfPage: kindWords(kind.kind, kind.name), pages: kind.pages, visits: kind.visits, visitsBefore: kind.visitsBefore, conversions: kind.conversions, conversionsBefore: kind.conversionsBefore })),
    pagesBehindTheChange: top.movers.map((page) => ({ page: page.address === "(not set)" ? "no page recorded" : pathOfAddress(page.address), visitsBefore: page.visitsBefore, visits: page.visits })),
    ...(top.assistants.length > 0 ? {
      assistantsByHowGoogleFiledThem: top.assistants.map((assistant) => ({ assistant: assistant.name, visits: assistant.visits, conversions: assistant.conversions, filedAs: assistant.filed })),
    } : {}),
  };
}

/** The list each list screen reads, and its segment in the address. */
const LISTS: Partial<Record<Screen, { list: "channel" | "source" | "campaign" | "adKeyword" | "landing" | "page"; segment: string }>> = {
  channels: { list: "channel", segment: "channels" },
  channel: { list: "source", segment: "channels/channel" },
  campaigns: { list: "campaign", segment: "campaigns" },
  adKeywords: { list: "adKeyword", segment: "campaigns" },
  landingPages: { list: "landing", segment: "funnel" },
  allPages: { list: "page", segment: "all-pages" },
};



export const googleAnalyticsInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    website: v.string(),
    screen: v.union(...ANALYTICS_SCREENS.map((screen) => v.literal(screen))),
    /** One of the screens' calendar periods (calendar-periods-plan.md, phase 6). */
    period: calendarPeriodValidator,
    /** One device; left out for every device. */
    device: v.optional(v.union(v.literal("desktop"), v.literal("mobile"), v.literal("tablet"))),
    /** One of the website's other home countries, as Search Console names it (`fra`); left out for the main one. */
    country: v.optional(v.string()),
    /** The channel, the page's address or path, or the event's Google name, for a screen of one. */
    key: v.optional(v.string()),
    /** Words to find in a list's names. */
    search: v.optional(v.string()),
    /** Visitors' list. */
    list: v.optional(v.union(...VISITOR_VIEWS.map((view) => v.literal(view)))),
    /** A screen's further read (`analyticsPartsOf`), which the tool asks after the rest. */
    part: v.optional(v.union(...ANALYTICS_PARTS.map((part) => v.literal(part)))),
    /** All pages: the order to read its pages in. Most views if left out. */
    order: v.optional(v.union(...ALL_PAGES_ORDER_NAMES.map((order) => v.literal(order)))),
    /** All pages: only one classification's pages, by its name, with their totals. */
    classification: v.optional(v.string()),
    /** All pages: only the pages that gained, dropped, stayed static or had no visits. */
    move: v.optional(v.union(...PAGE_MOVES.map((move) => v.literal(move)))),
    /** All pages: put the shop's search, basket and account pages back in, which it leaves out as the screen opens. */
    everyPage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false, problem: found.problem };
    const hold = found.held.hold;
    const host = found.held.summary.host;
    // Google gives a website's Analytics to its owner only: a competitor has none.
    if (isTrackedHold(hold)) {
      return { ok: false, problem: `Google Analytics covers the company's own websites only, and ${host} is a competitor. Its rankings, linking websites and AI answers can still be read from its Sites overview.` };
    }
    const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    if (!connection?.newestDay) {
      return { ok: false, problem: `${host} has no Google Analytics figures yet: it is not connected, or its first collection has not finished.` };
    }
    const site = reader(ctx, args.companyId);
    const siteId = hold._id;
    const period = args.period;
    const device = args.device ?? "";
    const common = { siteId, period, device, ...(args.country ? { country: args.country } : {}) };
    const currency = connection.currency ?? null;
    const query = new URLSearchParams({ period, ...(args.device ? { device: args.device } : {}), ...(args.country ? { country: args.country } : {}) });
    const linkTo = (segment: string, extra: Record<string, string> = {}) => {
      const withExtra = new URLSearchParams(query);
      for (const [key, value] of Object.entries(extra)) withExtra.set(key, value);
      return `/app/analytics/${siteId}${segment ? `/${segment}` : ""}?${withExtra.toString()}`;
    };
    const base = {
      ok: true,
      website: host,
      screen: args.screen,
      period,
      figuresTo: connection.newestDay,
      currency,
      rule: "These are the figures the screen shows. Give them with the link, in plain words; money is in the currency given, never hundredths.",
    };
    const asked = { message: "Figures for one device are asked of Google when the screen opens, so they are not held yet. Open the link to see them, or ask for every device." };

    // All pages' whole website: a read of its own, as the screen's is, and what its figures can be trusted for.
    if (args.part === "website") {
      const overview = await readOverview(site, common);
      const now = overview.now;
      if (!now) return { ...base };
      const before = overview.before;
      const perVisit = (figure: { views: number; visits: number } | null) => (figure && figure.visits > 0 ? Math.round((figure.views / figure.visits) * 10) / 10 : null);
      return {
        ...base,
        wholeWebsite: { pageViews: now.views, pageViewsBefore: before?.views ?? null, visits: now.visits, visitsBefore: before?.visits ?? null, pagesAVisit: perVisit(now), pagesAVisitBefore: perVisit(before) },
        ...viewsWarning(now, before),
      };
    }

    const list = LISTS[args.screen];
    if (list) {
      const allPages = args.screen === "allPages";
      const chosen = allPages && args.classification ? await classificationNamed(ctx, hold._id, args.classification) : null;
      if (chosen && "problem" in chosen) return { ok: false, problem: chosen.problem };
      const order = allPages && args.order ? ALL_PAGES_ORDERS[args.order] : null;
      // As the screen opens: without the shop's own pages, unless a search or the question reaches for them.
      const leaveOut = allPages && !chosen && !args.search && args.everyPage !== true;
      const answer = await readListPage(site, {
        ...common, list: list.list, ...(args.screen === "channel" ? { channel: args.key ?? "" } : {}), ...(args.search ? { q: args.search } : {}), page: 1, rows: ROWS,
        ...(order ?? {}), ...(chosen ? { group: chosen.id } : {}), ...(allPages && args.move ? { move: args.move } : {}), ...(leaveOut ? { leaveOut: true } : {}),
      });
      if (answer.live) return { ...base, ...asked, link: linkTo(list.segment) };
      const parts = args.screen === "channels" ? channelsParts(await readChannelsTop(site, common))
        : args.screen === "channel" && args.key ? channelParts(await readChannelTop(site, { ...common, channel: args.key }))
          : {};
      return {
        ...base,
        ...parts,
        listed: answer.total,
        // All pages has no money and counts each page's moves (all-pages-rethink-plan.md AP1, AP5), as its screen does.
        rows: list.list === "page" ? answer.rows.map(pageRowOf) : answer.rows.map(rowOf),
        ...(allPages ? { rows_are: `The first ${ROWS} of ${answer.total} pages, ${args.order ?? "mostViews"}.`, conversionsRule: PAGE_CONVERSIONS_RULE } : {}),
        ...(leaveOut && answer.shop && answer.shop.pages > 0 ? {
          leftOut: {
            what: "Search, basket and account pages. Say they're left out, as the screen does, and ask with everyPage to read them too. Never name one as a page that moved unless asked about them.",
            pages: answer.shop.pages, pageViews: answer.shop.views, pageViewsBefore: answer.shop.viewsBefore,
          },
        } : {}),
        ...(allPages && answer.bands ? {
          busyAndQuiet: {
            rule: `A busy page has ${answer.bands.busyVisits} visits or more on these dates, and a quiet page has fewer. Fewer or more means by ${MOVE_VIEWS} views or more.`,
            busyPages: answer.bands.busy, busyPagesWithFewerViews: answer.bands.busyFewer, quietPages: answer.bands.quiet, quietPagesWithMoreViews: answer.bands.quietMore,
          },
        } : {}),
        ...(allPages && answer.concentration ? {
          halfOfViews: {
            pagesThatMadeHalfTheViews: answer.concentration.pagesForHalf, pagesThatMadeHalfTheViewsBefore: answer.concentration.pagesForHalfBefore,
            pagesWithNoViews: answer.concentration.noViews, pagesWithNoViewsBefore: answer.concentration.noViewsBefore,
          },
        } : {}),
        ...(chosen && answer.groupTotals ? {
          classification: {
            name: chosen.name, pages: answer.total, pageViews: answer.groupTotals.views, pageViewsBefore: answer.groupTotals.viewsBefore,
            conversionsMadeHere: answer.groupTotals.conversions, conversionsMadeHereBefore: answer.groupTotals.conversionsBefore,
          },
        } : {}),
        ...(answer.moves ? { pagesByMove: { ...answer.moves, rule: `A gain or a drop is ${MOVE_VIEWS} views or more against the span before; no visits means nobody viewed the page.` } } : {}),
        ...(answer.untagged !== null ? { visitsFromNoTaggedLink: answer.untagged } : {}),
        ...(answer.figures ? { channelTotals: { visits: answer.figures.visits, visitsBefore: answer.figures.visitsBefore, conversions: answer.figures.conversions, value: money(answer.figures.value) } } : {}),
        ...(answer.thresholded ? { note: "Google held back some small groups to protect people's privacy." } : {}),
        link: linkTo(list.segment, {
          ...(args.screen === "channel" && args.key ? { key: args.key } : {}),
          ...(order ? { sort: order.sort, dir: order.direction } : {}),
          ...(allPages && args.move ? { move: args.move } : {}),
          ...(chosen ? { classification: chosen.id } : allPages && !leaveOut && !args.search ? { classification: "every" } : {}),
        }),
      };
    }

    switch (args.screen) {
      case "overview": {
        if (args.part === "pages") {
          const pages = await readOverviewPagePanels(site, common);
          return { ...base, ...(pages ? overviewPageParts(pages) : {}), link: linkTo("") };
        }
        const answer = await readOverview(site, common);
        const figures = (figure: typeof answer.now) => figure && {
          visits: figure.visits, pageViews: figure.views, people: figure.people, engagedVisits: figure.engaged,
          conversions: figure.conversions, value: money(figure.value),
        };
        const panels = await readOverviewPanels(site, common);
        return {
          ...base,
          from: answer.from, to: answer.to,
          now: figures(answer.now), theSpanBefore: figures(answer.before),
          ...viewsWarning(answer.now, answer.before),
          changedMost: answer.changedMost.map((row) => ({ name: row.title ?? pathOfAddress(row.label), kind: row.kind, conversionsChange: row.conversions, valueChange: money(row.value) })),
          // Its panels, as the screen shows them (ga-overview-plan.md OV2–OV8): each its first rows.
          ...(panels ? overviewPanelParts(panels) : {}),
          trackingHealth: connection.health
            ? { checks: connection.health.checks.length, needALook: connection.health.checks.filter((check) => !check.passing).map((check) => check.check) }
            : "not checked yet",
          link: linkTo(""),
        };
      }
      case "conversions": {
        const answer = await readConversions(site, common);
        // A classification by its name, as the screen names it (ga-conversions-visitors-plan.md CV3).
        const kindName = (kind: { kind: string; name: string | null }) => kind.name ?? (kind.kind === NO_PAGE_KIND ? "no page recorded" : kind.kind === OTHER_KIND ? "other classifications" : "unclassified");
        const flow = answer.flow && !answer.flow.collecting ? answer.flow : null;
        return {
          ...base,
          visits: answer.visits,
          kinds: answer.kinds.map((kind) => ({ event: kind.eventName, count: kind.count, countBefore: kind.countBefore, value: money(kind.value) })),
          keyEventsNotCounted: answer.fired.map((event) => ({ event: event.eventName, times: event.count })),
          // How visits reached a conversion: by channel and by the kind of page they landed on, as the flow draws it.
          ...(flow ? {
            byChannel: flow.channels.map((row) => ({ channel: row.key === "~more" ? `${row.more} more channels` : row.key, visits: row.visits, conversions: row.conversions })),
            byPageClassification: flow.kinds.map((row) => ({ classification: kindName(row), visits: row.visits, conversions: row.conversions })),
            eachEventByPageClassification: flow.grid.rows.map((row) => ({
              event: row.eventName, countsAsConversion: row.counted, times: row.count,
              byClassification: flow.grid.kinds.map((kind, at) => ({ classification: kindName(kind), times: row.cells[at] })).filter((cell) => cell.times > 0),
            })),
          } : {}),
          ...(answer.before && !answer.before.collecting ? {
            whatPeopleDidBeforeConverting: {
              over: "the last 12 months, every device",
              websitePercent: percent(answer.before.siteRate),
              actions: answer.before.rows.map((row) => ({ event: row.eventName, people: row.did, wentOnToConvert: row.then, percent: percent(row.then / row.did), ...(row.did < answer.before!.few ? { note: "under 100 people: too few to trust" } : {}) })),
            },
          } : {}),
          link: linkTo("conversions"),
        };
      }
      case "landingPage": {
        if (!args.key) return { ok: false, problem: "Say which page: its address or path." };
        const path = pathOfAddress(args.key.trim());
        const pages = await readListPage(site, { ...common, device: "", list: "landing", q: path.replace(/^\//, "") || "/", page: 1, rows: ROWS });
        const match = pages.rows.find((row) => pathOfAddress(row.label) === path) ?? pages.rows[0];
        if (!match) return { ok: false, problem: `No page of ${host} matching ${path} had visits in these dates.` };
        const answer = await readLandingPage(site, { ...common, page: match.key });
        return {
          ...base, page: answer?.address ?? match.label, title: answer?.title ?? null, figures: answer?.row ? rowOf(answer.row) : null,
          channels: answer && !answer.live ? answer.channels.slice(0, ROWS).map(rowOf) : null,
          ...(answer?.live ? { note: "Where its visits came from is asked of Google when its screen opens: open the link." } : {}),
          link: linkTo("landing-pages/page", { key: match.key }),
        };
      }
      case "page": {
        if (!args.key) return { ok: false, problem: "Say which page: its address or path." };
        // Found from the page list its screen reads, never All pages' search (`findPage`); the story's read is handed the
        // reference the first read found, so it never looks again.
        const match = await findPage(site, { ...common, device: "", page: args.key });
        if (!match) return { ok: false, problem: `No page of ${host} matching ${pathOfAddress(args.key.trim())} had visits in these dates.` };
        // As the redone screen shows it (page-screen-redo-plan-2026-11-03.md, step 5): its four boxes, its visitors by where
        // they came from, who looks at it and its busiest days. Never money, people as persons, time, the page before or
        // links clicked, which the screen no longer shows; conversions are Google's count of times, never a share of visits.
        // Three reads, as the screen reads them: its views here, its boxes and its story as their own parts after.
        const link = linkTo("all-pages/page", { key: match.key });
        if (args.part === "story") {
          // The finder's list is every device's: handed on only when the story is too.
          const told = await readPageStoryPart(site, { ...common, page: match.key }, device === "" ? match.pages : undefined);
          return { ...base, ...(told ? pageStoryParts(told.story) : {}), link };
        }
        if (args.part !== "boxes") {
          const answer = await readPageMain(site, { ...common, page: match.key });
          return {
            ...base, page: answer?.address ?? match.address, pageKey: match.key, title: answer?.title ?? null,
            views: answer?.row?.views ?? null,
            viewsTheSpanBefore: answer?.viewsBefore ?? null,
            link,
          };
        }
        const boxes = await readPageBoxes(site, { ...common, page: match.key });
        const product = boxes?.product ?? null;
        const sale = !product ? boxes?.sale ?? null : null;
        return {
          ...base,
          ...(product ? {
            productsSoldOnThisPage: {
              sizesAndFinishes: product.products,
              itemsAddedToBasket: product.itemsAdded,
              itemsBought: product.itemsBought,
              itemsBoughtTheSpanBefore: product.itemsBoughtBefore,
              percentOfEveryItemTheWebsiteSold: percent(product.websiteItemsBought > 0 ? product.itemsBought / product.websiteItemsBought : null),
            },
          } : {}),
          ...(sale ? {
            [sale.shop ? "visitorsWhoBought" : "visitorsWhoConverted"]: {
              event: sale.eventName,
              visits: sale.visits,
              percentOfVisitsThatStartedHere: percent(sale.startedVisits > 0 ? sale.visits / sale.startedVisits : null),
              wholeWebsitePercent: percent(sale.websiteVisits > 0 ? sale.websiteEventVisits / sale.websiteVisits : null),
            },
          } : {}),
          link,
        };
      }
      case "events": {
        const answer = await readEvents(site, common);
        if (!answer) return { ok: false, problem: `${host} has no Google Analytics figures yet.` };
        // Every event is listed on Conversions (ga-conversions-visitors-plan.md CV1).
        if (answer.live) return { ...base, ...asked, link: linkTo("conversions") };
        return {
          ...base,
          events: answer.rows.slice(0, 50).map((row) => ({ event: row.eventName, kind: row.kind, countsAsConversion: row.counted, times: row.times, people: row.people, visits: row.visits, timesBefore: row.timesBefore })),
          link: linkTo("conversions"),
        };
      }
      case "event": {
        if (!args.key) return { ok: false, problem: "Say which event, by Google's name for it: click, scroll, form_submit, …" };
        const answer = await readEvent(site, { ...common, event: args.key.trim() });
        if (!answer) return { ok: false, problem: `${host} has no Google Analytics figures yet.` };
        return {
          ...base,
          event: answer.eventName,
          countsAsConversion: answer.counted,
          figures: { ...answer.figures, peopleSharePercent: percent(answer.figures.peopleShare), visitsSharePercent: percent(answer.figures.visitsShare) },
          ...(answer.after ? { peopleWhoConvertedAfter: answer.after } : {}),
          whatItWasAbout: answer.live ? null : answer.about.slice(0, ROWS).map((row) => ({ name: row.label, times: row.times, people: row.people })),
          pagesItHappenedOn: answer.live ? null : answer.pages.slice(0, ROWS).map((row) => ({ page: row.title ?? pathOfAddress(row.label), times: row.times })),
          ...(answer.live ? { note: "What it was about and the pages it happened on are asked of Google when its screen opens: open the link." } : {}),
          link: linkTo("events/event", { key: answer.eventName }),
        };
      }
      case "visitors": {
        const answer = await readVisitors(site, common);
        if (!answer) return { ok: false, problem: `${host} has no Google Analytics figures yet.` };
        // The screen opens on new or returning (ga-conversions-visitors-plan.md CV7).
        const view = args.list ?? "visitorType";
        const listed = await readListPage(site, { ...common, list: view, page: 1, rows: ROWS });
        const map = await readVisitorMap(site, { ...common, list: view });
        const kindNames = new Map((map?.kinds ?? []).map((kind) => [kind.kind, kind.name ?? (kind.kind === NO_PAGE_KIND ? "no page recorded" : kind.kind === OTHER_KIND ? "other classifications" : "unclassified")]));
        const landsOf = new Map((map?.rows ?? []).filter((row) => row.lands).map((row) => [row.key, { classification: kindNames.get(row.lands!.kind) ?? row.lands!.kind, sharePercent: percent(row.lands!.share) }]));
        // Visits as the screen draws it (visits-redo-plan-2026-11-03.md, step 3): every figure in visits or views, the span
        // before beside it — the boxes, who visits by the list chosen, and what people looked at by page group.
        const bars = await readVisitorBars(site, { ...common, list: view });
        const looked = await readPageKindViews(site, common);
        const figures = answer.figures;
        return {
          ...base,
          figures: figures ? {
            visits: figures.visits, visitsBefore: figures.visitsBefore,
            newVisits: figures.newVisits, newVisitsBefore: figures.newVisitsBefore,
            returningVisits: figures.returningVisits, returningVisitsBefore: figures.returningVisitsBefore,
            visitsAPerson: figures.people > 0 ? Math.round((figures.visits / figures.people) * 10) / 10 : null,
          } : null,
          googleSignals: answer.signals,
          whoVisits: bars && !bars.waiting ? bars.rows.slice(0, ROWS).map((row) => ({ name: row.key, visits: row.visits, visitsBefore: row.visitsBefore })) : null,
          whatPeopleLookedAt: looked && !looked.waiting && looked.sorted
            ? looked.kinds.map((kind) => ({ pageGroup: kind.name ?? "not sorted yet", views: kind.views, pages: kind.pages }))
            : null,
          [view]: listed.live ? null : listed.rows.map((row) => ({ name: row.label, people: row.people, visits: row.visits, engagedPercent: percent(row.engagementRate), conversions: row.conversions, landsMostOn: landsOf.get(row.key) ?? null })),
          ...(answer.missing.length > 0 || listed.live ? asked : {}),
          link: linkTo("visits", { view }),
        };
      }
      case "products": {
        const answer = await readProducts(site, common);
        if (!answer?.shop) return { ok: false, problem: `${host} is not a shop: Google Analytics recorded no products looked at, added to a basket or bought this quarter or last.` };
        const table = await shownProductList(ctx, hold, { ...common, ...(args.search ? { q: args.search } : {}) });
        const chart = await productChart(ctx, hold, common);
        // As the screen shows them (products-screen-4-plan-2026-11-02.md): visits and items, no money, because not
        // every Google Analytics account records revenue; the steps and sale the company picked.
        const sale = answer.journey.sale;
        const product = (row: (typeof table.rows)[number]) => ({
          name: row.name, category: row.category, itemsBought: row.itemsBought, itemsAddedToBasket: row.itemsAdded,
          itemsLeftInBasket: row.itemsLeft, shareOfItemsBoughtPercent: percent(row.share), itemsBoughtTheSpanBefore: row.itemsBoughtBefore,
        });
        return {
          ...base,
          rule: "These are the figures the screen shows. Give them with the link, in plain words. Products counts visits and items, never money.",
          stepsPickedBy: answer.choice.saved ? "the company" : "Google's own event names, until the company picks its own",
          steps: answer.journey.steps.map((step) => ({
            event: step.eventName, visits: step.visits, visitsTheSpanBefore: step.visitsBefore,
            // The visits left, as the page's boxes count them, so an answer never works them out from the share.
            visitsLeftWithoutTheSale: sale ? Math.max(0, step.visits - sale.visits) : null,
            leftWithoutTheSalePercent: sale ? percent(leftWithout(step.visits, sale.visits)) : null,
          })),
          sale: sale && { event: sale.eventName, visits: sale.visits, visitsTheSpanBefore: sale.visitsBefore },
          productsAddedNeverBought: answer.neverBought,
          products: table.rows.slice(0, ROWS).map(product),
          mostLeftInBaskets: chart.left.slice(0, 5).map(product),
          sellingMore: chart.more.slice(0, 5).map(product),
          sellingLess: chart.less.slice(0, 5).map(product),
          link: linkTo("products"),
        };
      }
      default:
        return { ok: false, problem: "That screen is not one Google Analytics has." };
    }
  },
});

/** Whether a website is one of the company's own, connected: Live's ask needs its id. */
export const liveHoldInternal = internalQuery({
  args: { companyId: v.id("companies"), website: v.string() },
  handler: async (ctx, args) => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false as const, problem: found.problem };
    if (isTrackedHold(found.held.hold)) return { ok: false as const, problem: `Google Analytics covers the company's own websites only, and ${found.held.summary.host} is a competitor.` };
    return { ok: true as const, siteId: found.held.hold._id, host: found.held.summary.host };
  },
});

/**
 * Who is on one of the company's websites right now and the last 30 minutes,
 * asked of Google as the Live page asks it; nothing is kept.
 */
export const googleAnalyticsLiveInternal = internalAction({
  args: {
    companyId: v.id("companies"),
    website: v.string(),
    device: v.optional(v.union(v.literal("desktop"), v.literal("mobile"), v.literal("tablet"))),
    list: v.optional(v.union(...LIVE_LISTS.map((list) => v.literal(list)))),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const hold = await ctx.runQuery(internal.assistantAnalyticsReads.liveHoldInternal, { companyId: args.companyId, website: args.website });
    if (!hold.ok) return hold;
    const answer = await askLiveFigures(ctx, args.companyId, { siteId: hold.siteId, device: args.device ?? "", list: args.list ?? "pages" });
    if (!answer.ok) {
      return { ok: false, problem: answer.problem === "NOT_CONNECTED" ? `${hold.host} has no Google Analytics connected.` : "Google couldn't answer just now; try again in a minute." };
    }
    return {
      ok: true,
      website: hold.host,
      askedAt: new Date(answer.askedAt).toISOString(),
      onTheWebsiteNow: answer.now,
      peopleInTheLast30Minutes: answer.people,
      pageViewsInTheLast30Minutes: answer.views,
      conversionsInTheLast30Minutes: answer.conversions,
      places: answer.places.slice(0, 10).map((row) => ({ town: row.name, people: row.people })),
      countries: answer.countries.slice(0, 10).map((row) => ({ country: row.name, people: row.people })),
      [args.list ?? "pages"]: answer.rows.slice(0, ROWS),
      rule: "Live figures are Google's, asked just now and never kept; pages are named by title. Every country counts; `countries` splits the people by two-letter country code. Say they are live.",
      link: `/app/analytics/${hold.siteId}/live`,
    };
  },
});
