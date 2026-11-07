import type { Id } from "./_generated/dataModel";
import type { AnalyticsPeriod } from "./googleAnalyticsSchema";
import type { SiteReader } from "./siteAccess";
import { readServiceDays, readServices, type ServiceRow, type ServicesAnswer } from "./googleAnalyticsServiceReads";
import { pathOfAddress } from "./utils/sees/analytics";
import { SERVICE_GROUPS, groupNameInEnglish, openingSplit, perHundredOf, type ServiceGroup } from "./utils/serviceGroups";
import { SERVICE_ORDERS, type ServiceOrder } from "./utils/analyticsScreens";

/**
 * Services for Ask Hakken (services-new-page-plan-2026-11-07.md, step 7): what the page says, in the page's own names, through the
 * very read it draws from, so a figure in an answer is the figure on the screen. The groups come from the page's own rule
 * (`serviceSplit`), named by their numbers, never busy or quiet. A service business says events, never bought. No money anywhere.
 * `key` or `search` naming one service adds its own figures: its months and the channels that brought it.
 */

const WORDS = {
  rule: "These are the figures the Services page shows. Give them with the link, in plain words. A service is a page in a Classification whose type is Service. Events are the times something the website counts happened on that page, such as a contact form or a phone number clicked. Say events, never sales, bought or conversions, and never talk of money. Name the groups by their numbers just as they're given here, never as busy, quiet, working or not working. When a figure is small, say how small it is, such as 2 events in a month, and compare it with the dates before. Say dates as a person would, such as October, never lastMonth.",
  counting: "A visit that looks at two services counts once on each, so the services' visits add up to more than the visits that started on one. An event counts on the page where it happened: events on other pages, such as the home page, belong to no service.",
  channels: "Google splits only the visits that started on a page by channel, so a service's channels count the visits that started on it.",
};

type Common = { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string };
type Ask = { key?: string; search?: string; order?: string; rows: number; linkTo: (segment: string, extra?: Record<string, string>) => string };

/** The group a service falls in, on the page's opening split: visits across, events for every 100 visits up. */
export function servicesOpeningSplit(answer: ServicesAnswer) {
  return openingSplit(answer.services, answer.website);
}

/** A service as its row reads, with the group it falls in. */
function serviceOf(row: ServiceRow, group: string | null) {
  return {
    service: row.name,
    page: pathOfAddress(row.address),
    visits: row.now.visits,
    visitsBefore: row.before.visits,
    events: row.now.events,
    eventsBefore: row.before.events,
    eventsPer100Visits: perHundredOf(row.now.events, row.now.visits),
    pageViews: row.now.views,
    visitsThatStartedHere: row.started,
    ...(group ? { group } : {}),
  };
}

/** The services in the order asked: the page's own headings, and two the questions ask most. */
function ordered(rows: readonly ServiceRow[], order: ServiceOrder, middle: number): ServiceRow[] {
  const visits = (row: ServiceRow) => row.now.visits;
  const change = (row: ServiceRow) => row.now.visits - row.before.visits;
  const per100 = (row: ServiceRow) => perHundredOf(row.now.events, row.now.visits);
  const sorted = [...rows];
  if (order === "mostEvents") return sorted.filter((row) => row.now.events > 0).sort((a, b) => b.now.events - a.now.events || visits(b) - visits(a));
  if (order === "gainedMostVisits") return sorted.sort((a, b) => change(b) - change(a));
  if (order === "lostMostVisits") return sorted.sort((a, b) => change(a) - change(b));
  // Best for its visits, among services with the middle service's visits or more, so one visit and one event doesn't lead.
  if (order === "bestForEvents") return sorted.filter((row) => visits(row) >= middle && row.now.events > 0).sort((a, b) => per100(b) - per100(a) || visits(b) - visits(a));
  if (order === "noEvents") return sorted.filter((row) => visits(row) > 0 && row.now.events === 0).sort((a, b) => visits(b) - visits(a));
  return sorted.sort((a, b) => visits(b) - visits(a));
}

/** Months, added up from the chart's points: each month's visits and events. */
function monthsOf(points: ReadonlyArray<{ day: string }>, series: readonly number[][] | null) {
  if (!series) return null;
  const months = new Map<string, { visits: number; events: number }>();
  points.forEach((point, at) => {
    const month = point.day.slice(0, 7);
    const into = months.get(month) ?? months.set(month, { visits: 0, events: 0 }).get(month)!;
    into.visits += series[at]?.[0] ?? 0;
    into.events += series[at]?.[2] ?? 0;
  });
  return [...months.entries()].map(([month, figures]) => ({ month, ...figures }));
}

/** The one service a question names, by its name or address. */
function serviceNamed(rows: readonly ServiceRow[], said: string | undefined): ServiceRow | null {
  const wanted = said?.trim().toLowerCase();
  if (!wanted) return null;
  const path = (row: ServiceRow) => pathOfAddress(row.address).toLowerCase().replace(/\/+$/, "");
  const asPath = pathOfAddress(wanted).replace(/\/+$/, "");
  return rows.find((row) => row.name.toLowerCase() === wanted || path(row) === asPath)
    ?? rows.find((row) => row.name.toLowerCase().includes(wanted) || path(row).includes(wanted))
    ?? null;
}

export async function servicesForAssistant(ctx: SiteReader, common: Common, ask: Ask, base: { ok: boolean; website: string; screen: string; period: string; figuresTo?: string }) {
  const answer = await readServices(ctx, common);
  const link = ask.linkTo("services");
  if (answer.state === "noServices") return { ...base, ok: false, problem: "This website has no Classification whose type is Service, so it has no Services page. Its pages can be sorted in Page classification." };
  if (answer.state === "notConnected") return { ...base, ok: false, problem: "This website has no Google Analytics figures yet." };
  if (answer.state === "collecting") return { ...base, rule: WORDS.rule, message: "These dates' pages aren't collected yet. They come with the next collection.", link };
  const split = servicesOpeningSplit(answer);
  const groupOf = new Map<ServiceRow, ServiceGroup>();
  for (const group of SERVICE_GROUPS) for (const row of split.groups[group]) groupOf.set(row, group);
  const nameOf = (group: ServiceGroup) => groupNameInEnglish(group, split.split);
  const withVisits = answer.services.filter((row) => row.now.visits > 0);
  const sum = (rows: readonly ServiceRow[], read: (row: ServiceRow) => number) => rows.reduce((all, row) => all + read(row), 0);
  const order = (ask.order && ask.order in SERVICE_ORDERS ? ask.order : "mostVisits") as ServiceOrder;
  const searched = ask.search ? answer.services.filter((row) => `${row.name} ${row.address}`.toLowerCase().includes(ask.search!.toLowerCase())) : answer.services;
  const listed = ordered(searched, order, split.split.x);
  const one = serviceNamed(answer.services, ask.key ?? (listed.length === 1 ? listed[0].name : undefined));
  const noEvents = withVisits.filter((row) => row.now.events === 0).sort((a, b) => b.now.visits - a.now.visits);

  // One service: its months, from the page's own month chart read, and the channels that brought its visits.
  let alone: Record<string, unknown> | null = null;
  if (one) {
    const days = await readServiceDays(ctx, { ...common, services: [{ key: one.key, refs: one.refs }], channels: false });
    const series = days.services[0] ?? null;
    alone = {
      ...serviceOf(one, groupOf.has(one) ? nameOf(groupOf.get(one)!) : null),
      months: days.state === "ready" ? monthsOf(days.points, series?.now ?? null) : null,
      monthsBefore: days.state === "ready" && days.before ? monthsOf(days.before.points, series?.before ?? null) : null,
      channels: one.byChannel ? answer.channels.map((channel, at) => ({
        channel,
        visitsThatStartedHere: one.byChannel![at][0], events: one.byChannel![at][2],
        visitsThatStartedHereBefore: one.byChannel![at][3], eventsBefore: one.byChannel![at][5],
      })).filter((row) => row.visitsThatStartedHere > 0 || row.visitsThatStartedHereBefore > 0).sort((a, b) => b.visitsThatStartedHere - a.visitsThatStartedHere) : null,
      ...(one.byChannel ? { channelsRule: WORDS.channels } : { channelsNote: "Channels are kept for every device only: ask without a device." }),
      link: ask.linkTo("all-pages/page", { key: one.address }),
    };
  }

  return {
    ...base,
    rule: WORDS.rule,
    counting: WORDS.counting,
    servicesWithVisits: withVisits.length,
    servicesListed: answer.services.length,
    ...(answer.leftOut > 0 ? { servicesLeftOut: answer.leftOut } : {}),
    ...(answer.everyDevice ? { note: "That device's pages aren't kept yet, so these are every device's." } : {}),
    allServices: {
      visits: sum(withVisits, (row) => row.now.visits), visitsBefore: answer.hasBefore ? sum(answer.services, (row) => row.before.visits) : null,
      events: sum(withVisits, (row) => row.now.events), eventsBefore: answer.hasBefore ? sum(answer.services, (row) => row.before.events) : null,
      visitsThatStartedOnAService: sum(answer.services, (row) => row.started),
    },
    wholeWebsite: {
      visits: answer.website.visits, visitsBefore: answer.website.visitsBefore, events: answer.website.events, eventsBefore: answer.website.eventsBefore,
      eventsPer100Visits: perHundredOf(answer.website.events, answer.website.visits),
    },
    eventsOnOtherPages: { events: answer.elsewhere.events, eventsBefore: answer.elsewhere.eventsBefore, mostOn: answer.elsewhere.page ? { page: answer.elsewhere.page.name, address: pathOfAddress(answer.elsewhere.page.address), events: answer.elsewhere.page.events } : null },
    groups: {
      rule: `The line across is the middle service's visits for these dates, ${split.split.x}. The line up is the whole website's events for every 100 visits, ${split.split.y.toFixed(1)}. Only services with visits are in a group.`,
      groups: SERVICE_GROUPS.map((group) => ({
        name: nameOf(group),
        services: split.groups[group].length,
        visits: sum(split.groups[group], (row) => row.now.visits),
        events: sum(split.groups[group], (row) => row.now.events),
        serviceNames: split.groups[group].slice(0, 15).map((row) => row.name),
      })),
    },
    // Their visits added up here, so an answer never guesses a total from the ten it's given ("over 300 visits", 7 November).
    servicesWithNoEvents: { count: noEvents.length, visits: sum(noEvents, (row) => row.now.visits), busiest: noEvents.slice(0, 10).map((row) => ({ service: row.name, visits: row.now.visits })) },
    ...(answer.channels.length > 0 ? {
      channels: answer.channels.map((channel, at) => ({
        channel,
        visitsThatStartedOnAService: sum(answer.services, (row) => row.byChannel?.[at]?.[0] ?? 0),
        events: sum(answer.services, (row) => row.byChannel?.[at]?.[2] ?? 0),
      })),
      channelsRule: WORDS.channels,
    } : {}),
    services: listed.slice(0, ask.rows).map((row) => serviceOf(row, groupOf.has(row) ? nameOf(groupOf.get(row)!) : null)),
    services_are: `The first ${Math.min(ask.rows, listed.length)} of ${listed.length} services, ${order}.`,
    ...(alone ? { service: alone } : ask.key ? { serviceAsked: `No service matching ${ask.key} had visits in these dates.` } : {}),
    link,
  };
}
