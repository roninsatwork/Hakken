"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Radio } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { isUnknownValue } from "@/convex/utils/analyticsUnknown";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { SiteLineChart } from "../../../sites/_components/SiteCharts";
import { CUT_COLUMN } from "../../../sites/_components/SiteCells";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { SearchConsoleChartCard } from "../../../search-console/_components/SearchConsoleChartCard";
import { CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { AnalyticsGate } from "../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { TopBars } from "../../_components/AnalyticsChart";
import { useEventName } from "../../_components/useEventName";
import { CHECK_EVERY_MS, liveStep } from "../../_components/liveTiming";
import { useAnalyticsArgs, useAnalyticsSiteId, useAnalyticsStatus, useDevice, type AnalyticsStatus } from "../../_components/useAnalytics";

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
 * Live (GA34; §18.2 board 14): who is on the website right now, and what
 * they've done in the last 30 minutes — What Hakken sees, on the website now,
 * people, views and conversions, people each minute, where they are as bars,
 * and one table switching between pages (by title), places, devices and
 * events. Asked of Google once a minute, only while this page is open and in
 * front (`liveTiming.ts`), paused after 30 minutes untouched; nothing kept.
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
function useLiveFigures(ask: { siteId: string; device: string; country?: string; list: LiveList }) {
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
  const args = useAnalyticsArgs();
  const [device] = useDevice();
  const nameOfEvent = useEventName();
  const [list, setList] = useSiteParam<LiveList>("view", "pages", LISTS);
  const { answer, problem, paused, carryOn, inFront } = useLiveFigures({ siteId: args.siteId, device: args.device, ...(args.country ? { country: args.country } : {}), list });
  const [search, setSearch, term] = useSiteSearch();
  const nameOf = (name: string) => (isUnknownValue(name) ? tn("unknown")
    : list === "devices" ? (tf.has(`devices.${name}`) ? tf(`devices.${name}`) : name)
      : list === "events" ? nameOfEvent(name) : name);
  const named = answer?.rows.map((row) => ({ ...row, label: nameOf(row.name) }));
  const matching = named?.filter((row) => !term || row.label.toLowerCase().includes(term.toLowerCase()));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: list === "events" ? "times" : "people", name: labelOf });
  const pager = useSitePager(sorted, { isLoading: answer === null && !problem });
  const conversions = answer?.conversions ?? null;
  const chart = (answer?.minutes ?? []).map((people, at, all) => ({ label: t("minutesAgo", { count: all.length - 1 - at }), people }));
  const bar = [t("lastThirty"), tf(`devices.${device}`).toLowerCase(), list === "pages" ? t("byTitle") : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[12px] text-muted">
        {!inFront ? t("behind") : answer ? t("askedAt", { time: new Date(answer.askedAt).toLocaleTimeString() }) : t("asking")}
      </p>
      {paused ? (
        <Notice>
          <span className="flex flex-wrap items-center gap-3">
            {t("paused")}
            <Button variant="outline" onClick={carryOn}>{t("carryOn")}</Button>
          </span>
        </Notice>
      ) : null}
      {problem ? <Notice tone="warning">{t(problem === "NOT_CONNECTED" ? "notConnected" : "busy")}</Notice> : null}
      {/* Worked out each minute and never kept: not saved as advice. */}
      <AnalyticsSees screen="live" seen={answer?.seen} currency={status.connection?.currency} keep={false} />
      {answer ? (
        <FigureRow columns={4}>
          <Figure label={t("now")} value={formatNumber(answer.now)} detail={<span className="text-secondary">{t("lastFive")}</span>} />
          <Figure label={t("people")} value={formatNumber(answer.people)} detail={<span className="text-secondary">{t("lastThirty")}</span>} />
          <Figure label={t("views")} value={formatNumber(answer.views)} detail={<span className="text-secondary">{t("lastThirty")}</span>} />
          <Figure
            label={t("conversions")}
            value={formatNumber(conversions?.count ?? 0)}
            detail={(
              <span className="text-secondary">
                {conversions?.eventName ? t("convertedAgo", { event: nameOfEvent(conversions.eventName), minutes: conversions.minutesAgo ?? 0 }) : t("noConversion")}
              </span>
            )}
          />
        </FigureRow>
      ) : null}
      <SearchConsoleChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName="google-analytics-live-minutes"
        csv={() => toCsv([t("minute"), t("people")], chart.map((point) => [point.label, point.people]))}
        host={status.host}
        from={null}
        to={null}
      >
        {chart.length > 0
          ? <SiteLineChart data={chart} series={[{ key: "people", name: t("people"), colour: CHART_SERIES_ORANGE }]} sharedScale />
          : <p className="py-10 text-center text-[12px] text-muted">{t("asking")}</p>}
      </SearchConsoleChartCard>
      <TopBars
        title={t("placesTitle")}
        hint={t("placesHint")}
        rows={answer?.places.slice(0, 10).map((row) => ({ label: isUnknownValue(row.name) ? tn("unknown") : row.name, value: row.people }))}
        measure={t("people")}
        exportName="google-analytics-live-places"
        host={status.host}
        from={null}
        to={null}
      />
      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.name}
        search={{ value: search, onChange: setSearch, placeholder: t(`find.${list}`) }}
        filters={<SiteViewSwitch label={t("showing")} options={LISTS.map((value) => ({ value, label: t(`lists.${value}`) }))} value={list} onChange={setList} />}
        cardHeader={
          <TableBar
            footer={pager.footer}
            noun={NOUNS[list]}
            actions={sorted ? (
              <ListDownload
                label={t("download")}
                fileName={`${status.host}-google-analytics-live-${list}`}
                rows={sorted}
                columns={[
                  { header: t(`columns.${list}`), value: (row) => row.label },
                  { header: t("people"), value: (row) => row.people },
                  ...(list === "pages" ? [{ header: t("views"), value: (row: Row) => row.views }] : []),
                  ...(list === "events" ? [{ header: t("times"), value: (row: Row) => row.times }] : []),
                ]}
              />
            ) : undefined}
          >
            <span className="text-[12px] text-secondary">{bar}</span>
          </TableBar>
        }
        sort={tableSort}
        empty={{ icon: <Radio className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : answer ? t("nobody") : t("asking") }}
        footer={pager.footer}
        columns={[
          { key: "name", header: t(`columns.${list}`), sortable: true, className: CUT_COLUMN.first, cell: (row) => <span className="block truncate text-[13px] text-foreground" title={row.label}>{row.label}</span> },
          ...(list === "events" ? [{ key: "times", header: t("times"), align: "right" as const, sortable: true, cell: (row: Row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.times)}</span> }] : []),
          { key: "people", header: t("people"), align: "right" as const, sortable: true, cell: (row: Row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.people)}</span> },
          ...(list === "pages" ? [{ key: "views", header: t("views"), align: "right" as const, sortable: true, cell: (row: Row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.views)}</span> }] : []),
        ]}
      />
    </div>
  );
}
