"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { LayoutDashboard, MousePointerClick } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { sameDayBefore } from "@/convex/utils/calendarPeriods";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { AnalyticsPanel } from "../../analytics/_components/AnalyticsPanels";
import { PageLink } from "../../analytics/_components/AnalyticsCells";
import { usePageKinds } from "../../_components/usePageKinds";
import { SiteBarChart, SiteLineChart } from "../../sites/_components/SiteCharts";
import { datedRow } from "../../sites/_components/datedRows";
import { formatDay, formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import {
  HeatmapLink,
  Judged,
  Moved,
  wayOf,
  Points,
  WatchLink,
  changeOf,
  duration,
  growthOf,
  mono,
  percent,
  quiet,
  tooFew,
  useBeforeName,
  useBeforeWords,
  useClarityLinks,
  useDeviceName,
  useCountedWords,
  usePeriodWords,
  useSourceName,
  useWaitingWords,
} from "../_components/ClarityParts";
import { RecordingsList } from "../_components/RecordingsList";
import { useClarityArgs, useClarityPageHref, useClarityQuery, useClaritySiteId, useClarityStatus } from "../_components/useClarity";

/**
 * Clarity's Overview (docs/plans/active/agents-and-clarity-plan.md, Part 4,
 * CS3, drawn as the Overview board on "Hakken — Microsoft Clarity"): where do
 * visitors give up? What Hakken sees, eight figures against the same days
 * before, how far down visitors scroll day by day, then the errors visitors
 * hit and the recordings worth watching, the pages where visitors give up,
 * how far each page group is scrolled, phones and computers, where visitors
 * came from and where they get stuck. Only what Clarity measures (CS1).
 */
export default function ClarityOverviewPage() {
  const t = useTranslations("clarity.overview");
  const tp = useTranslations("common.periods");
  const tc = useTranslations("clarity.common");
  const siteId = useClaritySiteId();
  const status = useClarityStatus();
  const args = useClarityArgs();
  const query = useClarityQuery();
  const pageHref = useClarityPageHref();
  const links = useClarityLinks();
  const deviceName = useDeviceName();
  const sourceName = useSourceName();
  const periodWords = usePeriodWords();
  const countedWords = useCountedWords();
  const beforeWords = useBeforeWords();
  const beforeName = useBeforeName();
  const waitingWords = useWaitingWords();
  const kinds = usePageKinds(siteId);
  const { platformName } = useSystemSettings();
  const data = useQuery(api.clarityScreens.clarityOverview, args);
  const header = <PageHeader icon={<LayoutDashboard className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (status?.connection?.status !== "CONNECTED" && !status?.connection?.newestDay) {
    return <>{header}<HakkenEmptyState icon={MousePointerClick} title={t("notConnectedTitle")} description={t("notConnectedDescription")} action={<Link href={`/app/clarity/${siteId}/connection`} className="text-[13px] text-info hover:underline">{t("connect")}</Link>} /></>;
  }
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;

  const { now, before, period } = data;
  const chosen = args.period;
  const held = period.now?.days ?? 0;
  const span = periodWords(period, chosen);
  const lineName = `${span.charAt(0).toUpperCase()}${span.slice(1)}`;
  const errorSpan = countedWords(period, chosen, data.byDay);
  const against = beforeWords(period, chosen);
  const waiting = waitingWords(period, chosen);
  const errorsHref = `/app/clarity/${siteId}/errors${query}`;
  const recordingsHref = `/app/clarity/${siteId}/recordings${query}`;
  const pagesHref = `/app/clarity/${siteId}/pages${query}`;
  const groupName = (kind: string, name: string | null) => name ?? kinds.label(kind);

  // What Hakken sees: the page that loses its visitors soonest, phones against computers, the page group read furthest, and the errors.
  const worst = data.pages.worst;
  const phones = data.devices.find((device) => device.name === "Mobile");
  const computers = data.devices.find((device) => device.name === "PC");
  const judgedGroups = data.groups.filter((group) => !tooFew(group.now.visits) && group.now.scroll !== null);
  const furthest = [...judgedGroups].sort((a, b) => (b.now.scroll ?? 0) - (a.now.scroll ?? 0))[0];
  const topError = data.errors.pages[0];
  const says = [
    worst
      ? t("sees.worst", {
        page: worst.page,
        scroll: percent(worst.now.scroll),
        change: worst.scrollBefore !== null && worst.now.scroll !== null ? t("sees.change", { points: Math.abs(worst.now.scroll - worst.scrollBefore).toFixed(1), way: worst.now.scroll < worst.scrollBefore ? "less" : "more", than: tp(`than.${chosen}`) }) : "",
        back: worst.now.quickBack > 0 ? t("sees.back", { share: percent(worst.now.shares.quickBack) }) : "",
      })
      : t("sees.noneJudged", { held, scroll: percent(now.scroll) }),
    ...(phones && computers && !tooFew(phones.now.visits) && !tooFew(computers.now.visits) && phones.now.scroll !== null && computers.now.scroll !== null
      ? [t(phones.now.scroll < computers.now.scroll ? "sees.phonesLess" : "sees.phonesMore", { phones: percent(phones.now.scroll), computers: percent(computers.now.scroll) })]
      : []),
    ...(furthest && judgedGroups.length > 1 ? [t("sees.furthest", { group: groupName(furthest.kind, furthest.name), scroll: percent(furthest.now.scroll) })] : []),
    now.errors > 0 ? t("sees.errors", { count: now.errors, pages: data.errors.pageCount }) : t("sees.noErrors"),
  ];
  const steps: HakkenSeesStep[] = [
    ...(worst ? [{ words: t("do.top", { page: worst.page }), link: tc("openHeatmap"), href: links.heatmap(worst.page), external: true }] : []),
    ...(topError ? [{ words: topError.mostly ? t("do.errorOn", { page: topError.line.page, browser: topError.mostly.browser, device: deviceName(topError.mostly.device).toLowerCase() }) : t("do.error", { page: topError.line.page }), link: t("do.errorsLink"), href: errorsHref }] : []),
    ...(data.stuck.quickBackPage && data.recordings.total > 0 ? [{ words: t("do.watchBack", { page: data.stuck.quickBackPage.page }), link: t("do.recordingsLink"), href: recordingsHref }] : []),
  ];

  // How far down visitors scroll, day by day: each day against the same day of the period before.
  const beforeDays = new Map(data.beforeByDay.map((day) => [day.day, day.scroll]));
  const scrollDays = data.byDay.map((day) => datedRow({ day: day.day }, { now: day.scroll, before: beforeDays.get(sameDayBefore(chosen, day.day)) ?? null }));
  const hasBefore = data.beforeByDay.length > 0;
  const none = <StatusLabel tone="success">{tc("noneIn", { span })}</StatusLabel>;

  return (
    <>
      {header}
      {waiting || held < period.expected || period.countedFrom || period.pages || period.cutDays > 0 ? (
        <Notice>
          {[
            waiting,
            !waiting && held < period.expected ? t("soFarNotice", { held, since: formatDay(period.firstDay) }) : null,
            period.pages?.from ? tc("pagesFrom", { day: formatDay(period.pages.from) }) : null,
            period.countedFrom ? tc("countedFrom", { day: formatDay(period.countedFrom) }) : null,
            period.cutDays > 0 ? tc("cut", { count: period.cutDays }) : null,
          ].filter(Boolean).join(" ")}
        </Notice>
      ) : null}
      <HakkenSees says={says} steps={steps} />
      <FigureRow columns={4}>
        <Figure label={t("figures.visits")} value={formatNumber(now.visits)} detail={<span className="flex flex-col">{before ? <Moved by={growthOf(now.visits, before.visits)}>{tc("percentOn", { way: wayOf(growthOf(now.visits, before.visits)), value: Math.abs(growthOf(now.visits, before.visits) ?? 0).toFixed(1), against })}</Moved> : <span className="text-muted">{against}</span>}<span className="text-secondary">{now.bots > 0 ? t("figures.botsLeftOut", { count: now.bots }) : span}</span></span>} />
        <Figure label={t("figures.scroll")} value={percent(now.scroll)} detail={<span className="flex flex-col">{before ? <Moved by={changeOf(now.scroll, before.scroll)}>{tc("pointsOn", { way: wayOf(changeOf(now.scroll, before.scroll)), value: Math.abs(changeOf(now.scroll, before.scroll) ?? 0).toFixed(1), against })}</Moved> : null}<span className="text-secondary">{t("figures.scrollDetail")}</span></span>} />
        <Figure label={t("figures.time")} value={duration(now.activeSeconds)} detail={<span className="flex flex-col">{before ? <Moved by={changeOf(now.activeSeconds, before.activeSeconds)}>{tc("secondsOn", { way: wayOf(changeOf(now.activeSeconds, before.activeSeconds)), value: Math.abs(changeOf(now.activeSeconds, before.activeSeconds) ?? 0), against })}</Moved> : null}<span className="text-secondary">{t("figures.timeDetail")}</span></span>} />
        <Figure label={t("figures.back")} value={percent(now.shares.quickBack ?? 0)} detail={<span className="flex flex-col">{before ? <Moved by={changeOf(now.shares.quickBack, before.shares.quickBack)} neutral>{tc("pointsOn", { way: wayOf(changeOf(now.shares.quickBack, before.shares.quickBack)), value: Math.abs(changeOf(now.shares.quickBack, before.shares.quickBack) ?? 0).toFixed(1), against })}</Moved> : null}<span className="text-secondary">{t("figures.backDetail", { count: now.quickBack })}</span></span>} />
        <Figure label={t("figures.errors")} value={percent(now.shares.errors ?? 0)} href={errorsHref} detail={<span className="flex flex-col">{before ? <Moved by={now.errors - before.errors} neutral>{tc("visitsOn", { way: wayOf(now.errors - before.errors), value: Math.abs(now.errors - before.errors), against })}</Moved> : null}<span className="text-secondary">{now.errors > 0 ? t("figures.errorsDetail", { count: now.errors, pages: data.errors.pageCount }) : t("figures.noErrors")}</span></span>} />
        <Figure label={t("figures.pagesAVisit")} value={now.pagesPerVisit === null ? "–" : now.pagesPerVisit.toFixed(1)} detail={<span className="flex flex-col">{before && before.pagesPerVisit !== null ? <Moved by={changeOf(now.pagesPerVisit, before.pagesPerVisit)}>{tc("plainOn", { way: wayOf(changeOf(now.pagesPerVisit, before.pagesPerVisit)), value: Math.abs(changeOf(now.pagesPerVisit, before.pagesPerVisit) ?? 0).toFixed(1), against })}</Moved> : null}<span className="text-secondary">{t("figures.pagesAVisitDetail")}</span></span>} />
        <Figure label={t("figures.dead")} value={formatNumber(now.dead)} detail={now.dead === 0 ? none : <span className="text-secondary">{t("figures.ofVisits", { share: percent(now.shares.dead) })}</span>} />
        <Figure label={t("figures.rage")} value={formatNumber(now.rage)} detail={now.rage === 0 ? none : <span className="text-secondary">{t("figures.ofVisits", { share: percent(now.shares.rage) })}</span>} />
      </FigureRow>

      <ChartCard
        title={t("scrollChart.title")}
        hint={hasBefore ? t("scrollChart.hint", { span, before: beforeName(chosen) }) : t("scrollChart.hintAlone", { span })}
        exportName={`${status?.host ?? "site"}-clarity-scrolled`}
        csv={() => toCsv(["day", t("scrollChart.now"), t("scrollChart.before")], data.byDay.map((day) => [day.day, day.scroll, beforeDays.get(sameDayBefore(chosen, day.day)) ?? null]))}
        enoughData={scrollDays.filter((row) => row.now !== null).length > 1}
        emptyText={t("scrollChart.empty")}
      >
        <SiteLineChart
          data={scrollDays}
          sharedScale
          formatScale={(value) => `${value}%`}
          series={[
            { key: "now", name: lineName, colour: CHART_SERIES_ORANGE },
            ...(hasBefore ? [{ key: "before", name: beforeName(chosen, true), colour: CHART_SERIES_SLATE, dashed: true }] : []),
          ]}
        />
      </ChartCard>

      <AnalyticsPanel title={t("errorsPanel.title")} description={now.errors + now.errorClicks > 0 ? t("errorsPanel.description", { count: now.errors, pages: data.errors.pageCount, clicks: now.errorClicks }) : t("errorsPanel.none", { span: errorSpan })} seeAll={{ href: errorsHref, label: t("errorsPanel.seeAll") }}>
        <CompactList
          rows={data.errors.pages}
          rowKey={(row) => row.line.page}
          empty={t("errorsPanel.empty")}
          columns={[
            { key: "page", header: tc("columns.page"), cell: (row) => <PageLink address={row.line.page} href={pageHref(row.line.page)} title={row.line.title ?? undefined} /> },
            { key: "errors", header: tc("columns.withError"), align: "right", cell: (row) => mono(formatNumber(row.line.now.errors)) },
            { key: "share", header: tc("columns.ofItsVisits"), align: "right", cell: (row) => <Judged text={percent(row.line.now.shares.errors)} visits={row.line.now.visits} /> },
            { key: "clicks", header: tc("columns.clicksFailed"), align: "right", cell: (row) => mono(formatNumber(row.line.now.errorClicks), "text-secondary") },
            { key: "mostly", header: tc("columns.mostlyOn"), cell: (row) => (row.mostly ? quiet(tc("browserOn", { browser: row.mostly.browser, device: deviceName(row.mostly.device).toLowerCase() })) : <NoFigure />) },
            { key: "watch", header: "", align: "right", cell: (row) => (row.recording ? <WatchLink href={row.recording} /> : <NoFigure />) },
          ]}
        />
      </AnalyticsPanel>

      <AnalyticsPanel title={t("recordingsPanel.title")} description={t("recordingsPanel.description", { platformName })} seeAll={data.recordings.total > 0 ? { href: recordingsHref, label: t("recordingsPanel.seeAll", { count: data.recordings.total }) } : null}>
        <RecordingsList rows={data.recordings.top} empty={t("recordingsPanel.empty")} />
      </AnalyticsPanel>

      <AnalyticsPanel title={t("pagesPanel.title")} description={t("pagesPanel.description", { count: data.pages.count, low: data.pages.low })} seeAll={{ href: pagesHref, label: t("pagesPanel.seeAll", { count: data.pages.count }) }}>
        <CompactList
          rows={data.pages.top}
          rowKey={(row) => row.page}
          empty={t("pagesPanel.empty")}
          columns={[
            { key: "page", header: tc("columns.page"), cell: (row) => <PageLink address={row.page} href={pageHref(row.page)} title={row.title ?? undefined} /> },
            { key: "visits", header: tc("columns.visits"), align: "right", cell: (row) => mono(formatNumber(row.now.visits)) },
            { key: "scroll", header: tc("columns.scrolled"), align: "right", cell: (row) => <Judged text={percent(row.now.scroll)} visits={row.now.visits} /> },
            { key: "change", header: tc("columns.change"), align: "right", cell: (row) => <Points now={row.now.scroll} before={row.scrollBefore} visits={row.now.visits} /> },
            { key: "back", header: tc("columns.wentBack"), align: "right", cell: (row) => (row.now.quickBack > 0 ? <Judged text={percent(row.now.shares.quickBack)} visits={row.now.visits} /> : <NoFigure />) },
            { key: "map", header: "", align: "right", cell: (row) => <HeatmapLink page={row.page} /> },
          ]}
        />
      </AnalyticsPanel>

      <ChartCard
        title={t("groupsChart.title")}
        hint={hasBefore ? t("groupsChart.hint", { span, before: beforeName(chosen) }) : t("groupsChart.hintAlone", { span })}
        exportName={`${status?.host ?? "site"}-clarity-scrolled-by-group`}
        csv={() => toCsv([tc("columns.group"), tc("columns.visits"), t("scrollChart.now"), t("scrollChart.before")], data.groups.map((group) => [groupName(group.kind, group.name), group.now.visits, group.now.scroll, group.scrollBefore]))}
        enoughData={data.groups.length > 0}
        emptyText={t("groupsChart.empty")}
      >
        <SiteBarChart
          horizontal
          data={data.groups.map((group) => ({ label: groupName(group.kind, group.name), now: group.now.scroll ?? 0, before: group.scrollBefore ?? 0, visits: group.now.visits }))}
          series={[
            { key: "now", name: lineName, colour: CHART_SERIES_ORANGE },
            ...(hasBefore ? [{ key: "before", name: beforeName(chosen, true), colour: CHART_SERIES_SLATE }] : []),
          ]}
          labels={(value) => `${value.toFixed(1)}%`}
          formatScale={(value) => `${value}%`}
          faded={(row) => tooFew(Number(row.visits))}
          updateKey={false}
        />
      </ChartCard>

      <AnalyticsPanel title={t("devicesPanel.title")} description={phones && computers && phones.now.scroll !== null && computers.now.scroll !== null ? t("devicesPanel.description", { phones: percent(phones.now.scroll), computers: percent(computers.now.scroll) }) : t("devicesPanel.plain")}>
        <CompactList
          rows={data.devices}
          rowKey={(row) => row.name}
          empty={t("devicesPanel.empty")}
          columns={[
            { key: "device", header: tc("columns.device"), cell: (row) => <span className="text-[13px] text-foreground">{deviceName(row.name)}</span> },
            { key: "visits", header: tc("columns.visits"), align: "right", cell: (row) => mono(formatNumber(row.now.visits)) },
            { key: "share", header: tc("columns.share"), align: "right", cell: (row) => mono(percent(totalShare(row.now.visits, data.devices)), "text-secondary") },
            { key: "scroll", header: tc("columns.scrolled"), align: "right", cell: (row) => <Judged text={percent(row.now.scroll)} visits={row.now.visits} /> },
            { key: "change", header: tc("columns.change"), align: "right", cell: (row) => <Points now={row.now.scroll} before={row.scrollBefore} visits={row.now.visits} /> },
            { key: "time", header: tc("columns.time"), align: "right", cell: (row) => <Judged text={duration(row.now.activeSeconds)} visits={row.now.visits} /> },
            { key: "back", header: tc("columns.wentBack"), align: "right", cell: (row) => (row.now.quickBack > 0 ? <Judged text={percent(row.now.shares.quickBack)} visits={row.now.visits} /> : <NoFigure />) },
          ]}
        />
      </AnalyticsPanel>

      <AnalyticsPanel title={t("sourcesPanel.title")} description={data.sources ? t("sourcesPanel.description", { span: periodWords({ ...period, now: period.now ? { ...period.now, days: data.sources.days } : null }, chosen) }) : t("sourcesPanel.coming")}>
        <CompactList
          rows={data.sources?.rows ?? []}
          rowKey={(row) => row.name}
          empty={data.sources ? t("sourcesPanel.empty") : t("sourcesPanel.comingEmpty")}
          columns={[
            { key: "source", header: tc("columns.source"), cell: (row) => <span className="text-[13px] text-foreground">{sourceName(row.name)}</span> },
            { key: "visits", header: tc("columns.visits"), align: "right", cell: (row) => mono(formatNumber(row.now.visits)) },
            { key: "scroll", header: tc("columns.scrolled"), align: "right", cell: (row) => <Judged text={percent(row.now.scroll)} visits={row.now.visits} /> },
            { key: "time", header: tc("columns.time"), align: "right", cell: (row) => <Judged text={duration(row.now.activeSeconds)} visits={row.now.visits} /> },
            { key: "back", header: tc("columns.wentBack"), align: "right", cell: (row) => (row.now.quickBack > 0 ? <Judged text={percent(row.now.shares.quickBack)} visits={row.now.visits} /> : <NoFigure />) },
          ]}
        />
      </AnalyticsPanel>

      <AnalyticsPanel title={t("stuckPanel.title")} description={t("stuckPanel.description")}>
        <CompactList
          rows={[
            { what: t("stuckPanel.dead"), visits: now.dead, page: null },
            { what: t("stuckPanel.rage"), visits: now.rage, page: null },
            { what: t("stuckPanel.excessive"), visits: now.excessive, page: null },
            { what: t("stuckPanel.back"), visits: now.quickBack, page: data.stuck.quickBackPage },
          ]}
          rowKey={(row) => row.what}
          empty=""
          columns={[
            { key: "what", header: t("stuckPanel.what"), cell: (row) => <span className="text-[13px] text-foreground">{row.what}</span> },
            { key: "visits", header: tc("columns.visits"), align: "right", cell: (row) => mono(formatNumber(row.visits), row.visits ? "text-foreground" : "text-muted") },
            {
              key: "found",
              header: t("stuckPanel.found", { platformName }),
              cell: (row) => (row.visits === 0
                ? <StatusLabel tone="success">{tc("noneIn", { span })}</StatusLabel>
                : <StatusLabel tone="warning">{row.page ? t("stuckPanel.mostOn", { count: row.page.visits, page: row.page.page }) : t("stuckPanel.spread", { count: row.visits })}</StatusLabel>),
            },
          ]}
        />
      </AnalyticsPanel>

    </>
  );
}

/** A row's share of all the rows' visits. */
function totalShare(visits: number, rows: ReadonlyArray<{ now: { visits: number } }>): number | null {
  const total = rows.reduce((sum, row) => sum + row.now.visits, 0);
  return total > 0 ? Math.round((visits / total) * 1000) / 10 : null;
}
