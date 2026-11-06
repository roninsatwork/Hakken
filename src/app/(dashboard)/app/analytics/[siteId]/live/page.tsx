"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Radio } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { isUnknownValue } from "@/convex/utils/analyticsUnknown";
import { LEAST_USUAL_FOR_A_VERDICT, liveVerdict, usualNow } from "@/convex/utils/liveFigures";
import { normalisePage } from "@/convex/utils/pageClassification";
import { NOT_SORTED_KIND } from "@/convex/utils/pageKinds";
import { SHOP_PAGES_KIND } from "@/convex/utils/shopPages";
import { AgainstBars, type AgainstRow } from "@/src/ui/components/screens/AgainstBars";
import { Button } from "@/src/ui/components/screens/Button";
import { Change } from "@/src/ui/components/screens/Change";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { ListTable } from "@/src/ui/components/screens/ListTable";
import { LiveDot } from "@/src/ui/components/screens/LiveDot";
import { MinuteBars } from "@/src/ui/components/screens/MinuteBars";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Tooltip } from "@/src/ui/components/screens/Tooltip";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { SearchConsoleChartCard } from "../../../search-console/_components/SearchConsoleChartCard";
import { CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { PageLink } from "../../_components/AnalyticsCells";
import { AnalyticsGate } from "../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { ClassificationMap, type ClassificationBox } from "../../_components/ClassificationMap";
import { useEventName } from "../../_components/useEventName";
import { ASK_EVERY_MS, CHECK_EVERY_MS, liveStep } from "../../_components/liveTiming";
import { useEyeNames } from "../../_components/useEyeFigures";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePageHref, type AnalyticsStatus } from "../../_components/useAnalytics";

const LISTS = ["pages", "places", "devices", "events"] as const;
type LiveList = (typeof LISTS)[number];
type Answer = Extract<FunctionReturnType<typeof api.googleAnalyticsRealtime.askGoogleAnalyticsRealtime>, { ok: true }>;
type Row = Answer["rows"][number];

/** Each list's count in its table bar. */
const NOUNS = { pages: "pages", places: "places", devices: "devices", events: "events" } as const;

const SORTS: SiteSortColumns<Row & { label: string }, "name" | "people" | "views" | "times"> = {
  name: { value: (row) => row.label, first: "asc" },
  people: { value: (row) => row.people, first: "desc" },
  views: { value: (row) => row.views, first: "desc" },
  times: { value: (row) => row.times, first: "desc" },
};
const labelOf = (row: { label: string }) => row.label;

/** Things that mean someone is still at the page. */
const TOUCHES = ["pointermove", "pointerdown", "keydown", "scroll", "touchstart"] as const;

/**
 * Live, as Anthony chose it (2026-11-06: "WAY 3 WITH MODIFICATIONS IS WHAT I WANT"; docs/plans/active/live-new-page-plan-2026-11-06.md):
 * who is on the website right now, and what they've done in the last 30 minutes. A line saying when it next updates, four boxes
 * naming the busiest things, people each minute, the last half hour against usual, what people are looking at by Classification,
 * and one table switching between pages, places, devices and events. Every country counts, as in Google's own Realtime, so the page
 * offers no home country (Anthony, 2026-10-13). Asked of Google once a minute, only while this page is open and in front
 * (`liveTiming.ts`), paused after 30 minutes untouched; nothing kept.
 */
export default function AnalyticsLivePage() {
  const t = useTranslations("googleAnalytics.live");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Radio className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <LiveBody status={status} />
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

/**
 * The live figures, asked once a minute while the page is in front. Asks again
 * at once when what is asked changes; never while hidden; pauses after 30
 * minutes untouched until `carryOn`.
 */
function useLiveFigures(ask: { siteId: string; device: string; list: LiveList }) {
  const askLive = useAction(api.googleAnalyticsRealtime.askGoogleAnalyticsRealtime);
  const { run } = useAdminAction({ scope: "google-analytics-realtime" });
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  // Whether the page is in front: behind another tab it asks nothing, and says so.
  const [inFront, setInFront] = useState(true);
  const key = JSON.stringify(ask);
  // Touched when it opens: the clock is read in the effect below, never while drawing.
  const moment = useRef({ askedAt: null as number | null, asking: false, touchedAt: 0, key });
  const tick = useCallback(async () => {
    const held = moment.current;
    setInFront(document.visibilityState === "visible");
    const step = liveStep({ visible: document.visibilityState === "visible", paused, asking: held.asking, askedAt: held.askedAt, touchedAt: held.touchedAt, now: Date.now() });
    if (step === "pause") setPaused(true);
    if (step !== "ask") return;
    held.asking = true;
    held.askedAt = Date.now();
    const asked = held.key;
    // Nobody pressed anything: a failure is said on the page, never as a toast, and asked again next minute.
    const outcome = await run(() => askLive(JSON.parse(asked) as Parameters<typeof askLive>[0]), { key: `${asked}|${held.askedAt}`, suppressErrorToast: true });
    held.asking = false;
    // An answer for what was asked before the choice changed is dropped.
    if (moment.current.key !== asked) return;
    if (!outcome.ok) setProblem("FAILED");
    else if (outcome.data.ok) {
      setAnswer(outcome.data);
      setProblem(null);
    } else setProblem(outcome.data.problem);
  }, [askLive, paused, run]);
  useEffect(() => {
    // A new choice is asked at once: on the next turn, outside the effect itself.
    moment.current = { ...moment.current, key, askedAt: null, touchedAt: moment.current.touchedAt || Date.now() };
    const first = setTimeout(() => void tick(), 0);
    return () => clearTimeout(first);
  }, [key, tick]);
  useEffect(() => {
    const touched = () => {
      moment.current.touchedAt = Date.now();
    };
    const shown = () => void tick();
    const timer = setInterval(() => void tick(), CHECK_EVERY_MS);
    for (const touch of TOUCHES) window.addEventListener(touch, touched, { passive: true });
    document.addEventListener("visibilitychange", shown);
    return () => {
      clearInterval(timer);
      for (const touch of TOUCHES) window.removeEventListener(touch, touched);
      document.removeEventListener("visibilitychange", shown);
    };
  }, [tick]);
  const carryOn = () => {
    moment.current.touchedAt = Date.now();
    moment.current.askedAt = null;
    setPaused(false);
  };
  return { answer, problem, paused, carryOn, inFront };
}

function LiveBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.live");
  const tf = useTranslations("googleAnalytics.filters");
  const tn = useTranslations("googleAnalytics.visitors.names");
  const tk = useTranslations("googleAnalytics.visitors.kinds");
  const args = useAnalyticsArgs();
  const nameOfEvent = useEventName();
  const pageHref = usePageHref();
  const [list, setList] = useSiteParam<LiveList>("view", "pages", LISTS);
  const { answer, problem, paused, carryOn, inFront } = useLiveFigures({ siteId: args.siteId, device: args.device, list });
  const [search, setSearch, term] = useSiteSearch();
  const nameOf = (name: string) => (isUnknownValue(name) ? tn("unknown")
    : list === "devices" ? (tf.has(`devices.${name}`) ? tf(`devices.${name}`) : name)
      : list === "events" ? nameOfEvent(name) : name);
  const named = answer?.rows.map((row) => ({ ...row, label: nameOf(row.name) }));
  const matching = named?.filter((row) => !term || row.label.toLowerCase().includes(term.toLowerCase()));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: list === "events" ? "times" : "people", name: labelOf });
  const pager = useSitePager(sorted, { isLoading: answer === null && !problem });
  // The hour Google was last asked, so each figure can be set against this day of the week and this hour.
  const hour = answer ? Math.floor(answer.askedAt / 3_600_000) * 3_600_000 : null;
  const usual = useQuery(api.googleAnalyticsLiveUsual.analyticsLiveUsual, { siteId: args.siteId, device: args.device, ...(hour !== null ? { at: hour } : {}) });
  // Last month's views by Classification, for the eye to set the map against, the shop's own pages apart as on the map.
  const usualKinds = useQuery(api.googleAnalyticsPageKindViews.analyticsPageKindViews, status.connection?.newestDay ? { siteId: args.siteId, period: "lastMonth", device: args.device, shopApart: true } : "skip");
  const live = inFront && !paused && !problem && answer !== null;
  const kindLabel = useCallback((kind: { kind: string; name: string | null }) => (
    kind.kind === NOT_SORTED_KIND ? tk("notSorted") : kind.kind === SHOP_PAGES_KIND ? t("shopPages") : kind.name ?? kind.kind
  ), [t, tk]);
  const boxes = useMemo(() => (answer?.kinds ?? []).map((kind) => ({ ...kind, label: kindLabel(kind) })), [answer?.kinds, kindLabel]);
  return (
    <div className="flex flex-col gap-4">
      <NextUpdate askedAt={answer?.askedAt ?? null} inFront={inFront} paused={paused} live={live} />
      {paused ? (
        <Notice>
          <span className="flex flex-wrap items-center gap-3">
            {t("paused")}
            <Button variant="outline" onClick={carryOn}>{t("carryOn")}</Button>
          </span>
        </Notice>
      ) : null}
      {problem ? <Notice tone="warning">{t(problem === "NOT_CONNECTED" ? "notConnected" : "busy")}</Notice> : null}
      <LiveSees status={status} answer={answer} list={list} usual={usual ?? null} usualKinds={usualKinds ?? null} boxes={boxes} kindLabel={kindLabel} />
      {answer ? <LiveBoxes answer={answer} live={live} /> : null}
      <MinutesCard answer={answer} host={status.host} />
      {answer ? <AgainstCard answer={answer} usual={usual ?? null} device={args.device} host={status.host} /> : null}
      {answer ? (
        <ClassificationMap
          boxes={boxes}
          title={t("mapTitle")}
          hint={t("mapHint", { views: formatNumber(answer.views) })}
          exportName="google-analytics-live-map"
          host={status.host}
          colour={CHART_SERIES_ORANGE}
          height={340}
          message={!answer.sorted ? tk("unsorted") : boxes.length === 0 ? t("mapEmpty") : null}
        />
      ) : null}
      <ListTable
        rows={pager.pageRows}
        rowKey={(row) => row.name}
        noun={NOUNS[list]}
        summary={<span className="text-[12px] text-secondary">{list === "pages" ? t("tableNotePages") : t("tableNote")}</span>}
        search={{ value: search, onChange: setSearch, placeholder: t(`find.${list}`) }}
        filters={<SiteViewSwitch label={t("showing")} options={LISTS.map((value) => ({ value, label: t(`lists.${value}`) }))} value={list} onChange={setList} />}
        actions={sorted ? (
          <ListDownload
            label={t("download")}
            fileName={`${status.host}-google-analytics-live-${list}`}
            rows={sorted}
            columns={[
              { header: t(`columns.${list}`), value: (row) => row.label },
              ...(list === "pages" ? [{ header: t("address"), value: (row: Row) => row.address ?? "" }] : []),
              ...(list === "events" ? [] : [{ header: t("people"), value: (row: Row) => row.people }]),
              ...(list === "pages" ? [{ header: t("views"), value: (row: Row) => row.views }] : []),
              ...(list === "events" ? [{ header: t("times"), value: (row: Row) => row.times }] : []),
            ]}
          />
        ) : undefined}
        sort={tableSort}
        empty={{ icon: <Radio className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : answer ? t("nobody") : t("asking") }}
        footer={pager.footer}
        columns={[
          // The page takes all the room the figures leave, and shows its address (Anthony, 2026-11-06: "show the URL").
          { key: "name", header: t(`columns.${list}`), sortable: true, className: "w-full max-w-0", cell: (row) => (list === "pages" ? (
            row.address
              ? <PageLink address={fullAddress(status.host, row.address)} href={pageHref(row.address)} title={row.label} />
              : (
                <span className="flex min-w-0 flex-col">
                  <span className="block truncate text-[13px] text-foreground" title={row.label}>{row.label}</span>
                  <span className="text-[12px] text-muted">{t("noAddress")}</span>
                </span>
              )
          ) : <span className="block truncate text-[13px] text-foreground" title={row.label}>{row.label}</span>) },
          ...(list === "events" ? [{ key: "times", header: t("times"), align: "right" as const, sortable: true, cell: (row: Row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.times)}</span> }] : []),
          // Google's live figures give an event its times, never its people.
          ...(list === "events" ? [] : [{ key: "people", header: t("people"), align: "right" as const, sortable: true, cell: (row: Row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.people)}</span> }]),
          ...(list === "pages" ? [{ key: "views", header: t("views"), align: "right" as const, sortable: true, cell: (row: Row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.views)}</span> }] : []),
        ]}
      />
    </div>
  );
}

/** A saved page is kept as its path: the whole address for the hover. */
function fullAddress(host: string, path: string): string {
  return /^https?:\/\//i.test(path) ? path : `https://${host}${path}`;
}

/**
 * The one short line at the top: when the figures next update, with the long words about them in a rollover that a tap also opens.
 * The count runs on the page's own clock and asks nothing: when it reaches the minute, `useLiveFigures` asks.
 */
function NextUpdate({ askedAt, inFront, paused, live }: { askedAt: number | null; inFront: boolean; paused: boolean; live: boolean }) {
  const t = useTranslations("googleAnalytics.live");
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (askedAt === null) return undefined;
    const count = () => setSeconds(Math.max(0, Math.ceil((askedAt + ASK_EVERY_MS - Date.now()) / 1000)));
    count();
    const timer = setInterval(count, 1000);
    return () => clearInterval(timer);
  }, [askedAt]);
  if (paused) return null;
  const words = !inFront ? t("behind") : askedAt === null ? t("asking") : seconds === null || seconds === 0 ? t("updating") : t("nextUpdate", { seconds });
  return (
    <Tooltip label={t("about")} className="relative inline-flex self-start">
      <p tabIndex={0} className="flex items-center gap-2 text-[12px] text-secondary">
        {live ? <LiveDot /> : null}
        <span>{words}</span>
      </p>
    </Tooltip>
  );
}

const quiet = (words: ReactNode) => <span className="text-secondary">{words}</span>;

function LiveBoxes({ answer, live }: { answer: Answer; live: boolean }) {
  const t = useTranslations("googleAnalytics.live");
  const nameOfEvent = useEventName();
  const page = answer.busiestPage;
  const town = answer.places.find((place) => !isUnknownValue(place.name));
  const { conversions } = answer;
  const pageWord = page ? (page.address && normalisePage(page.address) === "/" ? t("homePage") : page.name) : null;
  return (
    <FigureRow columns={4}>
      <Figure label={t("now")} {...(live ? { mark: <LiveDot /> } : {})} value={formatNumber(answer.now)} detail={quiet(t("lastFive"))} />
      <Figure
        label={t("busiestPage")}
        value={pageWord ? <span className="line-clamp-2" title={page?.name}>{pageWord}</span> : <NoFigure />}
        detail={quiet(page ? t("busiestPageDetail", { people: page.people, views: page.views }) : t("noPage"))}
      />
      <Figure
        label={t("busiestTown")}
        value={town ? <span className="line-clamp-2" title={town.name}>{town.name}</span> : <NoFigure />}
        detail={quiet(town ? t("busiestTownDetail", { people: town.people, all: answer.people }) : t("noTown"))}
      />
      <Figure
        label={t("newest")}
        value={conversions.eventName ? <span className="line-clamp-2">{nameOfEvent(conversions.eventName)}</span> : <NoFigure />}
        detail={quiet(conversions.eventName ? t("newestAgo", { minutes: conversions.minutesAgo ?? 0 }) : t("noConversion"))}
      />
    </FigureRow>
  );
}

/** People each minute: a bar for each, the newest on the right. A minute keeps its key as it moves along, so the bars slide. */
function MinutesCard({ answer, host }: { answer: Answer | null; host: string }) {
  const t = useTranslations("googleAnalytics.live");
  const bars = useMemo(() => {
    if (!answer) return [];
    const thisMinute = Math.floor(answer.askedAt / 60_000);
    return answer.minutes.map((value, at, all) => {
      const ago = all.length - 1 - at;
      return { key: thisMinute - ago, value, label: t("minutesAgo", { count: ago }) };
    });
  }, [answer, t]);
  return (
    <SearchConsoleChartCard
      title={t("chartTitle")}
      hint={t("chartHint")}
      exportName="google-analytics-live-minutes"
      csv={() => toCsv([t("minute"), t("people")], bars.map((bar) => [bar.label, bar.value]))}
      host={host}
      from={null}
      to={null}
    >
      {bars.length > 0
        ? <MinuteBars bars={bars} name={t("chartTitle")} measure={(value) => t("peopleWord", { count: value })} />
        : <p className="py-10 text-center text-[12px] text-muted">{t("asking")}</p>}
    </SearchConsoleChartCard>
  );
}

type Usual = NonNullable<FunctionReturnType<typeof api.googleAnalyticsLiveUsual.analyticsLiveUsual>>;

/** The last half hour against usual: each figure with what it's set against, in words and on the bars, and a verdict in the line under the title. */
function AgainstCard({ answer, usual, device, host }: { answer: Answer; usual: Usual | null; device: string; host: string }) {
  const t = useTranslations("googleAnalytics.live");
  const locale = useLocale();
  const against = usual ? usualNow(usual) : null;
  const when = usual && usual.dayOfWeek !== null && usual.hour !== null ? thisTimeWords(usual.dayOfWeek, usual.hour, usual.from, locale) : null;
  const about = (count: number) => (count < 1 ? t("underOne") : t("aboutCount", { count: Math.round(count) }));
  const shown = (count: number) => (count < 1 ? t("underOneShort") : formatNumber(Math.round(count)));
  const evenWord = (count: number) => t("usualEven", { about: about(count) });
  const hourWord = (count: number) => (when ? t("usualHour", { about: about(count), ...when }) : evenWord(count));
  const moved = (now: number, mark: number) => (mark >= LEAST_USUAL_FOR_A_VERDICT
    ? <Change by={Math.round((100 * (now - mark)) / mark)} same format={(value) => `${Math.abs(value)}%`} />
    : undefined);
  const evenNote = t("evenNote");
  const countryNote = t("countryNote");
  const row = (key: string, label: string, now: number, mark: number | null, word: string, note: string): AgainstRow => ({
    key,
    label,
    now,
    usual: mark,
    nowWord: formatNumber(now),
    usualWord: word,
    moved: mark === null ? undefined : moved(now, mark),
    readout: [
      { value: formatNumber(now), label: t("againstNow") },
      ...(mark === null ? [] : [{ value: shown(mark), label: word }]),
    ],
    note,
  });
  const conversions = answer.conversions.count;
  const countsConversions = conversions > 0 || (usual !== null && (usual.conversions > 0 || (usual.conversionsThisTime ?? 0) > 0));
  const noUsual = t("noUsual");
  const rows: AgainstRow[] = [
    row("people", t("people"), answer.people, against?.people ?? null, !against ? noUsual : against.peopleThisTime ? hourWord(against.people) : evenWord(against.people), `${against?.peopleThisTime ? "" : `${evenNote} `}${countryNote}`),
    row("views", t("views"), answer.views, against?.views ?? null, !against ? noUsual : against.viewsThisTime ? hourWord(against.views) : evenWord(against.views), `${against?.viewsThisTime ? "" : `${evenNote} `}${countryNote}`),
    ...(countsConversions ? [row("conversions", t("conversions"), conversions, usual?.conversions ?? null, usual ? evenWord(usual.conversions) : noUsual, `${evenNote} ${countryNote}`)] : []),
    ...(countsConversions && typeof usual?.conversionsThisTime === "number" ? [row("thisTime", t("conversionsThisTime"), conversions, usual.conversionsThisTime, hourWord(usual.conversionsThisTime), countryNote)] : []),
  ];
  const verdict = usual ? liveVerdict({ people: answer.people, conversions: countsConversions ? conversions : null }, usual) : null;
  const verdictWords = verdict
    ? (verdict.conversions === null ? t(`verdictPeople.${verdict.people}`) : t(`verdict.${verdict.people}.${verdict.people === verdict.conversions ? "and" : "but"}.${verdict.conversions}`))
    : null;
  const hint = [verdictWords, usual ? t("againstHint") : t("againstHintNone"), device !== "" && usual?.everyDevice ? t("everyDeviceNote") : null].filter(Boolean).join(" ");
  return (
    <SearchConsoleChartCard
      title={t("againstTitle")}
      hint={hint}
      exportName="google-analytics-live-against-usual"
      csv={() => toCsv([t("againstFigure"), t("againstNow"), t("againstUsual")], rows.map((one) => [one.label, one.now, one.usual ?? ""]))}
      host={host}
      from={null}
      to={null}
    >
      <AgainstBars rows={rows} nowKey={t("againstNow")} usualKey={t("againstUsual")} />
    </SearchConsoleChartCard>
  );
}

/** "Friday", "10am" and "October" in the reader's words. Worked out at midday UTC so a date never slips, and only the words are used. */
function thisTimeWords(dayOfWeek: number, hour: number, from: string, locale: string): { day: string; hour: string; month: string } {
  const language = locale === "en" ? "en-GB" : locale;
  // 4 January 1970 was a Sunday, Google's day 0.
  const day = new Intl.DateTimeFormat(language, { weekday: "long", timeZone: "UTC" }).format(Date.UTC(1970, 0, 4 + dayOfWeek, 12));
  const clock = new Intl.DateTimeFormat(language, { hour: "numeric", hour12: locale === "en", timeZone: "UTC" }).format(Date.UTC(1970, 0, 4, hour)).replace(/\s/g, "").toLowerCase();
  const month = new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" }).format(Date.parse(`${from}T12:00:00Z`));
  return { day, hour: clock, month };
}

/**
 * What the eye reads: the moment's figures, with what each is set against, worked out from the figures Hakken keeps and never a
 * second ask of Google (decision 3, Anthony, 2026-11-03: "Yes, write one"). The pages whichever list the table shows.
 */
function LiveSees({ status, answer, list, usual, usualKinds, boxes, kindLabel }: {
  status: AnalyticsStatus;
  answer: Answer | null;
  list: LiveList;
  usual: Usual | null;
  usualKinds: FunctionReturnType<typeof api.googleAnalyticsPageKindViews.analyticsPageKindViews> | null;
  boxes: ReadonlyArray<ClassificationBox>;
  kindLabel: (kind: { kind: string; name: string | null }) => string;
}) {
  const tm = useTranslations("googleAnalytics.menu");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const eyeNames = useEyeNames();
  const data = useMemo(() => {
    if (!answer) return answer;
    // The minute it was asked is the page's own clock, never a figure.
    const { askedAt: _askedAt, kinds: _kinds, ...now } = answer;
    void _askedAt;
    void _kinds;
    const placed = usualKinds && usualKinds.kinds.length > 0 ? usualKinds.views : 0;
    return {
      ...now,
      list,
      // A device by the reader's word for it, never Google's code.
      ...(list === "devices" ? { rows: now.rows.map((row) => ({ ...row, device: row.name, name: tf.has(`devices.${row.name}`) ? tf(`devices.${row.name}`) : row.name })) } : {}),
      kinds: boxes.map((box) => ({ kind: box.kind, name: box.label, views: box.views, pages: box.pages })),
      ...(usual ? { usual: { ...usual, kinds: placed > 0 ? usualKinds!.kinds.map((kind) => ({ kind: kind.kind, name: kindLabel(kind), viewsShare: kind.views / placed })) : [] } } : {}),
      names: eyeNames,
    };
  }, [answer, list, usual, usualKinds, boxes, kindLabel, eyeNames, tf]);
  // Where "Do first" may send the reader: where what's happening now is looked into over whole days.
  const links = useMemo(() => [
    { label: tm("conversions"), href: hrefFor("conversions") },
    { label: tm("landingPages"), href: hrefFor("funnel") },
    { label: tm("allPages"), href: hrefFor("all-pages") },
    { label: tm("channels"), href: hrefFor("channels") },
    { label: tm("trackingHealth"), href: hrefFor("tracking-health") },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hrefFor is new each draw; the dates, device and country decide.
  ], [tm, args.period, args.device, args.country]);
  // Worked out each minute and never kept: not saved as advice. Nobody in the half hour: the rule's words say it at once.
  return <AnalyticsSees screen="live" seen={answer?.seen} currency={status.connection?.currency} keep={false} data={data} links={links} writes={answer ? answer.people > 0 : undefined} />;
}
