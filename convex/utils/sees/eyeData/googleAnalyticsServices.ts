import type { ServiceDaysAnswer, ServicesAnswer } from "../../../googleAnalyticsServiceReads";
import { SERVICE_GROUPS, perHundredOf, serviceSplit, type ServiceGroup, type SplitPick } from "../../serviceGroups";

/**
 * What Google Analytics Services' panels hand its eye (`useSeesPart`), built in one place for the screen (`ServiceParts.tsx`) and
 * for a chat app's question (`chatAppEyes/googleAnalytics.ts`), so the two can't disagree
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The page's own figures are `servicesEyeData`
 * (`../analyticsServices.ts`); here are the groups every panel shares, and the month chart's, the dots' and the map's parts.
 */

type Service = ServicesAnswer["services"][number];

export const SERVICE_ACROSS = ["visits", "started", "views"] as const;
export type ServiceAcross = (typeof SERVICE_ACROSS)[number];
export const SERVICE_DOINGS = ["events", "stayed", "scrolled"] as const;
export type ServiceDoing = (typeof SERVICE_DOINGS)[number];

/** What the dots' menus and the Classification chip hold: the page opens on `OPENING_SERVICES_VIEW`. */
export type ServicesView = {
  classification: string;
  across: ServiceAcross;
  doing: ServiceDoing;
  acrossPick: SplitPick;
  upPick: SplitPick;
  group: ServiceGroup | "";
  /** The channels ticked on the dots, or null for every channel. */
  tickedChannels: readonly string[] | null;
};

export const OPENING_SERVICES_VIEW: ServicesView = { classification: "", across: "visits", doing: "events", acrossPick: "middle", upPick: "middle", group: "", tickedChannels: null };

/** A service's figures through the channels ticked: all of its own with every channel, else the visits that started on it from them. */
export function throughChannels(service: Service, channels: readonly string[], ticked: readonly string[]) {
  if (!service.byChannel || ticked.length === channels.length) return { visits: service.now.visits, engaged: service.now.engaged, events: service.now.events, visitsBefore: service.before.visits, eventsBefore: service.before.events };
  const out = { visits: 0, engaged: 0, events: 0, visitsBefore: 0, eventsBefore: 0 };
  channels.forEach((channel, at) => {
    if (!ticked.includes(channel)) return;
    const figures = service.byChannel![at];
    out.visits += figures[0];
    out.engaged += figures[1];
    out.events += figures[2];
    out.visitsBefore += figures[3];
    out.eventsBefore += figures[5];
  });
  return out;
}

/**
 * The groups the dots' menus make, shared by the boxes, the dots, the map, the table and the eye: change one and the others follow.
 * Each group is named by its numbers alone (`nameOf`): the reader's words on the screen, `groupNameInEnglish` on the server.
 */
export function serviceGroupsFrom(answer: ServicesAnswer | undefined, view: ServicesView, nameOf: (group: ServiceGroup, split: { x: number; y: number }) => string) {
  const { classification, across, doing, acrossPick, upPick, group, tickedChannels } = view;
  const channels = answer?.channels ?? [];
  const known = (answer?.classifications ?? []).some((one) => one.id === classification);
  const services = (answer?.services ?? []).filter((service) => !known || service.kind === classification);
  // Only visits split by channel: page views and scrolling to the bottom aren't.
  const canChannel = channels.length > 0 && across !== "views" && doing !== "scrolled";
  const ticked = canChannel ? (tickedChannels ?? channels).filter((channel) => channels.includes(channel)) : channels;
  const through = (service: Service) => throughChannels(service, channels, ticked);
  const xOf = (service: Service) => (across === "views" ? service.now.views : across === "started" && ticked.length === channels.length ? service.started : through(service).visits);
  const yOf = (service: Service) => {
    if (doing === "scrolled") return perHundredOf(service.now.scrolled, service.now.visits);
    const figures = through(service);
    return perHundredOf(doing === "events" ? figures.events : figures.engaged, figures.visits);
  };
  const website = answer?.website;
  const websiteLine = !website ? 0 : doing === "events" ? perHundredOf(website.events, website.visits) : doing === "stayed" ? perHundredOf(website.engaged, website.visits) : perHundredOf(website.pageScrolled, website.pageVisits);
  const split = serviceSplit(services, (service) => ({ x: xOf(service), y: yOf(service) }), websiteLine, { across: acrossPick, up: upPick });
  const names = Object.fromEntries(SERVICE_GROUPS.map((key) => [key, nameOf(key, split.split)])) as Record<ServiceGroup, string>;
  const groupOf = new Map<string, ServiceGroup>();
  for (const key of SERVICE_GROUPS) for (const service of split.groups[key]) groupOf.set(service.key, key);
  const inGroup = (service: Service) => !group || groupOf.get(service.key) === group;
  return { services, channels, ticked, canChannel, through, xOf, yOf, websiteLine, split, names, groupOf, inGroup, classification: known ? classification : "" };
}

export type ServiceGroupsFigures = ReturnType<typeof serviceGroupsFrom>;

/** The dots' part: each service drawn, its figure across and for every 100, and its group, with the two lines. */
export function servicesDotsForEye(groups: ServiceGroupsFigures, across: ServiceAcross, doing: ServiceDoing) {
  return {
    count: across,
    show: doing,
    lineAcross: groups.split.split.x,
    lineUp: groups.split.split.y,
    services: groups.split.shown.map((service) => ({ name: service.name, across: groups.xOf(service), forEvery100: groups.yOf(service), group: groups.names[groups.groupOf.get(service.key)!] })),
  };
}

/** The map's boxes at most, the busiest first, as on All pages and Campaigns. */
const MAP_SERVICES = 40;
export const SERVICE_COUNTS = ["visits", "views", "events"] as const;
export type ServiceCount = (typeof SERVICE_COUNTS)[number];

/** A service's figure by what the map counts, now or the dates before. */
export const serviceFigureOf = (service: Service, count: ServiceCount, which: "now" | "before") => service[which][count === "views" ? "views" : count];

/** The services the map can show, the busiest first, in the group shown, and the first `MAP_SERVICES` of them it draws. */
export function servicesBoxed(groups: Pick<ServiceGroupsFigures, "services" | "inGroup">, count: ServiceCount) {
  const all = groups.services.filter((service) => serviceFigureOf(service, count, "now") > 0 && groups.inGroup(service)).sort((left, right) => serviceFigureOf(right, count, "now") - serviceFigureOf(left, count, "now"));
  return { all, boxed: all.slice(0, MAP_SERVICES) };
}

/** The map's part: each service with a box, its figure now and the dates before where they're kept. */
export function servicesMapForEye(boxed: readonly Service[], count: ServiceCount, colour: ServiceCount, hasBefore: boolean) {
  return { count, colour, services: boxed.map((service) => ({ name: service.name, [count]: serviceFigureOf(service, count, "now"), [`${count}Before`]: hasBefore ? serviceFigureOf(service, count, "before") : null })) };
}

/** Services ticked on the month chart as it opens: the busiest five. */
const FIRST_TICKED = 5;

export const SERVICE_SHOWS = ["visits", "events", "rate", "views"] as const;
export type ServiceShow = (typeof SERVICE_SHOWS)[number];
export const SERVICE_LINES = ["service", "channel", "one"] as const;
export type ServiceLines = (typeof SERVICE_LINES)[number];
export const SERVICE_AGAINST = ["nothing", "before", "website"] as const;
export type ServiceAgainst = (typeof SERVICE_AGAINST)[number];

/**
 * What the month chart draws from its menus: the services with visits, the busiest first; those ticked (the busiest five as it
 * opens); the channels ticked; how its lines are drawn; and whether it reads the services by channel.
 */
export function serviceMonthPicks(
  answer: Pick<ServicesAnswer, "channels">,
  services: readonly Service[],
  choice: { show: ServiceShow; lines: ServiceLines; pickedServices: readonly string[] | null; pickedChannels: readonly string[] | null },
) {
  const byVisits = [...services].filter((service) => service.now.visits > 0).sort((left, right) => right.now.visits - left.now.visits);
  const tickedServices = (choice.pickedServices ?? byVisits.slice(0, FIRST_TICKED).map((service) => service.key)).filter((key) => byVisits.some((service) => service.key === key));
  const channels = answer.channels;
  // Channels split visits and events: never page views, and never one device.
  const canChannel = channels.length > 0 && choice.show !== "views";
  const tickedChannels = canChannel ? (choice.pickedChannels ?? channels).filter((channel) => channels.includes(channel)) : channels;
  const everyChannel = tickedChannels.length === channels.length;
  const linesBy: ServiceLines = !canChannel && choice.lines === "channel" ? "service" : choice.lines;
  const wantChannels = canChannel && (!everyChannel || linesBy === "channel");
  const chosen = byVisits.filter((service) => tickedServices.includes(service.key));
  return { byVisits, tickedServices, channels, canChannel, tickedChannels, everyChannel, linesBy, wantChannels, chosen };
}

export type ServiceMonthPicks = ReturnType<typeof serviceMonthPicks>;

/** The month chart's read for these picks: the ticked services with the page numbers they're kept under, by channel when needed. */
export function serviceDaysArgs(picks: Pick<ServiceMonthPicks, "chosen" | "wantChannels">) {
  return { services: picks.chosen.map((service) => ({ key: service.key, refs: service.refs })), channels: picks.wantChannels };
}

type LinePoint = { day: string; lastDay?: string; value: number };
/** A line as the chart draws it (`DaysLine`). */
export type ServiceLine = { key: string; name: string; colour: string; points: LinePoint[]; per?: LinePoint[]; dashed?: boolean; under?: boolean; gaps?: boolean };

/** A run of figures as a line's points: [visits, page views, events] for a service, [visits, events] for a channel. */
function pointsOf(points: ReadonlyArray<{ day: string; lastDay?: string }>, series: readonly number[][] | null | undefined, at: number): LinePoint[] {
  return points.map((point, index) => ({ day: point.day, ...(point.lastDay ? { lastDay: point.lastDay } : {}), value: series?.[index]?.[at] ?? 0 }));
}

/** Figures added up across several runs of the same points. */
function added(runs: ReadonlyArray<readonly number[][] | null | undefined>, length: number, width: number): number[][] {
  const out = Array.from({ length }, () => Array.from({ length: width }, () => 0));
  for (const run of runs) run?.forEach((figures, index) => figures.forEach((value, at) => { if (out[index]) out[index][at] += value; }));
  return out;
}

/**
 * Every line on the month chart, worked out once for these figures and menus: the chart draws them all (`drawn`), and the eye
 * reads the main ones (`main`). The colours come in, as the screen draws them; the server's are blank.
 */
export function serviceMonthLines(
  read: ServiceDaysAnswer | null | undefined,
  picks: Pick<ServiceMonthPicks, "byVisits" | "chosen" | "channels" | "tickedChannels" | "everyChannel" | "linesBy" | "wantChannels">,
  choice: { show: ServiceShow; against: ServiceAgainst; comparing: boolean },
  words: { these: string; website: string; before: (name: string) => string },
  colours: { lines: readonly string[]; one: string; website: string },
): { main: ServiceLine[]; drawn: ServiceLine[] } {
  const { byVisits, chosen, channels, tickedChannels, everyChannel, linesBy, wantChannels } = picks;
  const { show, against, comparing } = choice;
  const points = read?.points ?? [];
  const beforePoints = read?.before?.points ?? null;
  const seriesOf = new Map((read?.services ?? []).map((one) => [one.key, one]));
  /** One group's figures over the points: services' own, or their channels ticked, or one channel's. */
  const groupRuns = (keys: readonly string[], onlyChannel: string | null, which: "now" | "before") => {
    const length = which === "now" ? points.length : beforePoints?.length ?? 0;
    if (!wantChannels && onlyChannel === null) return { figures: added(keys.map((key) => seriesOf.get(key)?.[which]), length, 3), channel: false };
    const runs = keys.flatMap((key) => (seriesOf.get(key)?.channels ?? []).filter((one) => (onlyChannel ? one.channel === onlyChannel : tickedChannels.includes(one.channel))).map((one) => one[which]));
    return { figures: added(runs, length, 2), channel: true };
  };
  const lineOf = (key: string, name: string, colour: string, runs: { figures: number[][]; channel: boolean }, onPoints: ReadonlyArray<{ day: string; lastDay?: string }>, extra: Partial<ServiceLine> = {}): ServiceLine => {
    const eventsAt = runs.channel ? 1 : 2;
    const at = show === "visits" ? 0 : show === "views" ? 1 : eventsAt;
    return {
      key, name, colour, ...extra,
      points: pointsOf(onPoints, runs.figures, at),
      ...(show === "rate" ? { per: pointsOf(onPoints, runs.figures, 0) } : {}),
    };
  };
  const colourAt = (index: number) => colours.lines[index % colours.lines.length] ?? "";
  const drawnGroups: Array<{ key: string; name: string; colour: string; keys: string[]; channel: string | null }> = linesBy === "service"
    ? chosen.map((service) => ({ key: `s:${service.key}`, name: service.name, colour: colourAt(byVisits.indexOf(service)), keys: [service.key], channel: null }))
    : linesBy === "channel"
      ? tickedChannels.map((channel) => ({ key: `c:${channel}`, name: channel, colour: colourAt(channels.indexOf(channel)), keys: chosen.map((service) => service.key), channel }))
      : [{ key: "one", name: words.these, colour: colours.one, keys: chosen.map((service) => service.key), channel: null }];
  const mainLines = drawnGroups.map((one) => lineOf(one.key, one.name, one.colour, groupRuns(one.keys, one.channel, "now"), points, show === "rate" ? { gaps: true } : {}));
  const under = comparing && beforePoints ? drawnGroups.map((one) => lineOf(`${one.key}:before`, words.before(one.name), one.colour, groupRuns(one.keys, one.channel, "before"), beforePoints, { dashed: true, under: true, gaps: true })) : [];
  const websiteRuns = (): { figures: number[][]; channel: boolean } => {
    if (!wantChannels || everyChannel) return { figures: read?.website.now ?? [], channel: false };
    return { figures: added((read?.website.channels ?? []).filter((one) => tickedChannels.includes(one.channel)).map((one) => one.now), points.length, 2), channel: true };
  };
  const website = against === "website" && read ? [lineOf("website", words.website, colours.website, websiteRuns(), points, { dashed: true, ...(show === "rate" ? { gaps: true } : {}) })] : [];
  return { main: mainLines, drawn: [...mainLines, ...under, ...website] };
}

/** The month chart's part, as the eye and Ask Hakken's redraw read it: each line's figure for each step, as the chart adds them up. */
export function servicesEachStepForEye(read: ServiceDaysAnswer | null | undefined, show: ServiceShow, linesBy: ServiceLines, main: readonly ServiceLine[], step: "day" | "week" | "month") {
  return read && read.state === "ready" ? { show, lines: linesBy, steps: stepRows(main, step) } : undefined;
}

/** Each step's figure for each line, added up as the chart adds them, by the line's name: for the eye, never an average. */
function stepRows(lines: readonly ServiceLine[], step: "day" | "week" | "month") {
  const rows = new Map<string, Record<string, number | string>>();
  const pers = new Map<string, Map<string, number>>();
  for (const line of lines) {
    line.points.forEach((point, at) => {
      const key = step === "day" ? point.day : step === "week" ? weekOf(point.day) : point.day.slice(0, 7);
      // Named by its grain (day, week or month), so the eye reads the list as dates and keeps the newest.
      const row = rows.get(key) ?? rows.set(key, { [step]: key }).get(key)!;
      row[line.name] = Number(row[line.name] ?? 0) + point.value;
      if (line.per) {
        const held = pers.get(key) ?? pers.set(key, new Map()).get(key)!;
        held.set(line.name, (held.get(line.name) ?? 0) + (line.per[at]?.value ?? 0));
      }
    });
  }
  // A figure for every 100 visits is worked out once each step is added up.
  for (const [key, held] of pers) for (const [name, visits] of held) rows.get(key)![name] = perHundredOf(Number(rows.get(key)![name] ?? 0), visits);
  return [...rows.values()];
}

/** A day's week, by its Monday. */
function weekOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const back = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}
