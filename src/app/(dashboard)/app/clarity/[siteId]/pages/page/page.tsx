"use client";

import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { AnalyticsPanel } from "../../../../analytics/_components/AnalyticsPanels";
import { usePageKinds } from "../../../../_components/usePageKinds";
import { SiteLineChart } from "../../../../sites/_components/SiteCharts";
import { datedRow } from "../../../../sites/_components/datedRows";
import { formatNumber, toCsv } from "../../../../sites/_components/siteFormat";
import { HeatmapLink, Judged, Moved, wayOf, WatchLink, changeOf, duration, growthOf, mono, percent, tooFew, useBeforeWords, useClarityLinks, useDeviceName, usePeriodWords, useSourceName, useWaitingWords } from "../../../_components/ClarityParts";
import { RecordingsList } from "../../../_components/RecordingsList";
import { useClarityArgs, useClarityQuery, useClaritySiteId, useClarityStatus } from "../../../_components/useClarity";

/**
 * A page's own screen in Clarity (docs/plans/active/agents-and-clarity-plan.md,
 * Part 4, CS5, drawn as the Page board): What Hakken sees for the page; its
 * visits, scroll, time engaged and went straight back, each against the same
 * days before and the website; how far down it is scrolled day by day against
 * the website; its errors by browser and device; its recordings; phones and
 * computers on it; and where its visitors came from. "Open its heatmap in
 * Clarity" sits in its header (CS8).
 */
export default function ClarityPageScreen() {
  const t = useTranslations("clarity.page");
  const tc = useTranslations("clarity.common");
  const siteId = useClaritySiteId();
  const status = useClarityStatus();
  const args = useClarityArgs();
  const query = useClarityQuery();
  const path = useSearchParams().get("path") ?? "/";
  const links = useClarityLinks();
  const deviceName = useDeviceName();
  const sourceName = useSourceName();
  const periodWords = usePeriodWords();
  const beforeWords = useBeforeWords();
  const waitingWords = useWaitingWords();
  const kinds = usePageKinds(siteId);
  const { platformName } = useSystemSettings();
  const data = useQuery(api.clarityScreens.clarityPage, { ...args, page: path });
  const header = (
    <DetailHeader
      back={{ label: t("back"), href: `/app/clarity/${siteId}/pages${query}` }}
      icon={<FileText className="h-5 w-5 text-brand" />}
      title={path}
      description={data?.title ?? undefined}
      action={<HeatmapLink page={path} label={t("openHeatmap")} />}
    />
  );
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;

  const { now, before, website, group, period } = data;
  const chosen = args.period;
  const span = periodWords(period, chosen, "pages");
  const against = beforeWords(period, chosen);
  const waiting = waitingWords(period, chosen);
  const groupName = data.kindName ?? kinds.label(data.kind);
  const phones = data.devices.find((device) => device.name === "Mobile");
  const computers = data.devices.find((device) => device.name === "PC");
  const topError = data.errors[0];
  const says = now.visits === 0
    ? [t("sees.none", { span })]
    : [
      t("sees.scroll", {
        page: path,
        scroll: percent(now.scroll),
        change: before && before.scroll !== null && now.scroll !== null ? t("sees.change", { before: percent(before.scroll), period: chosen }) : "",
        group: group && group.scroll !== null ? t("sees.group", { group: groupName, scroll: percent(group.scroll) }) : "",
        website: percent(website.scroll),
      }),
      ...(tooFew(now.visits) ? [t("sees.few", { count: now.visits })] : []),
      ...(phones && phones.now.quickBack > 0 ? [t("sees.phonesBack", { count: phones.now.quickBack, visits: phones.now.visits })] : []),
      ...(now.errors > 0 ? [topError ? t("sees.errorsOn", { count: now.errors, where: errorWhere(topError.name) }) : t("sees.errors", { count: now.errors })] : []),
    ];
  const steps: HakkenSeesStep[] = [
    ...(now.visits > 0 && now.scroll !== null && website.scroll !== null && now.scroll < website.scroll ? [{ words: t("do.top"), link: tc("openHeatmap"), href: links.heatmap(path), external: true }] : []),
    ...(now.errors > 0 && data.recordings.some((row) => row.kind === "ERRORS" || row.kind === "ERROR_CLICKS") ? [{ words: t("do.watchErrors"), link: t("do.recordingsLink"), href: `/app/clarity/${siteId}/recordings${query}` }] : []),
  ];
  function errorWhere(name: string): string {
    const [browser, device] = name.split("|");
    return tc("browserOn", { browser, device: deviceName(device ?? "").toLowerCase() });
  }
  const chart = data.byDay.map((day) => datedRow({ day: day.day }, { page: day.page, website: day.website }));
  const phoneLine = phones && computers && phones.now.scroll !== null && computers.now.scroll !== null
    ? t(phones.now.scroll < computers.now.scroll ? "devicesPanel.phonesLess" : "devicesPanel.phonesMore", { phones: percent(phones.now.scroll), computers: percent(computers.now.scroll) })
    : t("devicesPanel.plain");

  return (
    <>
      {header}
      {waiting ? <Notice>{waiting}</Notice> : null}
      <HakkenSees says={says} steps={steps} />
      <FigureRow columns={4}>
        <Figure label={t("figures.visits")} value={formatNumber(now.visits)} detail={<span className="flex flex-col">{before ? <Moved by={growthOf(now.visits, before.visits)}>{tc("percentOn", { way: wayOf(growthOf(now.visits, before.visits)), value: Math.abs(growthOf(now.visits, before.visits) ?? 0).toFixed(1), against })}</Moved> : <span className="text-muted">{against}</span>}<span className="text-secondary">{phones ? t("figures.onPhones", { count: phones.now.visits }) : span}</span></span>} />
        <Figure label={t("figures.scroll")} value={percent(now.scroll)} detail={<span className="flex flex-col">{before ? <Moved by={changeOf(now.scroll, before.scroll)}>{tc("pointsOn", { way: wayOf(changeOf(now.scroll, before.scroll)), value: Math.abs(changeOf(now.scroll, before.scroll) ?? 0).toFixed(1), against })}</Moved> : null}<span className="text-secondary">{t("figures.website", { value: percent(website.scroll) })}</span></span>} />
        <Figure label={t("figures.time")} value={duration(now.activeSeconds)} detail={<span className="flex flex-col">{before ? <Moved by={changeOf(now.activeSeconds, before.activeSeconds)}>{tc("secondsOn", { way: wayOf(changeOf(now.activeSeconds, before.activeSeconds)), value: Math.abs(changeOf(now.activeSeconds, before.activeSeconds) ?? 0), against })}</Moved> : null}<span className="text-secondary">{t("figures.website", { value: duration(website.activeSeconds) })}</span></span>} />
        <Figure label={t("figures.back")} value={percent(now.shares.quickBack ?? 0)} detail={<span className="flex flex-col">{before ? <Moved by={changeOf(now.shares.quickBack, before.shares.quickBack)} neutral>{tc("pointsOn", { way: wayOf(changeOf(now.shares.quickBack, before.shares.quickBack)), value: Math.abs(changeOf(now.shares.quickBack, before.shares.quickBack) ?? 0).toFixed(1), against })}</Moved> : null}<span className="text-secondary">{t("figures.website", { value: percent(website.shares.quickBack ?? 0) })}</span></span>} />
      </FigureRow>

      <ChartCard
        title={t("chart.title", { page: path })}
        hint={t("chart.hint")}
        exportName={`${status?.host ?? "site"}-clarity-page-scrolled`}
        csv={() => toCsv(["day", path, t("chart.website")], data.byDay.map((day) => [day.day, day.page, day.website]))}
        enoughData={chart.filter((row) => row.page !== null).length > 1}
        emptyText={t("chart.empty")}
      >
        <SiteLineChart
          data={chart}
          sharedScale
          formatScale={(value) => `${value}%`}
          series={[{ key: "page", name: path, colour: CHART_SERIES_ORANGE }, { key: "website", name: t("chart.website"), colour: CHART_SERIES_SLATE, dashed: true }]}
        />
      </ChartCard>

      <AnalyticsPanel title={t("errorsPanel.title")} description={now.errors + now.errorClicks > 0 ? t("errorsPanel.description", { count: now.errors, visits: now.visits, clicks: now.errorClicks }) : t("errorsPanel.none", { span })}>
        <CompactList
          rows={data.errors}
          rowKey={(row) => row.name}
          empty={data.browsersDays === null ? t("errorsPanel.coming") : t("errorsPanel.empty")}
          columns={[
            { key: "where", header: tc("columns.where"), cell: (row) => <span className="text-[13px] text-foreground">{errorWhere(row.name)}</span> },
            { key: "visits", header: tc("columns.visits"), align: "right", cell: (row) => mono(formatNumber(row.now.visits)) },
            { key: "errors", header: tc("columns.withError"), align: "right", cell: (row) => mono(formatNumber(row.now.errors)) },
            { key: "clicks", header: tc("columns.clicksFailed"), align: "right", cell: (row) => mono(formatNumber(row.now.errorClicks), "text-secondary") },
            { key: "watch", header: "", align: "right", cell: () => { const link = data.recordings.find((one) => one.kind === "ERRORS" || one.kind === "ERROR_CLICKS")?.link; return link ? <WatchLink href={link} /> : <NoFigure />; } },
          ]}
        />
      </AnalyticsPanel>

      <AnalyticsPanel title={t("recordingsPanel.title")} description={t("recordingsPanel.description", { platformName })}>
        <RecordingsList rows={data.recordings.slice(0, 5)} empty={t("recordingsPanel.empty")} pages={false} />
      </AnalyticsPanel>

      <AnalyticsPanel title={t("devicesPanel.title")} description={phoneLine}>
        <CompactList
          rows={data.devices}
          rowKey={(row) => row.name}
          empty={t("devicesPanel.empty")}
          columns={[
            { key: "device", header: tc("columns.device"), cell: (row) => <span className="text-[13px] text-foreground">{deviceName(row.name)}</span> },
            { key: "visits", header: tc("columns.visits"), align: "right", cell: (row) => mono(formatNumber(row.now.visits)) },
            { key: "scroll", header: tc("columns.scrolled"), align: "right", cell: (row) => <Judged text={percent(row.now.scroll)} visits={row.now.visits} /> },
            { key: "time", header: tc("columns.time"), align: "right", cell: (row) => <Judged text={duration(row.now.activeSeconds)} visits={row.now.visits} /> },
            { key: "back", header: tc("columns.wentBack"), align: "right", cell: (row) => (row.now.quickBack > 0 ? <Judged text={percent(row.now.shares.quickBack)} visits={row.now.visits} /> : <NoFigure />) },
          ]}
        />
      </AnalyticsPanel>

      <AnalyticsPanel title={t("sourcesPanel.title")} description={data.sources ? [t("sourcesPanel.description"), data.sources.cutDays > 0 ? tc("cutSources", { count: data.sources.cutDays }) : null].filter(Boolean).join(" ") : t("sourcesPanel.coming")}>
        <CompactList
          rows={data.sources?.rows ?? []}
          rowKey={(row) => row.name}
          empty={data.sources ? t("sourcesPanel.empty") : t("sourcesPanel.comingEmpty")}
          columns={[
            { key: "source", header: tc("columns.source"), cell: (row) => <span className="text-[13px] text-foreground">{sourceName(row.name)}</span> },
            { key: "visits", header: tc("columns.visits"), align: "right", cell: (row) => mono(formatNumber(row.now.visits)) },
            { key: "scroll", header: tc("columns.scrolled"), align: "right", cell: (row) => <Judged text={percent(row.now.scroll)} visits={row.now.visits} /> },
            { key: "back", header: tc("columns.wentBack"), align: "right", cell: (row) => (row.now.quickBack > 0 ? <Judged text={percent(row.now.shares.quickBack)} visits={row.now.visits} /> : <NoFigure />) },
          ]}
        />
      </AnalyticsPanel>
    </>
  );
}
