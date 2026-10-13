import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalQuery, type QueryCtx } from "./_generated/server";
import type { SiteReader } from "./siteAccess";
import { holdFor } from "./assistantReads";
import { isTrackedHold } from "./utils/websitePairing";
import { readConversions, readListPage, readOverview, type ShownRow } from "./googleAnalyticsReads";
import { readEvent, readEvents } from "./googleAnalyticsEventReads";
import { readVisitors } from "./googleAnalyticsVisitorReads";
import { productList, readProducts } from "./googleAnalyticsProductReads";
import { readLandingPage, readPage } from "./googleAnalyticsPageReads";
import { readHeroes } from "./googleAnalyticsHeroes";
import { LIVE_LISTS, askLiveFigures } from "./googleAnalyticsRealtime";
import { pathOfAddress } from "./utils/sees/analytics";
import { ANALYTICS_SCREENS, type AnalyticsScreen } from "./utils/analyticsScreens";

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

/** A list's row as the Assistant reads it: plain names and units, the screen's own figures. */
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

/** The list each list screen reads, and its segment in the address. */
const LISTS: Partial<Record<Screen, { list: "channel" | "source" | "campaign" | "adKeyword" | "landing" | "page"; segment: string }>> = {
  channels: { list: "channel", segment: "channels" },
  channel: { list: "source", segment: "channels/channel" },
  campaigns: { list: "campaign", segment: "campaigns" },
  adKeywords: { list: "adKeyword", segment: "campaigns" },
  landingPages: { list: "landing", segment: "landing-pages" },
  allPages: { list: "page", segment: "all-pages" },
};

const daysValidator = v.union(v.literal(7), v.literal(30), v.literal(90), v.literal(365));

export const googleAnalyticsInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    website: v.string(),
    screen: v.union(...ANALYTICS_SCREENS.map((screen) => v.literal(screen))),
    days: daysValidator,
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
    const period = String(args.days) as "7" | "30" | "90" | "365";
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
      days: args.days,
      figuresTo: connection.newestDay,
      currency,
      rule: "These are the figures the screen shows. Give them with the link, in plain words; money is in the currency given, never hundredths.",
    };
    const asked = { message: "Figures for one device are asked of Google when the screen opens, so they are not held yet. Open the link to see them, or ask for every device." };

    const list = LISTS[args.screen];
    if (list) {
      const answer = await readListPage(site, {
        ...common, list: list.list, ...(args.screen === "channel" ? { channel: args.key ?? "" } : {}), ...(args.search ? { q: args.search } : {}), page: 1, rows: ROWS,
      });
      if (answer.live) return { ...base, ...asked, link: linkTo(list.segment) };
      return {
        ...base,
        listed: answer.total,
        rows: answer.rows.map(rowOf),
        ...(answer.untagged !== null ? { visitsFromNoTaggedLink: answer.untagged } : {}),
        ...(answer.figures ? { channelTotals: { visits: answer.figures.visits, visitsBefore: answer.figures.visitsBefore, conversions: answer.figures.conversions, value: money(answer.figures.value) } } : {}),
        ...(answer.thresholded ? { note: "Google held back some small groups to protect people's privacy." } : {}),
        link: linkTo(list.segment, args.screen === "channel" && args.key ? { key: args.key } : {}),
      };
    }

    switch (args.screen) {
      case "overview": {
        const answer = await readOverview(site, common);
        const figures = (figure: typeof answer.now) => figure && {
          visits: figure.visits, pageViews: figure.views, people: figure.people, engagedVisits: figure.engaged,
          conversions: figure.conversions, value: money(figure.value),
        };
        return {
          ...base,
          from: answer.from, to: answer.to,
          now: figures(answer.now), theSpanBefore: figures(answer.before),
          visitsByChannel: answer.channelVisits,
          changedMost: answer.changedMost.map((row) => ({ name: row.title ?? pathOfAddress(row.label), kind: row.kind, conversionsChange: row.conversions, valueChange: money(row.value) })),
          link: linkTo(""),
        };
      }
      case "conversions": {
        const answer = await readConversions(site, common);
        return {
          ...base,
          visits: answer.visits,
          kinds: answer.kinds.map((kind) => ({ event: kind.eventName, count: kind.count, countBefore: kind.countBefore, value: money(kind.value) })),
          link: linkTo("conversions"),
        };
      }
      case "landingPage":
      case "page": {
        if (!args.key) return { ok: false, problem: "Say which page: its address or path." };
        const path = pathOfAddress(args.key.trim());
        const pages = await readListPage(site, { ...common, device: "", list: args.screen === "page" ? "page" : "landing", q: path.replace(/^\//, "") || "/", page: 1, rows: ROWS });
        const match = pages.rows.find((row) => pathOfAddress(row.label) === path) ?? pages.rows[0];
        if (!match) return { ok: false, problem: `No page of ${host} matching ${path} had visits in these dates.` };
        if (args.screen === "landingPage") {
          const answer = await readLandingPage(site, { ...common, page: match.key });
          return {
            ...base, page: answer?.address ?? match.label, title: answer?.title ?? null, figures: answer?.row ? rowOf(answer.row) : null,
            channels: answer && !answer.live ? answer.channels.slice(0, ROWS).map(rowOf) : null,
            ...(answer?.live ? { note: "Where its visits came from is asked of Google when its screen opens: open the link." } : {}),
            link: linkTo("landing-pages/page", { key: match.key }),
          };
        }
        const answer = await readPage(site, { ...common, page: match.key });
        const story = answer?.story ?? null;
        return {
          ...base, page: answer?.address ?? match.label, title: answer?.title ?? null, figures: answer?.row ? rowOf(answer.row) : null,
          justBefore: answer && !answer.live ? answer.before.slice(0, ROWS).map((row) => ({ came: row.kind === "none" ? "no page before" : row.title ?? pathOfAddress(row.label), views: row.views, sharePercent: percent(row.share) })) : null,
          // Its story, as its screen tells it (analytics-page-screen-plan.md §2): conversions made on the page are its figures'
          // own; those from visits that started on it were made anywhere on the website, and are never said to be the page's.
          visitsThatStartedHere: story?.started ? {
            visits: story.started.visits, conversionsFromThoseVisitsMadeAnywhere: story.started.conversions, value: money(story.started.value),
            visitsForOneConversion: story.started.visitsPerConversion, websiteVisitsForOneConversion: story.started.websiteVisitsPerConversion,
            pagesAVisitAsCounted: story.started.countedPages,
          } : null,
          ...(story && !story.live ? {
            differentPagesAVisit: story.differentPages,
            timesCountedAVisit: story.viewsPerVisit,
            readToEndPercent: story.read === null ? null : percent(story.read),
            bySource: story.sources.slice(0, ROWS).map((row) => ({ source: row.name ?? (row.source === "(direct)" ? "typed in or a bookmark" : "not known"), channel: row.channel, visits: row.visits, conversions: row.conversions })),
            wentNext: story.next.slice(0, ROWS).map((row) => ({ went: row.kind === "again" ? "this page again" : row.kind === "left" ? "left the website" : pathOfAddress(row.address), views: row.views, sharePercent: percent(row.share) })),
          } : story?.live ? { storyNote: "Where its views went next, each source's visits and who reads it are asked of Google when the page's screen opens: open the link." } : {}),
          ...(answer?.live ? { note: "The page or website visitors were on just before is asked of Google when the page's screen opens: open the link." } : {}),
          link: linkTo("all-pages/page", { key: match.key }),
        };
      }
      case "events": {
        const answer = await readEvents(site, common);
        if (!answer) return { ok: false, problem: `${host} has no Google Analytics figures yet.` };
        if (answer.live) return { ...base, ...asked, link: linkTo("events") };
        return {
          ...base,
          events: answer.rows.slice(0, 50).map((row) => ({ event: row.eventName, kind: row.kind, countsAsConversion: row.counted, times: row.times, people: row.people, visits: row.visits, timesBefore: row.timesBefore })),
          link: linkTo("events"),
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
        const view = args.list ?? "browser";
        const listed = await readListPage(site, { ...common, list: view, page: 1, rows: ROWS });
        return {
          ...base,
          figures: answer.figures,
          googleSignals: answer.signals,
          [view]: listed.live ? null : listed.rows.map((row) => ({ name: row.label, people: row.people, visits: row.visits, engagedPercent: percent(row.engagementRate), conversions: row.conversions })),
          ...(answer.missing.length > 0 || listed.live ? asked : {}),
          link: linkTo("visitors", { view }),
        };
      }
      case "products": {
        const answer = await readProducts(site, common);
        if (!answer?.shop) return { ok: false, problem: `${host} is not a shop: Google Analytics recorded no products looked at, added to a basket or bought in its last 90 days.` };
        const products = await productList(ctx, hold, { ...common, ...(args.search ? { q: args.search } : {}) });
        return {
          ...base,
          steps: answer.steps && { ...answer.steps, revenue: money(answer.steps.revenue) },
          theSpanBefore: answer.before && { ...answer.before, revenue: money(answer.before.revenue) },
          products: products.rows.slice(0, ROWS).map((row) => ({ name: row.name, category: row.category, looks: row.looks, basket: row.basket, bought: row.bought, revenue: money(row.revenue), changeInRevenuePercent: percent(row.change) })),
          link: linkTo("products"),
        };
      }
      case "heroes": {
        const answer = await readHeroes(site, { siteId, tab: "all", page: 1, rows: ROWS });
        return {
          ...base,
          state: answer.state,
          pages: answer.rows.map((row) => ({ page: row.title ? `${row.title} — ${row.page}` : row.page, label: row.main, hero: row.hero, worthAMonth: money(row.worth) })),
          link: linkTo("heroes"),
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
      [args.list ?? "pages"]: answer.rows.slice(0, ROWS),
      rule: "Live figures are Google's, asked just now and never kept; pages are named by title. Say they are live.",
      link: `/app/analytics/${hold.siteId}/live`,
    };
  },
});
