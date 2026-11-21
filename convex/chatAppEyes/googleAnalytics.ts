import type { Id } from "../_generated/dataModel";
import { readCampaignActions } from "../googleAnalyticsCampaignReads";
import { readChannelSquares, readChannelSteps, readChannelsEachDay } from "../googleAnalyticsChannelPageReads";
import { readChannelDays, readChannelTop } from "../googleAnalyticsChannelReads";
import { readCampaignChart, readChart, readPeriodBeforeChart } from "../googleAnalyticsChartReads";
import { readConversionsPages } from "../googleAnalyticsConversionsMap";
import { readEvent, readEvents } from "../googleAnalyticsEventReads";
import { readLandingFlow } from "../googleAnalyticsFlowReads";
import { readOverviewPagePanels } from "../googleAnalyticsOverviewReads";
import { readOverviewSplit } from "../googleAnalyticsOverviewSplits";
import { type PageBoxes, readPageBoxes } from "../googleAnalyticsPageBoxes";
import { readPageChannelExplorer } from "../googleAnalyticsPageChannels";
import { readPageKindViews } from "../googleAnalyticsPageKindViews";
import { readPageKey, readPageMain, readPageStoryPart } from "../googleAnalyticsPageReads";
import { readProductChart, readProductList, readProducts } from "../googleAnalyticsProductReads";
import { readConversions, readListPage, readOverview } from "../googleAnalyticsReads";
import { connectionOf } from "../googleAnalyticsRows";
import { type ServiceDaysAnswer, type ServicesAnswer, readServiceDays, readServices } from "../googleAnalyticsServiceReads";
import { readVisitorDays, readVisitorGroups, readVisitors } from "../googleAnalyticsVisitorReads";
import { readSeesFindings } from "../seesFindings";
import { type SiteReader, findMySite } from "../siteAccess";
import { stepOf } from "../utils/calendarPeriods";
import { isShop, squaresOutOf } from "../utils/conversionSteps";
import { type BoxNames, flowBoxes } from "../utils/landingFlowRoutes";
import { NOT_SORTED_KIND } from "../utils/pageKinds";
import { servicesEyeData } from "../utils/sees/analyticsServices";
import {
  EYE_MOVERS, allPagesEyeData, classificationName, classificationsForEye, pageMapForEye, pageMapRows, pageNameWith,
  viewsADayForEye,
} from "../utils/sees/eyeData/googleAnalyticsAllPages";
import {
  EYE_CAMPAIGNS, MAP_CAMPAIGNS, campaignMapForEye, campaignMapRows, campaignNamesFrom, campaignsByDayForEye,
  campaignsEyeData, noCampaigns, whatPeopleDidForEye,
} from "../utils/sees/eyeData/googleAnalyticsCampaigns";
import { channelEyeData, channelTitle, openingChannelList } from "../utils/sees/eyeData/googleAnalyticsChannel";
import {
  type ChannelSquares, type ChannelSteps, type ChannelsEachDay, type ChannelsList, type ChannelsOverview,
  EVERY_CHANNEL, channelSquaresForEye, channelStepsForEye, channelsByDayForEye, channelsEyeData, kindNameFrom, sellsOf,
  squareKindName, squareKinds,
} from "../utils/sees/eyeData/googleAnalyticsChannels";
import { conversionPagesEyeData, conversionsEyeData, eventEyeData, squareOfKey } from "../utils/sees/eyeData/googleAnalyticsConversions";
import { flowForEye, funnelEyeData, leftEachDayForEye } from "../utils/sees/eyeData/googleAnalyticsFunnel";
import { ANALYTICS_EYE_NAMES, firstStepOf, overviewEyeData, overviewWordsFrom } from "../utils/sees/eyeData/googleAnalyticsOverview";
import { pageAnswerOf, pageEyeData } from "../utils/sees/eyeData/googleAnalyticsPage";
import { productsEyeData } from "../utils/sees/eyeData/googleAnalyticsProducts";
import {
  OPENING_SERVICES_VIEW, serviceDaysArgs, serviceGroupsFrom, serviceMonthLines, serviceMonthPicks, servicesBoxed,
  servicesDotsForEye, servicesEachStepForEye, servicesMapForEye,
} from "../utils/sees/eyeData/googleAnalyticsServices";
import { eyeWithParts, websiteForEye, withoutMoney } from "../utils/sees/eyeData/googleAnalyticsShared";
import { type VisitsEyeReads, visitsEyeData } from "../utils/sees/eyeData/googleAnalyticsVisits";
import type { Finding } from "../utils/sees/findings";
import { englishNames, englishWords, pluralWords } from "../utils/sees/serverWords";
import { groupNameInEnglish } from "../utils/serviceGroups";
import { PAGE_TYPES } from "../utils/siteShapes";
import type { EyeAsk, EyeBuilders, EyeReads, EyeRun } from "./types";

/**
 * Google Analytics' screens for a chat app's question, built as the screens
 * build them (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The
 * reads are the screens' own reader helpers, each run in its own query for the
 * pass's company (`chatAppEyeReads.ts`); the figures come from the same pure
 * functions the screens call; the words are English, from `messages/en.json`.
 * Live is left out: it reads Google's real-time figures, which a chat app's
 * question never asks for.
 */

/** The connection's parts the eye reads: its state and newest day, its events and Auto Setup's names for them, its health and whether it's a shop. */
async function connectionForEye(reader: SiteReader, args: Record<string, unknown>) {
  const site = await findMySite(reader, args.siteId as Id<"companyWebsites">);
  if (!site) return null;
  const connection = await connectionOf(reader, site.hold._id);
  if (!connection) return null;
  return {
    status: connection.status,
    newestDay: connection.newestDay ?? null,
    shop: connection.shop === true,
    health: connection.health ?? null,
    events: (connection.events ?? []).map((event) => ({ eventName: event.eventName, firstStep: event.firstStep, plainName: event.plainName ?? null, counted: event.counted === true })),
  };
}

type Connection = NonNullable<Awaited<ReturnType<typeof connectionForEye>>>;
type Overview = Awaited<ReturnType<typeof readOverview>>;

/**
 * The connection, when the website has figures to show, as the screens' gate decides (`hasFigures`, `AnalyticsGate`):
 * collected once, and not while its conversions are being chosen or counted. Null leaves the screen with nothing.
 */
async function connectionWithFigures(run: EyeRun, siteId: Id<"companyWebsites">): Promise<Connection | null> {
  const connection = await run("ga.connection", { siteId }) as Connection | null;
  if (!connection?.newestDay || connection.status === "CHOOSING" || connection.status === "COUNTING") return null;
  return connection;
}

/** What every screen's reads take as it opens: the dates asked for, every device, the main country (`useAnalyticsArgs`). */
function openingArgs({ siteId, period }: EyeAsk) {
  return { siteId, period, device: "" };
}

/** Auto Setup's own names for the events, by Google's name. */
function plainEventNamesOf(connection: Connection): Record<string, string> {
  return Object.fromEntries(connection.events.flatMap((event) => (event.plainName ? [[event.eventName, event.plainName]] : [])));
}

/** The English words a Google Analytics screen's figures are named in, with Auto Setup's own names for the events. */
function englishFor(connection: Connection) {
  return overviewWordsFrom({
    eyeNames: englishWords("googleAnalytics.eyeNames"),
    events: englishWords("googleAnalytics.events"),
    devices: englishWords("googleAnalytics.filters.devices"),
    visitors: englishWords("googleAnalytics.visitors.names"),
    overviewNames: englishWords("googleAnalytics.overview.names"),
    plainEventNames: plainEventNamesOf(connection),
    locale: "en",
  });
}

/** An event in English words, as `useEventName` names it: Auto Setup's name, the app's, else Google's made readable. */
function englishEventName(connection: Connection): (eventName: string) => string {
  return englishFor(connection).eventName;
}

/** The names a page's own findings use ("The whole website"), as `useEyeNames` reads them, in English. */
export function englishEyeNames(): Record<string, string> {
  return englishNames("googleAnalytics.eyeNames", ANALYTICS_EYE_NAMES);
}

/** A thing people did, as Channels and Campaigns say it (`useThingDone`): "Added to basket", "Bought", any other by its own name. */
function englishThingDone(connection: Connection) {
  const did = englishWords("googleAnalytics.campaigns.squares.did");
  const eventName = englishEventName(connection);
  return (name: string) => (did.has(name) ? did(name) : eventName(name));
}

/** A table's page as the screen opens it (`AnalyticsTable`, `useSiteListPage`): page 1 of 25 rows. */
const OPENING_PAGE = { page: 1, rows: 25 } as const;

// Visits and Products.

const VISITS_EYE_READS: EyeReads = {
  "ga.visits.visitors": (reader, args) => readVisitors(reader, args as never),
  "ga.visits.groups": (reader, args) => readVisitorGroups(reader, args as never),
  "ga.visits.days": (reader, args) => readVisitorDays(reader, args as never),
  "ga.visits.pageKinds": (reader, args) => readPageKindViews(reader, args as never),
  "ga.products.products": (reader, args) => readProducts(reader, args as never),
  "ga.products.list": (reader, args) => readProductList(reader, args as never),
  "ga.products.chart": (reader, args) => readProductChart(reader, args as never),
};

/** Visits' words in English, as the page and its panels name things (`googleAnalytics.visitors`). */
function visitsWords() {
  const t = englishWords("googleAnalytics.visitors");
  const names = englishWords("googleAnalytics.visitors.names");
  return {
    names: { new: t("newVisits"), returning: t("returningVisits"), website: t("eyeWebsite") },
    visitorWord: (key: string) => (names.has(key) ? names(key) : null),
    days: { newName: t("line.new"), returningName: t("line.returning"), weekendName: t("line.eyeWeekend"), weekdayName: t("line.eyeWeekday") },
    notSortedName: t("kinds.notSorted"),
  };
}

const VISITS_EYES: EyeBuilders = {
  /**
   * Visits (`visits/page.tsx`): the boxes and the table on New and returning, as it opens, with its panels' figures
   * (every list's groups, the days, what people looked at).
   */
  "googleAnalytics.visitors": async (run, ask) => {
    if (!await connectionWithFigures(run, ask.siteId)) return null;
    const args = openingArgs(ask);
    const [visitors, list, groups, days, kinds] = await Promise.all([
      run("ga.visits.visitors", args),
      run("ga.listPage", { ...args, list: "visitorType", sort: "visits", direction: "desc", ...OPENING_PAGE }),
      run("ga.visits.groups", args),
      run("ga.visits.days", args),
      run("ga.visits.pageKinds", args),
    ]);
    return visitsEyeData({ visitors, list, groups, days, kinds } as VisitsEyeReads, visitsWords());
  },
  /**
   * Products (`products/page.tsx`), only for a shop: the boxes and steps the shop picked, the table by product as it
   * opens (items bought, most first) and the chart on Left in baskets, for every category.
   */
  "googleAnalytics.products": async (run, ask) => {
    const connection = await connectionWithFigures(run, ask.siteId);
    if (!connection?.shop) return null;
    const args = openingArgs(ask);
    type Products = Awaited<ReturnType<typeof readProducts>>;
    type Table = Awaited<ReturnType<typeof readProductList>>;
    type Chart = Awaited<ReturnType<typeof readProductChart>>;
    const [products, table, chart] = await Promise.all([
      run("ga.products.products", args) as Promise<Products>,
      run("ga.products.list", { ...args, view: "products", show: "all", sort: "itemsBought", direction: "desc", ...OPENING_PAGE }) as Promise<Table | null>,
      run("ga.products.chart", args) as Promise<Chart | null>,
    ]);
    const t = englishWords("googleAnalytics.products");
    return productsEyeData({ products, table, chart }, { eventName: englishEventName(connection), neverBoughtName: t("neverBought"), othersName: t("table.eyeOthers") });
  },
};

// Conversions, the pages behind a square, and an event's own screen.

const CONVERSIONS_EYE_READS: EyeReads = {
  "ga.conversions.read": (reader, args) => readConversions(reader, args as never),
  "ga.conversions.events": (reader, args) => readEvents(reader, args as never),
  "ga.conversions.pages": (reader, args) => readConversionsPages(reader, args as never),
  /** The Conversions map's findings, as the eye reads them on a screen that asks the Insights team (`seesFindings`). */
  "ga.conversions.findings": (reader, args) => readSeesFindings(reader, args as never),
  "ga.event.read": (reader, args) => readEvent(reader, args as never),
};

type EventAnswer = Awaited<ReturnType<typeof readEvent>>;

/** The event a chat app asks about, by Google's own name (`purchase`), as the event's screen reads it from its address. */
async function eventOf(run: EyeRun, ask: EyeAsk): Promise<EventAnswer> {
  if (!ask.key) return null;
  if (!(await connectionWithFigures(run, ask.siteId))) return null;
  return await run("ga.event.read", { ...openingArgs(ask), event: ask.key }) as EventAnswer;
}

/** The Conversions map's findings for the dates, every device and the main country, as the eye reads them (`seesFindings`). */
const mapFindings = (run: EyeRun, ask: EyeAsk) => run("ga.conversions.findings", openingArgs(ask)) as Promise<Finding[]>;

const CONVERSIONS_EYES: EyeBuilders = {
  /** Conversions (`conversions/page.tsx`): its read, and the events table's own as `eventsTable`. */
  "googleAnalytics.conversions": async (run, ask) => {
    if (!(await connectionWithFigures(run, ask.siteId))) return null;
    const args = openingArgs(ask);
    const [conversions, events] = await Promise.all([run("ga.conversions.read", args), run("ga.conversions.events", args)]);
    return conversionsEyeData(conversions, events);
  },
  /**
   * The pages behind a square (`conversions/pages/page.tsx`). Its key is the screen's own address,
   * `event=purchase&by=channel&key=Organic Search`: the conversion, the map's column (page kind unless another) and the
   * square's key in it. Null without a conversion.
   */
  "googleAnalytics.conversionPages": async (run, ask) => {
    const square = squareOfKey(ask.key);
    if (!square) return null;
    if (!(await connectionWithFigures(run, ask.siteId))) return null;
    const answer = await run("ga.conversions.pages", { ...openingArgs(ask), columns: square.columns, key: square.key, eventName: square.eventName }) as Awaited<ReturnType<typeof readConversionsPages>>;
    return conversionPagesEyeData(answer, englishEyeNames());
  },
  /** An event's own screen (`events/event/page.tsx`), by Google's name for the event: a counted one as `ConversionScreen` hands it. */
  "googleAnalytics.event": async (run, ask) => eventEyeData(await eventOf(run, ask)),
};

/**
 * The findings a screen's eye shows where they aren't worked out from its figures (`pageFindings`): Conversions with
 * something counted, and a counted event's own screen, ask the Insights team, and their eye shows the Conversions map's
 * findings for the whole website (`HakkenSeesEye`, `seesFindings`). Null where the screen works its findings out from
 * its figures, as every other screen does.
 */
export const GOOGLE_ANALYTICS_SERVER_FINDINGS: Record<string, (run: EyeRun, ask: EyeAsk) => Promise<Finding[] | null>> = {
  "googleAnalytics.conversions": async (run, ask) => {
    const connection = await connectionWithFigures(run, ask.siteId);
    // Nothing counted yet: the screen shows Nothing counted, which asks no one, so its findings come from its figures.
    if (!connection?.events.some((event) => event.counted)) return null;
    return await mapFindings(run, ask);
  },
  "googleAnalytics.event": async (run, ask) => ((await eventOf(run, ask))?.counted ? await mapFindings(run, ask) : null),
};

// Channels and a channel's own screen, at the screen's opening view: every device, the main country, the chart's own
// step, no ticks.

const CHANNELS_EYE_READS: EyeReads = {
  "ga.channels.eachDay": (reader, args) => readChannelsEachDay(reader, args as never),
  "ga.channels.squares": (reader, args) => readChannelSquares(reader, args as never),
  "ga.channels.steps": (reader, args) => readChannelSteps(reader, args as never),
  "ga.channel.top": (reader, args) => readChannelTop(reader, args as never),
  "ga.channel.days": (reader, args) => readChannelDays(reader, args as never),
};

const PAGE_TYPE_LIST: readonly string[] = PAGE_TYPES;

/** A Classification column's name in English, as the squares name it (`ChannelSquaresCard`, `useKindName`, `usePageKinds`). */
function englishSquareKindName(read: ChannelSquares | null) {
  const squares = englishWords("googleAnalytics.channelsPage.squares");
  const kinds = englishWords("googleAnalytics.channelPage.kinds");
  const common = englishWords("sites.common");
  const label = (kind: string) => (kind === NOT_SORTED_KIND ? common("notSorted") : PAGE_TYPE_LIST.includes(kind) ? common(`pageTypes.${kind}`) : "–");
  const kindName = kindNameFrom(squareKinds(read), { noPage: kinds("noPage"), other: kinds("other") }, label);
  return squareKindName({ otherGroups: squares("otherGroups"), notSorted: squares("notSorted"), noPage: squares("noPage") }, kindName);
}

const CHANNELS_EYES: EyeBuilders = {
  /** Channels (`channels/page.tsx`, `ChannelsSees`, and `ChannelsParts.tsx`'s panels). */
  "googleAnalytics.channelsPage": async (run, ask) => {
    const connection = await connectionWithFigures(run, ask.siteId);
    if (!connection) return null;
    const args = openingArgs(ask);
    const [every, overview] = await Promise.all([
      run("ga.listPage", { ...args, list: "channel", sort: "visits", direction: "desc", page: 1, rows: EVERY_CHANNEL }) as Promise<(ChannelsList & { total: number }) | null>,
      run("ga.overview", args) as Promise<Overview>,
    ]);
    if (!every) return null;
    const sells = sellsOf(overview as ChannelsOverview);
    const data = channelsEyeData({ every, overview: overview as ChannelsOverview, sells, website: websiteForEye(overview) }, { names: englishEyeNames() });
    // No channel in these dates: the page draws no charts, so they add nothing.
    if (every.total === 0) return eyeWithParts(data);
    const [eachDay, byKind, byDevice, steps] = await Promise.all([
      run("ga.channels.eachDay", args) as Promise<ChannelsEachDay | null>,
      run("ga.channels.squares", { ...args, split: "kind" }) as Promise<ChannelSquares | null>,
      run("ga.channels.squares", { ...args, split: "device" }) as Promise<ChannelSquares | null>,
      // A website with nothing bought draws no steps.
      sells ? run("ga.channels.steps", args) as Promise<ChannelSteps | null> : Promise.resolve(null),
    ]);
    const devices = englishWords("googleAnalytics.filters");
    const stepWords = englishWords("googleAnalytics.channelsPage.steps");
    return eyeWithParts(data, {
      channelsByDay: channelsByDayForEye(eachDay, stepOf(ask.period), englishThingDone(connection)),
      channelSquares: channelSquaresForEye(byKind, englishSquareKindName(byKind)),
      channelDevices: channelSquaresForEye(byDevice, (key) => devices(`devices.${key}`)),
      channelSteps: channelStepsForEye(steps, { arrived: stepWords("arrived"), stayed: stepWords("stayed"), basket: stepWords("basket"), checkout: stepWords("checkout"), bought: stepWords("bought") }),
    });
  },

  /** A channel's own screen (`channels/channel/page.tsx`), for the channel in `ask.key`, with its table's opening view. */
  "googleAnalytics.channelPage": async (run, ask) => {
    const channel = ask.key?.trim();
    if (!channel) return null;
    if (!(await connectionWithFigures(run, ask.siteId))) return null;
    const args = { ...openingArgs(ask), channel };
    const [top, days, table] = await Promise.all([
      run("ga.channel.top", args) as Promise<{ figures: unknown } | null>,
      run("ga.channel.days", args),
      run("ga.listPage", { ...args, list: openingChannelList(channel), sort: "visits", direction: "desc", ...OPENING_PAGE }),
    ]);
    if (!top?.figures) return null;
    const title = channelTitle(channel, englishWords("googleAnalytics.channel")("assistantsTitle"));
    // The table's rows still carry money for others: never for the eye, as `AnalyticsTable` hands them.
    return eyeWithParts(channelEyeData({ top, days }, { names: englishEyeNames(), title }), { channelTable: table ? withoutMoney(table) : null });
  },
};

// Campaigns and Services: each page's own figures and every panel's part, at the screen's opening view (every
// device, the main country, the first of each menu, nothing ticked).

type ListPage = Awaited<ReturnType<typeof readListPage>>;

const CAMPAIGNS_EYE_READS: EyeReads = {
  "ga.campaigns.chart": (reader, args) => readCampaignChart(reader, args as never),
  "ga.campaigns.actions": (reader, args) => readCampaignActions(reader, args as never),
  "ga.services": (reader, args) => readServices(reader, args as never),
  "ga.services.days": (reader, args) => readServiceDays(reader, args as never),
};

const CAMPAIGNS_EYES: EyeBuilders = {
  /** Campaigns (`campaigns/page.tsx`, `CampaignsSees`), with its three charts' parts (`CampaignParts.tsx`). */
  "googleAnalytics.campaigns": async (run, ask) => {
    const connection = await connectionWithFigures(run, ask.siteId);
    if (!connection) return null;
    const args = openingArgs(ask);
    const campaignList = (sort: "visits", rows: number) => run("ga.listPage", { ...args, list: "campaign", sort, direction: "desc", page: 1, rows }) as Promise<ListPage>;
    const [every, overview, chart, mapList, actions] = await Promise.all([
      campaignList("visits", EYE_CAMPAIGNS),
      run("ga.overview", args) as Promise<Overview>,
      run("ga.campaigns.chart", args) as Promise<Awaited<ReturnType<typeof readCampaignChart>>>,
      campaignList("visits", MAP_CAMPAIGNS),
      run("ga.campaigns.actions", args) as Promise<Awaited<ReturnType<typeof readCampaignActions>>>,
    ]);
    const names = campaignNamesFrom(englishWords("googleAnalytics.campaigns"));
    const sells = isShop(connection.shop, overview?.now?.purchases, overview?.before?.purchases);
    const data = campaignsEyeData({ every, overview, website: websiteForEye(overview), sells }, { names: englishEyeNames(), campaigns: names });
    // No campaign in these dates: the page draws none of its charts, so none hands the eye anything.
    if (noCampaigns(every)) return eyeWithParts(data);
    return eyeWithParts(data, {
      campaignsByDay: campaignsByDayForEye(chart),
      campaignMap: campaignMapForEye(mapList, "visits", campaignMapRows(mapList, "visits"), names),
      whatPeopleDid: whatPeopleDidForEye(actions, englishThingDone(connection), names.name),
    });
  },

  /** Services (`services/page.tsx`, `ServicesSees`), with its month chart's, dots' and map's parts (`ServiceParts.tsx`). */
  "googleAnalytics.services": async (run, ask) => {
    const connection = await connectionWithFigures(run, ask.siteId);
    if (!connection) return null;
    const args = openingArgs(ask);
    const answer = await run("ga.services", args) as ServicesAnswer;
    // Nothing collected, or no Service-type Classification: the page says so, and has no eye.
    if (answer.state !== "ready") return null;
    // The groups as the page opens, named as `messages/en.json` names them (`googleAnalytics.services.groups`).
    const groups = serviceGroupsFrom(answer, OPENING_SERVICES_VIEW, (group, split) => groupNameInEnglish(group, split));
    const data = servicesEyeData(answer, englishEyeNames(), groups.names);
    const picks = serviceMonthPicks(answer, groups.services, { show: "visits", lines: "service", pickedServices: null, pickedChannels: null });
    const days = picks.chosen.length > 0 ? await run("ga.services.days", { ...args, ...serviceDaysArgs(picks) }) as ServiceDaysAnswer : null;
    const { main } = serviceMonthLines(days, picks, { show: "visits", against: "nothing", comparing: false }, { these: "", website: "", before: (name) => name }, { lines: [""], one: "", website: "" });
    return eyeWithParts(data, {
      servicesEachStep: servicesEachStepForEye(days, "visits", picks.linesBy, main, stepOf(ask.period)),
      servicesDots: servicesDotsForEye(groups, OPENING_SERVICES_VIEW.across, OPENING_SERVICES_VIEW.doing),
      servicesMap: servicesMapForEye(servicesBoxed(groups, "visits").boxed, "visits", "visits", answer.hasBefore),
    });
  },
};

// Funnel and All pages, each as the screen opens: every device, the main country, the Classification menu leaving
// the shop's own pages out, nothing ticked, the opening sort, page 1 of 25 rows.

const PAGES_EYE_READS: EyeReads = {
  "ga.funnel.flow": (reader, args) => readLandingFlow(reader, args as never),
  "ga.funnel.panels": (reader, args) => readOverviewPagePanels(reader, args as never),
  "ga.allPages.kindViews": (reader, args) => readPageKindViews(reader, args as never),
};

/** The map's pages: the busiest forty (`AllPagesParts.MAP_PAGES`). */
const MAP_PAGES = 40;

type ListAnswer = { preparing?: boolean; rows: never[] } & Record<string, unknown>;
type Flow = Awaited<ReturnType<typeof readLandingFlow>>;
type Chart = { points: Array<{ day: string; lastDay?: string; visits: number; engaged: number; views: number; conversions: number }> };
type ChartBefore = Chart & { held: boolean };

/** A list's page as the screen shows it: none while the server is still building it (`useSiteListPage`). */
const shownList = (answer: ListAnswer | null) => (answer && !answer.preparing ? answer : null);

/**
 * A plural in the English words, as the screen's words say it: `{count, plural, one {# other group} other {# other
 * groups}}` for 12 is "12 other groups". `englishWords` takes only a plain hole, so the branch is picked here.
 */
function englishCount(template: string, count: number): string {
  const block = /^\{(\w+), plural, (.*)\}$/.exec(template.trim());
  return block ? pluralWords(block[2], count) : template;
}

/** The route chart's names that aren't a page's or a Classification's own, in English (`googleAnalytics.chart.flow`). */
function englishBoxNames(): BoxNames {
  const t = englishWords("googleAnalytics.chart.flow");
  return { shop: t("shop"), notSorted: t("notSorted"), otherPages: t("otherPages"), otherGroups: (count) => englishCount(t("otherGroups"), count), pageNotKnown: t("pageNotKnown") };
}

const PAGES_EYES: EyeBuilders = {
  /** Funnel (`funnel/page.tsx`: `FunnelSees`, with `LeftEachDayCard`'s and `LandingFlowCard`'s parts). */
  "googleAnalytics.landing": async (run, ask) => {
    const connection = await connectionWithFigures(run, ask.siteId);
    if (!connection) return null;
    const args = openingArgs(ask);
    const [list, overview, panels, flow, now, before] = await Promise.all([
      run("ga.listPage", { ...args, list: "landing", leaveOut: true, sort: "visits", direction: "desc", ...OPENING_PAGE }) as Promise<ListAnswer | null>,
      run("ga.overview", args) as Promise<Overview>,
      run("ga.funnel.panels", args) as Promise<Awaited<ReturnType<typeof readOverviewPagePanels>>>,
      // The pages the chart opens with ticked: the busiest the menu leaves in, the shop's own pages left out.
      run("ga.funnel.flow", { ...args, leaveOut: true }) as Promise<Flow | null>,
      run("ga.chart", args) as Promise<Chart | null>,
      run("ga.chartBefore", args) as Promise<ChartBefore | null>,
    ]);
    const words = englishBoxNames();
    const data = funnelEyeData({ answer: shownList(list), names: englishEyeNames(), website: websiteForEye(overview), left: panels?.landing?.left ?? null, flow }, words);
    return eyeWithParts(data, {
      // The daily chart opens on People who left straight away.
      leftEachDay: leftEachDayForEye(now, before, "left"),
      flow: flow?.held ? flowForEye(flowBoxes(flow, words)) : undefined,
    });
  },

  /** All pages (`all-pages/page.tsx`: `AllPagesSees`, with `PagesMapCard`'s and `PagesLinesCard`'s parts). */
  "googleAnalytics.allPages": async (run, ask) => {
    const connection = await connectionWithFigures(run, ask.siteId);
    if (!connection) return null;
    const args = openingArgs(ask);
    const end = (sort: "viewsChange" | "conversionsChange", direction: "asc" | "desc") => ({ ...args, list: "page", sort, direction, page: 1, rows: EYE_MOVERS, leaveOut: true });
    type Ends = ListAnswer & { bands: unknown; concentration: unknown; shop: unknown };
    const [list, overview, gained, lost, conversionsLost, kindViews, map, website] = await Promise.all([
      run("ga.listPage", { ...args, list: "page", leaveOut: true, move: "all", sort: "views", direction: "desc", ...OPENING_PAGE }) as Promise<ListAnswer | null>,
      run("ga.overview", args) as Promise<Overview>,
      run("ga.listPage", end("viewsChange", "desc")) as Promise<Ends | null>,
      run("ga.listPage", end("viewsChange", "asc")) as Promise<Ends | null>,
      run("ga.listPage", end("conversionsChange", "asc")) as Promise<Ends | null>,
      run("ga.allPages.kindViews", { ...args, against: true }) as Promise<Awaited<ReturnType<typeof readPageKindViews>>>,
      // The map opens on the forty pages most viewed, colour following Count.
      run("ga.listPage", { ...args, list: "page", sort: "views", direction: "desc", page: 1, rows: MAP_PAGES, leaveOut: true }) as Promise<ListAnswer | null>,
      // Views each day opens on the whole website's line, with no page ticked.
      run("ga.chart", args) as Promise<Chart | null>,
    ]);
    const classification = englishWords("googleAnalytics.allPages.classification");
    const shop = isShop(connection.shop, overview?.now?.purchases, overview?.before?.purchases);
    const kindWords = { shop: classification(shop ? "shop" : "shopService"), notSorted: classification("notSorted") };
    const pageName = pageNameWith(englishWords("googleAnalytics.allPages.map")("homePage"));
    const data = allPagesEyeData({
      answer: shownList(list),
      names: englishEyeNames(),
      website: websiteForEye(overview),
      gained, lost, conversionsLost,
      classifications: classificationsForEye(kindViews?.kinds, (kind) => classificationName(kind, kindWords)),
    });
    return eyeWithParts(data, {
      pageMap: pageMapForEye(map, pageMapRows(map?.rows, "views"), "views", pageName),
      viewsADay: viewsADayForEye(website, null, [], "views", pageName),
    });
  },
};

// A page's own screen: its own figures and its story, the boxes' figures and its visits by channel.

const PAGE_EYE_READS: EyeReads = {
  "ga.page.key": (reader, args) => readPageKey(reader, args as never),
  "ga.page.main": (reader, args) => readPageMain(reader, args as never),
  "ga.page.story": (reader, args) => readPageStoryPart(reader, args as never),
  "ga.page.boxes": (reader, args) => readPageBoxes(reader, args as never),
  "ga.page.channels": (reader, args) => readPageChannelExplorer(reader, args as never),
};

type Main = Awaited<ReturnType<typeof readPageMain>>;
type Told = Awaited<ReturnType<typeof readPageStoryPart>>;
type Explorer = Awaited<ReturnType<typeof readPageChannelExplorer>>;

const PAGE_EYES: EyeBuilders = {
  /**
   * A page's own screen, about the page `ask.key` names: its number (`~fu`), as the screen's address holds it, or its
   * address or path, found as the screen finds a page Live links to (`analyticsPageKey`). Null for a page the website
   * hasn't had a view of in these dates.
   */
  "googleAnalytics.page": async (run, ask) => {
    const asked = ask.key?.trim();
    if (!asked) return null;
    if (!(await connectionWithFigures(run, ask.siteId))) return null;
    const args = openingArgs(ask);
    const page = asked.startsWith("~") ? asked : await run("ga.page.key", { ...args, page: asked }) as string | null;
    if (!page) return null;
    const [main, told, boxes, explorer] = await Promise.all([
      run("ga.page.main", { ...args, page }) as Promise<Main>,
      run("ga.page.story", { ...args, page }) as Promise<Told>,
      run("ga.page.boxes", { ...args, page }) as Promise<PageBoxes>,
      run("ga.page.channels", { ...args, page }) as Promise<Explorer>,
    ]);
    return pageEyeData({ answer: pageAnswerOf(main, told), boxes, explorer }, englishEyeNames());
  },
};

// Overview, and the section's whole list.

export const GOOGLE_ANALYTICS_EYE_READS: EyeReads = {
  "ga.connection": connectionForEye,
  "ga.overview": (reader, args) => readOverview(reader, args as never),
  "ga.listPage": (reader, args) => readListPage(reader, args as never),
  "ga.split": (reader, args) => readOverviewSplit(reader, args as never),
  "ga.chart": (reader, args) => readChart(reader, args as never),
  "ga.chartBefore": (reader, args) => readPeriodBeforeChart(reader, args as never),
  ...VISITS_EYE_READS,
  ...CONVERSIONS_EYE_READS,
  ...CHANNELS_EYE_READS,
  ...CAMPAIGNS_EYE_READS,
  ...PAGES_EYE_READS,
  ...PAGE_EYE_READS,
};

export const GOOGLE_ANALYTICS_EYES: EyeBuilders = {
  /** Overview (`analytics/[siteId]/page.tsx`, `useOverviewEye`). */
  "googleAnalytics.overview": async (run, { siteId, period }) => {
    const connection = await run("ga.connection", { siteId }) as Connection | null;
    if (!connection?.newestDay) return null;
    const args = { siteId, period, device: "" };
    type Overview = Awaited<ReturnType<typeof readOverview>>;
    const [overview, channel, kind, device, visitorType, year, chart, daysBefore, pages] = await Promise.all([
      run("ga.overview", args) as Promise<Overview>,
      run("ga.split", { ...args, split: "channel" }),
      run("ga.split", { ...args, split: "kind" }),
      run("ga.split", { ...args, split: "device" }),
      run("ga.split", { ...args, split: "visitorType" }),
      run("ga.overview", { ...args, period: "last12Months" }) as Promise<Overview>,
      run("ga.chart", args),
      run("ga.chartBefore", args),
      run("ga.listPage", { ...args, list: "landing", sort: "visits", direction: "desc", page: 1, rows: 25, leaveOut: true }) as Promise<{ rows: never[] } | null>,
    ]);
    const shop = isShop(connection.shop, overview?.now?.purchases, overview?.before?.purchases);
    const cells = year?.now ? squaresOutOf(shop ? year.now.purchases ?? 0 : year.now.conversions, year.now.visits) : 100;
    return overviewEyeData({
      overview,
      chart: chart as never,
      daysBefore: daysBefore as never,
      splits: { channel, kind, device, visitorType } as never,
      pages: pages?.rows,
      shop,
      cells,
      health: connection.health,
      firstStep: firstStepOf(connection.events),
    }, englishFor(connection));
  },
  ...VISITS_EYES,
  ...CONVERSIONS_EYES,
  ...CHANNELS_EYES,
  ...CAMPAIGNS_EYES,
  ...PAGES_EYES,
  ...PAGE_EYES,
};

