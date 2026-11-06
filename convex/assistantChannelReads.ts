import type { Id } from "./_generated/dataModel";
import { readChannelSquares, readChannelSteps, readChannelsEachDay } from "./googleAnalyticsChannelPageReads";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { figuresOf, readListPage, type ShownRow } from "./googleAnalyticsReads";
import { connectionOf, countedOf, readSlot } from "./googleAnalyticsRows";
import type { AnalyticsPeriod } from "./googleAnalyticsSchema";
import { requireMySite, type SiteReader } from "./siteAccess";
import { CHANNEL_ORDERS, type ChannelOrder } from "./utils/analyticsScreens";
import { actionWords } from "./utils/campaignActions";
import { channelBoxes, per100Words } from "./utils/channelBoxes";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { NO_PAGE_KIND, OTHER_KIND } from "./utils/sees/analyticsChannel";

/**
 * Channels for Ask Hakken (channels-new-page-plan-2026-11-06.md, step 9): what the page says, in the page's own names, through the very
 * reads it draws from, so a figure in an answer is the figure on the screen. No money anywhere. The boxes, the chart, the squares, the
 * devices and the steps are each a read of their own, as on the screen. `key` holds any of them to one channel.
 */

const WORDS = {
  rule: "These are the figures the screen shows. Give them with the link, in plain words. Channels counts visits, what was bought and conversions, never money. It can't say what a channel cost or whether it paid for itself, as no ad spend is held. Say each channel's name just as it's given here. Never use Google's own words such as session, bounce rate or add_to_cart. Say dates as a person would, such as October, never lastMonth.",
  ruleNoSales: "These are the figures the screen shows. Give them with the link, in plain words. This website sells nothing here, so the page counts events, never money. Say events, not conversions or enquiries, and never talk of anything bought. It can't say what a channel cost or whether it paid for itself, as no ad spend is held. Say each channel's name just as it's given here. Never use Google's own words such as session or bounce rate. Say dates as a person would, such as October, never lastMonth.",
  conversions: "conversions counts every time something the website counts happened, not visits, and one visit can do several of those things. So conversions for every 100 visits can pass 100, such as 135. It isn't a percentage: never call it a conversion rate of 135%. An older version of this page showed that figure as a share of visits, which is why it could read over 100%. If someone asks about it, explain this in plain words, with no formula. Added to basket, Started checkout and the steps count visits, so they can't pass 100 for every 100 visits.",
  events: "events counts every time something the website counts happened, not visits, and one visit can do several of those things. So events for every 100 visits can pass 100, such as 135. It isn't a percentage: never call it a rate of 135%. An older version of this page showed that figure as a share of visits, which is why it could read over 100%. If someone asks about it, explain this in plain words, with no formula.",
  lists: "Google counts each list on its own, so a list of channels can add up to a little more or less than the whole website's visits. The whole website's figure is Google's own total. Never set one against the other, or try to explain the gap.",
  steps: "These count visits, each visit once, so no step can pass 100%. Arrived is every visit. Stayed means a visit that didn't leave straight away. A step's bought counts visits that bought, so it can read a little under what was bought, as a visit can buy twice.",
  left: "Left straight away means stayed under 10 seconds and did nothing.",
};

type Common = { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string };
type Ask = { part?: string; key?: string; search?: string; order?: string; rows: number; linkTo: (segment: string, extra?: Record<string, string>) => string };

const per100 = (part: number, visits: number) => (visits > 0 ? Math.round((1000 * part) / visits) / 10 : null);
const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round((1000 * part) / whole) / 10 : null);

/** The whole website's own figures, as the Visits box and every whole-website figure says them: Google's total, never a list's sum. */
async function wholeWebsite(ctx: SiteReader, common: Common) {
  const site = await requireMySite(ctx, common.siteId);
  const country = await keptCountry(ctx, site.hold, common.country);
  const connection = await connectionOf(ctx, site.hold._id);
  const counted = connection ? countedOf(connection) : [];
  const now = await readSlot(ctx, site.hold._id, slotKey("total", common.period, "NOW", common.device, country));
  const before = await readSlot(ctx, site.hold._id, slotKey("total", common.period, "BEFORE", common.device, country));
  const nowFigures = now ? figuresOf(now.rows, counted) : null;
  const beforeFigures = before ? figuresOf(before.rows, counted) : null;
  return { now: nowFigures, before: beforeFigures, sells: (nowFigures?.purchases ?? 0) > 0 || (beforeFigures?.purchases ?? 0) > 0 };
}

/** A table's row, as its headings say it, in the order the page shows them. */
function rowOf(row: ShownRow, sells: boolean) {
  const basket = row.basketVisits ?? 0;
  const checkout = row.checkoutVisits ?? 0;
  return {
    channel: row.label,
    visits: row.visits,
    visitsBefore: row.visitsBefore ?? null,
    upOrDown: row.visitsBefore == null ? null : row.visits - row.visitsBefore,
    leftStraightAwayPercent: row.bounceRate === null ? null : Math.round(row.bounceRate * 1000) / 10,
    ...(sells ? {
      addedToBasket: basket, addedToBasketPer100Visits: per100(basket, row.visits),
      startedCheckout: checkout, startedCheckoutPer100Visits: per100(checkout, row.visits),
      bought: row.purchases, boughtBefore: row.purchasesBefore ?? null, boughtPer100Visits: per100(row.purchases, row.visits),
      conversions: row.conversions, conversionsBefore: row.conversionsBefore, conversionsPer100Visits: per100(row.conversions, row.visits),
    } : {
      events: row.conversions, eventsBefore: row.conversionsBefore, eventsPer100Visits: per100(row.conversions, row.visits),
    }),
  };
}

/** A square's figures, each with the dates before, in the page's words. */
function squareFigures(figures: { visits: number; visitsBefore: number | null; bought: number; boughtBefore: number | null; conversions: number; conversionsBefore: number | null }, sells: boolean) {
  return {
    visits: figures.visits, visitsBefore: figures.visitsBefore,
    ...(sells ? { bought: figures.bought, boughtBefore: figures.boughtBefore, conversions: figures.conversions, conversionsBefore: figures.conversionsBefore } : { events: figures.conversions, eventsBefore: figures.conversionsBefore }),
  };
}

const columnWords = (key: string, name: string | null) => (name ?? (key === OTHER_KIND ? "Other groups" : key === NOT_SORTED_KIND ? "Not sorted yet" : key === NO_PAGE_KIND ? "No page recorded" : key.toLowerCase().replace(/_/g, " ")));

function onlyChannel<Row>(rows: readonly Row[], key: string | undefined, nameOf: (row: Row) => string): Row[] {
  if (!key) return [...rows];
  const wanted = key.trim().toLowerCase();
  return rows.filter((row) => nameOf(row).toLowerCase() === wanted);
}

/** Channels, as the Assistant reads it. `base` is what every answer starts with. */
export async function channelsForAssistant(ctx: SiteReader, common: Common, ask: Ask, base: { ok: boolean; website: string; screen: string; period: string; figuresTo: string }) {
  const website = await wholeWebsite(ctx, common);
  const { sells } = website;
  const out = { ...base, rule: sells ? WORDS.rule : WORDS.ruleNoSales, ...(ask.key ? { onlyChannel: ask.key } : {}) };
  const link = ask.linkTo("channels");
  const asked = (key: string) => ({ channel: key, problem: `There's no channel called ${key} with visits in these dates.` });

  if (ask.part === "boxes") {
    const list = await readListPage(ctx, { ...common, list: "channel", page: 1, rows: 100, sort: "visits", direction: "desc" });
    if (list.live) return out;
    const now = website.now;
    const boxes = channelBoxes(
      [...list.rows.map((row) => ({ key: row.label, visits: row.visits, visitsBefore: row.visitsBefore ?? null, done: sells ? row.purchases : row.conversions })),
        ...(list.gone ?? []).map((one) => ({ key: one.key, visits: 0, visitsBefore: one.visitsBefore, done: 0 }))],
      { visits: now?.visits ?? null, done: now ? (sells ? now.purchases : now.conversions) : null },
    );
    const before = website.before;
    return {
      ...out,
      wholeWebsite: {
        visits: now?.visits ?? null, visitsBefore: before?.visits ?? null,
        ...(sells ? { bought: now?.purchases ?? 0, boughtBefore: before?.purchases ?? null, conversions: now?.conversions ?? 0 } : { events: now?.conversions ?? 0, eventsBefore: before?.conversions ?? null }),
      },
      listsRule: WORDS.lists,
      boxes: {
        mostVisits: boxes.mostVisits ? { channel: boxes.mostVisits.key, visits: boxes.mostVisits.visits, shareOfAllVisitsPercent: boxes.mostVisits.sharePercent === null ? null : Math.round(boxes.mostVisits.sharePercent) } : null,
        [sells ? "mostBought" : "mostEvents"]: boxes.mostDone ? { channel: boxes.mostDone.key, [sells ? "bought" : "events"]: boxes.mostDone.done, [sells ? "shareOfEverythingBoughtPercent" : "shareOfAllEventsPercent"]: boxes.mostDone.sharePercent === null ? null : Math.round(boxes.mostDone.sharePercent) } : null,
        [sells ? "sellsBest" : "bestForEvents"]: boxes.bestFor ? { channel: boxes.bestFor.key, [sells ? "boughtPer100Visits" : "eventsPer100Visits"]: Number(per100Words(boxes.bestFor.per100)), wholeWebsitePer100Visits: boxes.bestFor.sitePer100 === null ? null : Number(per100Words(boxes.bestFor.sitePer100)), rule: "Only channels with 100 visits or more can be named." } : null,
        biggestChange: boxes.biggestChange ? { channel: boxes.biggestChange.key, moreOrFewerVisits: boxes.biggestChange.change, against: "the dates before" } : null,
      },
    };
  }

  if (ask.part === "chart") {
    const chart = await readChannelsEachDay(ctx, common);
    if (chart.live) return out;
    const shown = ask.key ? chart.channels.filter((channel) => channel.toLowerCase() === ask.key?.trim().toLowerCase()) : chart.channels;
    if (ask.key && shown.length === 0) return { ...out, chart: asked(ask.key) };
    const at = shown.map((channel) => chart.channels.indexOf(channel));
    const named = (visits: readonly number[]) => Object.fromEntries(shown.map((channel, place) => [channel, visits[at[place]] ?? 0]));
    return {
      ...out,
      chart: {
        rows: chart.points.map((point) => ({ from: point.day, ...(point.lastDay ? { to: point.lastDay } : {}), ...named(point.visits) })),
        ...(chart.before ? { theDatesBefore: chart.before.map((point) => ({ from: point.day, ...(point.lastDay ? { to: point.lastDay } : {}), ...named(point.visits) })) } : {}),
        eventsInTimes: chart.events.map((event, eventAt) => ({
          event: actionWords(event.eventName),
          ...(event.counted ? {} : { notCountedAsAConversion: true }),
          times: event.times,
          byChannel: shown.map((channel, place) => ({ channel, times: chart.points.reduce((sum, point) => sum + (point.events[eventAt]?.[at[place]] ?? 0), 0) })),
        })),
        eventsRule: "Events count times, not visits, so one visit can count many times, and adding two events together can count one visit twice.",
      },
    };
  }

  if (ask.part === "squares" || ask.part === "devices") {
    const split = ask.part === "devices" ? "device" : "kind";
    const squares = await readChannelSquares(ctx, { ...common, split });
    if (squares.collecting) return out;
    const name = (key: string, own: string | null) => (split === "device" ? key : columnWords(key, own));
    const rows = onlyChannel(squares.rows, ask.key, (row) => row.channel);
    if (ask.key && rows.length === 0) return { ...out, [split === "device" ? "byDevice" : "whereVisitsStarted"]: asked(ask.key) };
    return {
      ...out,
      [split === "device" ? "byDevice" : "whereVisitsStarted"]: {
        ...(squares.everyDevice ? { note: "This shows every device, as this list isn't kept by device for these dates." } : {}),
        ...(split === "kind" ? { otherGroupsHolds: squares.columns.flatMap((column) => column.holds ?? []).map((one) => columnWords(one.kind, one.name)) } : {}),
        rows: rows.map((row) => ({
          channel: row.channel,
          ...squareFigures(row, sells),
          [split === "device" ? "devices" : "classifications"]: row.cells.flatMap((cell, at) => (cell.visits > 0 || (cell.visitsBefore ?? 0) > 0 ? [{
            [split === "device" ? "device" : "classification"]: name(squares.columns[at]?.key ?? "", squares.columns[at]?.name ?? null),
            ...squareFigures(cell, sells),
            shareOfThisChannelsVisitsPercent: percentOf(cell.visits, row.visits),
          }] : [])),
        })),
      },
    };
  }

  if (ask.part === "steps") {
    if (!sells) return { ...out, steps: "This website has nothing bought in these dates, so the page leaves the steps off. Its other figures aren't steps a visit goes through in order." };
    const steps = await readChannelSteps(ctx, common);
    if (steps.collecting) return out;
    const words = (figures: { arrived: number; stayed: number; basket: number; checkout: number; bought: number }) => ({
      arrived: figures.arrived, stayed: figures.stayed,
      ...(steps.tracks.basket ? { inBasket: figures.basket } : {}),
      ...(steps.tracks.checkout ? { atCheckout: figures.checkout } : {}),
      bought: figures.bought,
    });
    const channels = onlyChannel(steps.channels, ask.key, (row) => row.channel);
    if (ask.key && channels.length === 0) return { ...out, steps: asked(ask.key) };
    return {
      ...out,
      steps: {
        rule: WORDS.steps,
        ...(steps.everyDevice ? { note: "This shows every device, as this list isn't kept by device for these dates." } : {}),
        ...(ask.key || !steps.everywhere ? {} : { everywhere: words(steps.everywhere) }),
        channels: channels.map((row) => ({ channel: row.channel, ...words(row) })),
      },
    };
  }

  // The table, as the page opens: read in the order that answers the question.
  const named = ask.order && ask.order in CHANNEL_ORDERS ? CHANNEL_ORDERS[ask.order as ChannelOrder] : CHANNEL_ORDERS.mostVisits;
  // A website with nothing bought is read by its events, whichever was asked.
  const order = sells ? named : named.sort === "bought" ? CHANNEL_ORDERS.mostConversions : named.sort === "boughtRate" ? CHANNEL_ORDERS.bestForEvents : named;
  const answer = await readListPage(ctx, { ...common, list: "channel", page: 1, rows: ask.rows, ...order, ...(ask.search ? { q: ask.search } : {}) });
  const orderLink = ask.linkTo("channels", { sort: order.sort, dir: order.direction });
  if (answer.live) return { ...out, message: "Figures for one device are asked of Google when the screen opens, so they are not held yet. Open the link to see them, or ask for every device.", link };
  const rows = onlyChannel(answer.rows, ask.key, (row) => row.label);
  const stopped = answer.gone ?? [];
  return {
    ...out,
    listed: answer.total,
    rows: rows.map((row) => rowOf(row, sells)),
    rows_are: `The first ${Math.min(ask.rows, answer.total)} of ${answer.total} channels, ${ask.order ?? "mostVisits"}.`,
    [sells ? "conversionsRule" : "eventsRule"]: sells ? WORDS.conversions : WORDS.events,
    leftRule: WORDS.left,
    listsRule: WORDS.lists,
    ...(ask.key && rows.length === 0 ? { problem: `There's no channel called ${ask.key} with visits in these dates.` } : {}),
    ...(stopped.length > 0 ? { hadVisitsBeforeAndNoneNow: stopped.map((one) => ({ channel: one.key, visitsBefore: one.visitsBefore })) } : {}),
    ...(answer.thresholded ? { note: "Google held back some small groups to protect people's privacy." } : {}),
    link: ask.order ? orderLink : link,
  };
}
