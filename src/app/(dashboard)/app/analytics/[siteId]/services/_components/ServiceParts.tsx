"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { SERVICE_GROUPS, SPLIT_PICKS, perHundredOf, serviceSplit, type ServiceGroup, type SplitPick } from "@/convex/utils/serviceGroups";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import type { ExplorerControl } from "@/src/ui/components/screens/ChartExplorer";
import { DaysChart, type DaysLine, type DaysPoint } from "@/src/ui/components/screens/DaysChart";
import { DotGroups } from "@/src/ui/components/screens/DotGroups";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { MapCard } from "@/src/ui/components/screens/MapCard";
import { PageMap, arrowMove, type PageMapBox } from "@/src/ui/components/screens/PageMap";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";
import { formatNumber, toCsv } from "@/src/app/(dashboard)/app/sites/_components/siteFormat";
import { TABLE_PAGE_KEY, useSiteParam, useSiteTicks } from "@/src/app/(dashboard)/app/sites/_components/useSiteParam";
import { CHANNEL_LINE_COLOURS } from "@/src/app/(dashboard)/app/analytics/_components/AnalyticsChart";
import { useAnalyticsArgs, useAnalyticsStatus, usePageHref, useStep } from "@/src/app/(dashboard)/app/analytics/_components/useAnalytics";
import { useSpanInWords, useSpanWords } from "@/src/app/(dashboard)/app/analytics/_components/VisitsCharts";

/**
 * What Services reads and says (docs/plans/active/services-new-page-plan-2026-11-07.md; board "The new page so far" on the canvas
 * "Hakken — Services, four ways"). Every chart is a shared part (`Figure`, `DaysChart`, `DotGroups` in a `MapCard`, `PageMap`), as
 * Anthony asked: "if we do create new they have to be built as a shared component". What's here is the reading, the words and the
 * figures each part is handed. The groups come from one rule (`serviceSplit`), so the boxes, the dots, the map, the table, the eye
 * and Ask Hakken always put a service in the same group, named by its numbers, never busy or quiet (Anthony, 2026-11-07).
 */

export type ServicesAnswer = FunctionReturnType<typeof api.googleAnalyticsServiceReads.analyticsServices>;
export type Service = ServicesAnswer["services"][number];

/** Services ticked on the month chart as it opens: the busiest five. */
const FIRST_TICKED = 5;
/** The map's boxes at most, the busiest first, as on All pages and Campaigns. */
const MAP_SERVICES = 40;

const ACROSS = ["visits", "started", "views"] as const;
export type Across = (typeof ACROSS)[number];
const DOINGS = ["events", "stayed", "scrolled"] as const;
export type Doing = (typeof DOINGS)[number];

/** The whole page's read: the boxes, dots, map, table and eye all read this one answer. */
export function useServices() {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  return useQuery(api.googleAnalyticsServiceReads.analyticsServices, status?.connection?.newestDay ? args : "skip");
}

/** The dates and the dates before, in the page's words: "Last 12 months" and "the 12 months before". */
export function useServiceSpans(answer: ServicesAnswer | undefined) {
  const span = answer?.from && answer.to ? { from: answer.from, to: answer.to } : null;
  const before = answer?.beforeFrom && answer.beforeTo ? { from: answer.beforeFrom, to: answer.beforeTo } : null;
  return { words: useSpanWords(span, before), inWords: useSpanInWords(span, before) };
}

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
 * The dots' menus and the groups they make, shared by the boxes, the dots, the map and the table: change one and the others
 * follow. Every menu lives in the address, so a link opens what was showing. The Classification chip holds the whole page to one.
 */
export function useServiceGroups(answer: ServicesAnswer | undefined) {
  const t = useTranslations("googleAnalytics.services");
  const [classification, setClassification] = useSiteParam<string>("classification", "");
  const [across, setAcross] = useSiteParam<Across>("dots", "visits", ACROSS);
  const [doing, setDoing] = useSiteParam<Doing>("doing", "events", DOINGS);
  const [acrossPick, setAcrossPick] = useSiteParam<SplitPick>("across", "middle", SPLIT_PICKS);
  const [upPick, setUpPick] = useSiteParam<SplitPick>("up", "middle", SPLIT_PICKS);
  const [group, setGroup] = useSiteParam<ServiceGroup | "">("group", "", ["", ...SERVICE_GROUPS]);
  const [tickedChannels, setTickedChannels] = useSiteTicks("dotChannels");
  return useMemo(() => {
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
    const unit = t(`groups.units.${across}`);
    const per = t(`groups.per.${doing}`);
    const acrossWords = (more: boolean) => t(`groups.across.${across === "views" ? "views" : "visits"}.${more ? "more" : "fewer"}`, { count: split.split.x });
    const upWords = (more: boolean) => t(more ? "groups.upMore" : "groups.upFewer", { rate: split.split.y.toFixed(1), per });
    // Named by their figures alone (Anthony, 2026-11-07: "Dont call them busy or quiet jsut show the facts in the numbers").
    const names = Object.fromEntries(SERVICE_GROUPS.map((key) => [key, t("groups.name", {
      across: acrossWords(key === "rightHigh" || key === "rightLow"),
      up: upWords(key === "rightHigh" || key === "leftHigh"),
    })])) as Record<ServiceGroup, string>;
    const groupOf = new Map<string, ServiceGroup>();
    for (const key of SERVICE_GROUPS) for (const service of split.groups[key]) groupOf.set(service.key, key);
    const inGroup = (service: Service) => !group || groupOf.get(service.key) === group;
    return {
      services, channels, ticked, canChannel, through, xOf, yOf, websiteLine, split, names, groupOf, inGroup, unit,
      across, doing, acrossPick, upPick, group, classification: known ? classification : "",
      setAcross, setDoing, setAcrossPick, setUpPick, setGroup, setTickedChannels, setClassification,
    };
  }, [answer, classification, across, doing, acrossPick, upPick, group, tickedChannels, t, setAcross, setDoing, setAcrossPick, setUpPick, setGroup, setTickedChannels, setClassification]);
}
export type ServiceGroups = ReturnType<typeof useServiceGroups>;

/** The address with one choice changed, and the table back on its first page. */
function useHrefWith() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete(TABLE_PAGE_KEY);
    const text = next.toString();
    return `${pathname}${text ? `?${text}` : ""}`;
  };
}

/**
 * Four boxes, one for each group, in All pages' format (Anthony, 2026-11-07: "heading, number, description"): a short heading, how
 * many services as the number, and the group's own numbers under it, as All pages' "Out of 1 pages with 50 visits or more." The
 * heading says which side of each line the group is on; the numbers stay in the description ("just show the facts in the numbers").
 * Pressing one shows just that group on the map and in the table, and pressing it again shows them all.
 */
export function ServiceBoxes({ groups }: { groups: ServiceGroups }) {
  const t = useTranslations("googleAnalytics.services.boxes");
  const hrefWith = useHrefWith();
  const unit = groups.across === "views" ? "views" : "visits";
  return (
    <FigureRow columns={4}>
      {SERVICE_GROUPS.map((key) => {
        const list = groups.split.groups[key];
        const heading = t("heading", {
          across: t(`across.${unit}.${key === "rightHigh" || key === "rightLow" ? "more" : "fewer"}`),
          up: t(`up.${groups.doing}.${key === "rightHigh" || key === "leftHigh" ? "more" : "fewer"}`),
        });
        return (
          <Figure
            key={key}
            arrow={false}
            href={hrefWith("group", groups.group === key ? null : key)}
            emphasis={groups.group === key}
            label={heading}
            value={formatNumber(list.length)}
            detail={<span className="text-secondary">{t("description", { name: groups.names[key] })}</span>}
          />
        );
      })}
    </FigureRow>
  );
}

type Show = "visits" | "events" | "rate" | "views";
const SHOWS: readonly Show[] = ["visits", "events", "rate", "views"];
type Lines = "service" | "channel" | "one";
const LINES: readonly Lines[] = ["service", "channel", "one"];
type Against = "nothing" | "before" | "website";
const AGAINST: readonly Against[] = ["nothing", "before", "website"];

/** A run of figures as a line's points: [visits, page views, events] for a service, [visits, events] for a channel. */
function pointsOf(points: ReadonlyArray<{ day: string; lastDay?: string }>, series: readonly number[][] | null | undefined, at: number): DaysPoint[] {
  return points.map((point, index) => ({ day: point.day, ...(point.lastDay ? { lastDay: point.lastDay } : {}), value: series?.[index]?.[at] ?? 0 }));
}

/** Figures added up across several runs of the same points. */
function added(runs: ReadonlyArray<readonly number[][] | null | undefined>, length: number, width: number): number[][] {
  const out = Array.from({ length }, () => Array.from({ length: width }, () => 0));
  for (const run of runs) run?.forEach((figures, index) => figures.forEach((value, at) => { if (out[index]) out[index][at] += value; }));
  return out;
}

/**
 * Visits to each service each day, week or month, following the page's step menu (Anthony, 2026-11-07: "add this chart to way 4 as
 * the first component"). Show, Services, Channels, Lines and Compare with all recalculate it. No Up or down under it ("we dont need
 * the table"). Channels are kept for every device only, so with a device picked they leave the menus, and the chart says so.
 */
export function ServiceMonthCard({ answer, groups }: { answer: ServicesAnswer; groups: ServiceGroups }) {
  const t = useTranslations("googleAnalytics.services.months");
  const tc = useTranslations("googleAnalytics.chart");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const [step] = useStep();
  const { words, inWords } = useServiceSpans(answer);
  const [show, setShow] = useSiteParam<Show>("show", "visits", SHOWS);
  const [lines, setLines] = useSiteParam<Lines>("lines", "service", LINES);
  const [against, setAgainst] = useSiteParam<Against>("against", "nothing", AGAINST);
  const [pickedServices, setServices] = useSiteTicks("services");
  const [pickedChannels, setChannels] = useSiteTicks("channels");
  const byVisits = useMemo(() => [...groups.services].filter((service) => service.now.visits > 0).sort((left, right) => right.now.visits - left.now.visits), [groups.services]);
  const tickedServices = (pickedServices ?? byVisits.slice(0, FIRST_TICKED).map((service) => service.key)).filter((key) => byVisits.some((service) => service.key === key));
  const channels = answer.channels;
  // Channels split visits and events: never page views, and never one device.
  const canChannel = channels.length > 0 && show !== "views";
  const tickedChannels = canChannel ? (pickedChannels ?? channels).filter((channel) => channels.includes(channel)) : channels;
  const everyChannel = tickedChannels.length === channels.length;
  const linesBy: Lines = !canChannel && lines === "channel" ? "service" : lines;
  const wantChannels = canChannel && (!everyChannel || linesBy === "channel");
  const chosen = byVisits.filter((service) => tickedServices.includes(service.key));
  const read = useQuery(api.googleAnalyticsServiceReads.analyticsServiceDays, chosen.length > 0 ? { ...args, services: chosen.map((service) => ({ key: service.key, refs: service.refs })), channels: wantChannels } : "skip");
  const beforePoints = read?.before?.points ?? null;
  const tickedKey = tickedServices.join(",");
  const channelsKey = tickedChannels.join(",");
  const these = t("these");
  const websiteName = t("website");
  const beforeName = (name: string) => t("lineBefore", { name, before: inWords.before });
  const comparing = against === "before" && beforePoints !== null && beforePoints.length > 0;
  // Every line, worked out once for these figures and menus: the chart draws them, and the eye reads them.
  const { main, drawn } = useMemo(() => {
    const points = read?.points ?? [];
    const seriesOf = new Map((read?.services ?? []).map((one) => [one.key, one]));
    /** One group's figures over the points: services' own, or their channels ticked, or one channel's. */
    const groupRuns = (keys: readonly string[], onlyChannel: string | null, which: "now" | "before") => {
      const length = which === "now" ? points.length : beforePoints?.length ?? 0;
      if (!wantChannels && onlyChannel === null) return { figures: added(keys.map((key) => seriesOf.get(key)?.[which]), length, 3), channel: false };
      const runs = keys.flatMap((key) => (seriesOf.get(key)?.channels ?? []).filter((one) => (onlyChannel ? one.channel === onlyChannel : tickedChannels.includes(one.channel))).map((one) => one[which]));
      return { figures: added(runs, length, 2), channel: true };
    };
    const lineOf = (key: string, name: string, colour: string, runs: { figures: number[][]; channel: boolean }, onPoints: ReadonlyArray<{ day: string; lastDay?: string }>, extra: Partial<DaysLine> = {}): DaysLine => {
      const eventsAt = runs.channel ? 1 : 2;
      const at = show === "visits" ? 0 : show === "views" ? 1 : eventsAt;
      return {
        key, name, colour, ...extra,
        points: pointsOf(onPoints, runs.figures, at),
        ...(show === "rate" ? { per: pointsOf(onPoints, runs.figures, 0) } : {}),
      };
    };
    const drawnGroups: Array<{ key: string; name: string; colour: string; keys: string[]; channel: string | null }> = linesBy === "service"
      ? chosen.map((service) => ({ key: `s:${service.key}`, name: service.name, colour: CHANNEL_LINE_COLOURS[byVisits.indexOf(service) % CHANNEL_LINE_COLOURS.length], keys: [service.key], channel: null }))
      : linesBy === "channel"
        ? tickedChannels.map((channel) => ({ key: `c:${channel}`, name: channel, colour: CHANNEL_LINE_COLOURS[channels.indexOf(channel) % CHANNEL_LINE_COLOURS.length], keys: chosen.map((service) => service.key), channel }))
        : [{ key: "one", name: these, colour: CHART_SERIES_ORANGE, keys: chosen.map((service) => service.key), channel: null }];
    const mainLines = drawnGroups.map((one) => lineOf(one.key, one.name, one.colour, groupRuns(one.keys, one.channel, "now"), points, show === "rate" ? { gaps: true } : {}));
    const under = comparing ? drawnGroups.map((one) => lineOf(`${one.key}:before`, beforeName(one.name), one.colour, groupRuns(one.keys, one.channel, "before"), beforePoints!, { dashed: true, under: true, gaps: true })) : [];
    const websiteRuns = (): { figures: number[][]; channel: boolean } => {
      if (!wantChannels || everyChannel) return { figures: read?.website.now ?? [], channel: false };
      return { figures: added((read?.website.channels ?? []).filter((one) => tickedChannels.includes(one.channel)).map((one) => one.now), points.length, 2), channel: true };
    };
    const website = against === "website" && read ? [lineOf("website", websiteName, CHART_COMPARATOR_GREY, websiteRuns(), points, { dashed: true, ...(show === "rate" ? { gaps: true } : {}) })] : [];
    return { main: mainLines, drawn: [...mainLines, ...under, ...website] };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the ticks decide by their keys; `beforeName` is new each draw and follows `inWords.before`.
  }, [read, show, linesBy, tickedKey, channelsKey, wantChannels, everyChannel, against, comparing, these, websiteName, inWords.before]);

  // What the eye and Ask Hakken's redraw read: each line's figure for each step, as the chart adds them up.
  const seen = useMemo(() => (read && read.state === "ready" ? { show, lines: linesBy, steps: stepRows(main, step) } : undefined), [read, show, linesBy, main, step]);
  useSeesPart("servicesEachStep", seen);

  const when = against === "before" && comparing ? t("hintAgainst", { now: words.now, before: inWords.before }) : against === "website" ? t("hintWebsite", { now: words.now }) : t("hint", { now: words.now });
  const controls: ExplorerControl[] = [
    { kind: "select", key: "show", label: t("showLabel"), value: show, options: SHOWS.map((one) => ({ value: one, label: t(`show.${one}`) })), onChange: (next) => setShow(next as Show) },
    { kind: "ticks", key: "services", label: t("services"), everyWord: t("everyService"), choices: byVisits.map((service) => ({ key: service.key, label: service.name })), ticked: tickedServices, onChange: setServices },
    ...(canChannel ? [{ kind: "ticks" as const, key: "channels", label: t("channels"), everyWord: t("everyChannel"), choices: channels.map((channel) => ({ key: channel, label: channel })), ticked: tickedChannels, onChange: setChannels }] : []),
    { kind: "select", key: "lines", label: t("linesLabel"), value: linesBy, options: LINES.filter((one) => one !== "channel" || canChannel).map((one) => ({ value: one, label: t(`lines.${one}`) })), onChange: (next) => setLines(next as Lines) },
    {
      kind: "select", key: "against", label: t("compareWith"), value: comparing || against !== "before" ? against : "nothing",
      options: [{ value: "nothing", label: t("nothing") }, ...(beforePoints ? [{ value: "before", label: words.beforeNamed ?? words.before }] : []), { value: "website", label: t("website") }],
      onChange: (next) => setAgainst(next as Against),
    },
  ];
  const nothingTicked = tickedServices.length === 0 ? t("nothingServices") : canChannel && tickedChannels.length === 0 ? t("nothingChannels") : null;
  return (
    <DaysChart
      title={t(`title.${show}.${linesBy}`, { each: t(`each.${step}`) })}
      hint={(coarse) => [
        when,
        canChannel && !everyChannel ? t("arrived") : null,
        channels.length === 0 && args.device !== "" ? t("noChannels") : null,
        (read?.leftOut ?? 0) > 0 ? t("leftOut", { most: chosen.length - (read?.leftOut ?? 0) }) : null,
        coarse && show !== "rate" ? tc(`coarse.${step === "month" ? "week" : step}`) : null,
      ].filter(Boolean).join(" ")}
      exportName="google-analytics-services-each-step"
      csvDay={t("csvDay")}
      host={status?.host ?? ""}
      step={step}
      waiting={read === undefined && chosen.length > 0 ? undefined : read?.state === "collecting" ? t("collecting") : null}
      controls={controls}
      nothingTicked={nothingTicked}
      lines={drawn}
      figure={t(`figure.${show}`)}
      plain
      anything={(rows) => rows.some((row) => main.some((line) => Number(row[line.key]) > 0))}
      empty={t("empty")}
      height={320}
      {...(show === "rate" ? { format: (value: number) => value.toFixed(1) } : {})}
    />
  );
}

/** Each step's figure for each line, added up as the chart adds them, by the line's name: for the eye, never an average. */
function stepRows(lines: readonly DaysLine[], step: "day" | "week" | "month") {
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

/**
 * Which services get visits, and which get people in touch (Anthony, 2026-11-07: "keep this chart i like it"): each dot a service,
 * further right the more visits, higher up the more events for every 100. Its menus move the lines, and the boxes and the table
 * follow. Its first page: the dots are in the kit, but no page used them until now.
 */
export function ServiceDotsCard({ groups, host }: { groups: ServiceGroups; host: string }) {
  const t = useTranslations("googleAnalytics.services.dots");
  const tm = useTranslations("googleAnalytics.services.months");
  const shown = groups.split.shown;
  // A few names on the chart: the four busiest and the four with the most for their visits, so the key isn't the only way in.
  const named = useMemo(() => {
    const busiest = [...shown].sort((left, right) => groups.xOf(right) - groups.xOf(left)).slice(0, 4);
    const best = [...shown].filter((service) => groups.xOf(service) >= groups.split.split.x).sort((left, right) => groups.yOf(right) - groups.yOf(left)).slice(0, 4);
    return new Set([...busiest, ...best].map((service) => service.key));
  }, [shown, groups]);
  const seen = useMemo(() => ({
    count: groups.across,
    show: groups.doing,
    lineAcross: groups.split.split.x,
    lineUp: groups.split.split.y,
    services: shown.map((service) => ({ name: service.name, across: groups.xOf(service), forEvery100: groups.yOf(service), group: groups.names[groups.groupOf.get(service.key)!] })),
  }), [shown, groups]);
  useSeesPart("servicesDots", seen);
  const lines = groups.split;
  const countWord = t(`count.${groups.across}`);
  const controls: ExplorerControl[] = [
    { kind: "select", key: "count", label: t("countLabel"), value: groups.across, options: ACROSS.map((one) => ({ value: one, label: t(`count.${one}`) })), onChange: (next) => groups.setAcross(next as Across) },
    { kind: "select", key: "show", label: t("showLabel"), value: groups.doing, options: DOINGS.map((one) => ({ value: one, label: t(`show.${one}`) })), onChange: (next) => groups.setDoing(next as Doing) },
    ...(groups.canChannel ? [{ kind: "ticks" as const, key: "channels", label: tm("channels"), everyWord: tm("everyChannel"), choices: groups.channels.map((channel) => ({ key: channel, label: channel })), ticked: groups.ticked, onChange: groups.setTickedChannels }] : []),
    { kind: "select", key: "from", label: t(`acrossLabel.${groups.across}`), value: groups.acrossPick, options: SPLIT_PICKS.map((pick) => ({ value: pick, label: t(`across.${pick}`, { count: formatNumber(lines.across[pick]) }) })), onChange: (next) => groups.setAcrossPick(next as SplitPick) },
    { kind: "select", key: "up", label: t(`upLabel.${groups.doing}`), value: groups.upPick, options: SPLIT_PICKS.map((pick) => ({ value: pick, label: t(`up.${pick}`, { rate: lines.up[pick].toFixed(1) }) })), onChange: (next) => groups.setUpPick(next as SplitPick) },
  ];
  const hint = [
    t("hint", { unit: groups.unit, did: t(`did.${groups.doing}`) }),
    t(`none.${groups.doing}`),
    groups.canChannel && groups.ticked.length < groups.channels.length ? tm("arrived") : null,
  ].filter(Boolean).join(" ");
  return (
    <MapCard
      title={t(`title.${groups.doing}`)}
      hint={hint}
      exportName="google-analytics-services-dots"
      csv={() => toCsv([t("countLabel"), countWord, t("readoutUp")], shown.map((service) => [service.name, groups.xOf(service), groups.yOf(service)]))}
      host={host}
      controls={controls}
      message={groups.canChannel && groups.ticked.length === 0 ? tm("nothingChannels") : shown.length === 0 ? t("empty") : null}
    >
      <DotGroups
        points={shown.map((service) => ({ x: groups.xOf(service), y: groups.yOf(service) > 0 ? groups.yOf(service) : 0.5, label: service.name, named: named.has(service.key) }))}
        split={lines.split}
        names={groups.names}
        xLabel={countWord}
        yLabel={t(`axis.${groups.doing}`)}
        readout={{ x: countWord, y: t("readoutUp") }}
        height={420}
      />
    </MapCard>
  );
}

type Count = "visits" | "views" | "events";
const COUNTS: readonly Count[] = ["visits", "views", "events"];
const figureOf = (service: Service, count: Count, which: "now" | "before") => service[which][count === "views" ? "views" : count];

/**
 * All your services (Anthony, 2026-11-07: "this is nice too"): each a box, the bigger the more it had, orange if it went up and grey
 * if it went down. Show picks a group, as the boxes do. Pressing a box opens that page's own screen, and its Back returns here.
 */
export function ServiceMapCard({ answer, groups, host, onOpen }: { answer: ServicesAnswer; groups: ServiceGroups; host: string; onOpen: (service: Service) => void }) {
  const t = useTranslations("googleAnalytics.services.map");
  const { inWords } = useServiceSpans(answer);
  const [count, setCount] = useSiteParam<Count>("count", "visits", COUNTS);
  const [colour, setColour] = useSiteParam<Count>("colour", "visits", COUNTS);
  const all = useMemo(() => groups.services.filter((service) => figureOf(service, count, "now") > 0 && groups.inGroup(service)).sort((left, right) => figureOf(right, count, "now") - figureOf(left, count, "now")), [groups, count]);
  const boxed = useMemo(() => all.slice(0, MAP_SERVICES), [all]);
  const byKey = new Map(boxed.map((service) => [service.key, service]));
  const boxes: PageMapBox[] = boxed.map((service) => ({
    id: service.key,
    name: service.name,
    size: figureOf(service, count, "now"),
    now: figureOf(service, colour, "now"),
    before: answer.hasBefore ? figureOf(service, colour, "before") : null,
    figure: t(`figure.${count}`, { count: figureOf(service, count, "now") }),
    readout: [
      { value: formatNumber(service.now.visits), label: t("in.visits", { when: inWords.now }) },
      ...(answer.hasBefore ? [
        { value: formatNumber(service.before.visits), label: t("in.visits", { when: inWords.before }) },
        { value: arrowMove(service.now.visits, service.before.visits) ?? t("same"), label: t("upOrDown") },
      ] : []),
      { value: formatNumber(service.now.events), label: t("in.events", { when: inWords.now }) },
      ...(answer.hasBefore ? [{ value: formatNumber(service.before.events), label: t("in.events", { when: inWords.before }) }] : []),
    ],
  }));
  const seen = useMemo(() => ({ count, colour, services: boxed.map((service) => ({ name: service.name, [count]: figureOf(service, count, "now"), [`${count}Before`]: answer.hasBefore ? figureOf(service, count, "before") : null })) }), [boxed, count, colour, answer.hasBefore]);
  useSeesPart("servicesMap", seen);
  const groupOptions = [{ value: "", label: t("everyService") }, ...SERVICE_GROUPS.map((key) => ({ value: key, label: groups.names[key] }))];
  return (
    <MapCard
      title={t("title")}
      hint={`${t(`hint.${count}`)}${answer.hasBefore ? ` ${t(`colourHint.${colour}`, { before: inWords.before })}` : ""}`}
      exportName="google-analytics-services-map"
      csv={() => toCsv([t("measure.visits"), t("in.visits", { when: inWords.now }), t("in.events", { when: inWords.now })], boxed.map((service) => [service.name, service.now.visits, service.now.events]))}
      host={host}
      controls={[
        { kind: "select", key: "count", label: t("count"), value: count, options: COUNTS.map((one) => ({ value: one, label: t(`measure.${one}`) })), onChange: (next) => setCount(next as Count) },
        { kind: "select", key: "colour", label: t("colour"), value: colour, options: COUNTS.map((one) => ({ value: one, label: t(`measure.${one}`) })), onChange: (next) => setColour(next as Count) },
        { kind: "select", key: "group", label: t("show"), value: groups.group, options: groupOptions, onChange: (next) => groups.setGroup(next as ServiceGroup | "") },
      ]}
      message={boxes.length === 0 ? t("empty") : null}
      under={all.length > boxed.length ? <p className="text-[12px] text-muted">{t("leftOut", { count: all.length - boxed.length })}</p> : null}
    >
      <PageMap boxes={boxes} height={380} onOpen={(id) => { const service = byKey.get(id); if (service) onOpen(service); }} />
    </MapCard>
  );
}

/** A service's own page screen, with Back returning here as it was. */
export function useOpenService() {
  const pageHref = usePageHref();
  return (service: Service) => pageHref(service.page);
}
