"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { ExternalUrlCell, IntentPill, PositionCell, RecordLinkCell, TrendCell, useFeatureLabel } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { SiteFigure } from "../../../_components/SiteFigure";
import { SiteFacts, type SiteFact } from "../../../_components/SiteRecordParts";
import { formatDay, formatNumber, formatShortDay, movement, movementClass, toCsv } from "../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";

/** A cost per click, which comes in US dollars. */
function formatCpc(value: number | null): string {
  return value === null ? "–" : `$${value.toFixed(2)}`;
}

/** Results shown before "Show all": Google's first page. */
const PAGE_ONE = 10;

/** Dollars, whole: what visits would cost as adverts. */
function formatUsd(value: number | null): string {
  return value === null ? "–" : `$${formatNumber(value)}`;
}

/**
 * One search's own screen (Organic keywords › All keywords › a keyword): where
 * the site ranks for it and how that has moved, what the search is worth, the
 * page that ranks, where else the site shows on Google's page for it, and how
 * its competitors do on the same search.
 *
 * Opened from any list of keywords — never as a modal (Anthony, 2026-09-24:
 * "These are all new screens with a back button") — and Back returns to that
 * list as it was left. Everything the All keywords table no longer has room
 * for is here.
 */
export default function SiteKeywordPage() {
  const t = useTranslations("sites.keywordRecord");
  const tr = useTranslations("sites.record");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const back = useRecordBack("keyword");
  const recordHref = useSiteRecordHref(siteId);
  const featureLabel = useFeatureLabel();
  const asked = useRecordKey("keyword");
  const [allResults, setAllResults] = useState(false);

  const record = useQuery(api.siteRecords.keywordRecord, asked ? { siteId, keyword: asked } : "skip");
  const positions = useQuery(
    api.siteGoogle.searchPositions,
    record ? { siteId, keywords: [record.keyword], from: range.from, to: range.to } : "skip",
  );

  if (!asked) {
    return <DetailHeader back={back} icon={<KeyRound className="h-6 w-6 text-brand" />} title={t("missingTitle")} description={t("missingBody")} />;
  }

  const rank = record?.rank ?? null;
  // What the search is worth: this site's own figures, or a competitor's for a search it does not rank for.
  const search = record?.search ?? null;
  const points = positions?.[0]?.points ?? [];
  // Where it ranks now, and with which page; nothing for a search it lost.
  const rankedAt = rank && rank.status !== "LOST" ? rank.position : null;
  const rankedPage = rank && rank.status !== "LOST" && rank.page !== "" ? rank.page : null;
  const ranking = rankedAt !== null;

  const positionDetail = (() => {
    if (!rank) return null;
    if (rank.status === "LOST") return <span className="text-muted">{t("figures.lostAtCheck")}</span>;
    if (rank.status === "NEW") return <span className="text-muted">{t("figures.newAtCheck")}</span>;
    if (!rank.previousDay) return null;
    const moved = movement(rank.change);
    return moved.tone === "none"
      ? <span className="text-muted">{t("figures.unchangedSince", { day: formatDay(rank.previousDay) })}</span>
      : <span className={movementClass(moved.tone)}>{t("figures.movedSince", { moved: moved.text, day: formatDay(rank.previousDay) })}</span>;
  })();

  const trendLow = search && search.trend.length > 0 ? Math.min(...search.trend) : null;
  const trendHigh = search && search.trend.length > 0 ? Math.max(...search.trend) : null;
  const aboutFacts: SiteFact[] = search
    ? [
      { key: "difficulty", label: t("about.difficulty"), value: search.difficulty === null ? "–" : t("about.outOf100", { value: search.difficulty }) },
      {
        key: "competition",
        label: t("about.competition"),
        value: search.competitionLevel && t.has(`about.competitionLevels.${search.competitionLevel}`) ? t(`about.competitionLevels.${search.competitionLevel}`) : "–",
      },
      {
        key: "searchIntent",
        label: t("about.searchIntent"),
        value: search.searchIntent ? (t.has(`about.searchIntents.${search.searchIntent}`) ? t(`about.searchIntents.${search.searchIntent}`) : search.searchIntent) : "–",
      },
      { key: "ourIntent", label: t("about.ourIntent"), value: <IntentPill intent={search.intent} /> },
      { key: "results", label: t("about.results"), value: formatNumber(search.resultsCount) },
      {
        key: "features",
        label: t("about.features"),
        value: search.serpFeatures.length === 0 ? "–" : search.serpFeatures.map(featureLabel).join(", "),
      },
      {
        key: "trend",
        label: t("about.trend"),
        value: trendLow === null || trendHigh === null ? "–" : (
          <span className="inline-flex items-center gap-3">
            <TrendCell trend={search.trend} label={`${t("about.trend")}: ${search.trend.join(", ")}`} />
            <span className="text-secondary">{t("about.trendRange", { low: formatNumber(trendLow), high: formatNumber(trendHigh) })}</span>
          </span>
        ),
      },
      ...(rank
        ? [
          { key: "firstSeen", label: t("about.firstSeen"), value: formatDay(rank.firstSeenDay) },
          { key: "lastChecked", label: t("about.lastChecked"), value: formatDay(rank.day) },
        ]
        : []),
    ]
    : [];

  const pageFacts: SiteFact[] = rank && rankedPage !== null
    ? [
      {
        key: "page",
        label: t("rankingPage.page"),
        value: (
          <span className="flex flex-col items-end">
            <RecordLinkCell href={recordHref({ kind: "page", page: rankedPage })} className="break-all text-[13px] text-info">{rankedPage}</RecordLinkCell>
            {rank.previousPage && rank.previousPage !== rankedPage
              ? <span className="break-all text-[11px] text-muted">{t("rankingPage.was", { page: rank.previousPage })}</span>
              : null}
          </span>
        ),
      },
      { key: "strength", label: t("rankingPage.strength"), value: rank.pageRank === null ? "–" : t("rankingPage.outOf1000", { value: formatNumber(rank.pageRank) }) },
      { key: "linking", label: t("rankingPage.linkingWebsites"), value: formatNumber(rank.pageReferringDomains) },
      { key: "links", label: t("rankingPage.links"), value: formatNumber(rank.pageBacklinks) },
      { key: "value", label: t("rankingPage.value"), value: formatUsd(rank.trafficValue) },
    ]
    : [];

  // This website among its competitors on the same search, best placed first.
  const standings = record
    ? [
      { siteId: null, host: site?.host ?? "", position: rankedAt, page: rankedPage },
      ...record.rivals.map((rival) => ({ siteId: rival.siteId, host: rival.host, position: rival.position, page: rival.page })),
    ].sort((left, right) => (left.position ?? 999) - (right.position ?? 999))
    : undefined;

  const trackedFacts: SiteFact[] = record?.tracked
    ? [
      { key: "position", label: t("tracked.position"), value: <PositionCell position={record.tracked.lastPosition} /> },
      { key: "best", label: t("tracked.best"), value: record.tracked.bestPosition ?? "–" },
      { key: "first", label: t("tracked.firstChecked"), value: formatDay(record.tracked.firstCheckedDay) },
      { key: "last", label: t("tracked.lastChecked"), value: formatDay(record.tracked.lastCheckedDay) },
    ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={<KeyRound className="h-6 w-6 text-brand" />}
        title={record?.keyword ?? asked}
        description={t("description")}
        pills={search || record?.tracked ? (
          <>
            {search ? <IntentPill intent={search.intent} /> : null}
            {record?.tracked ? <StatusPill tone="info">{t("trackedPill")}</StatusPill> : null}
          </>
        ) : undefined}
      />

      {record === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" aria-label={tr("loading")} />
      ) : (
        <>
          {!ranking ? (
            <p className="rounded-xl border border-border-dim bg-card/40 px-4 py-3 text-[13px] text-secondary">{t("notRanking")}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <SiteFigure
              label={t("figures.position")}
              value={rankedAt ?? t("figures.notRanking")}
              detail={positionDetail ?? undefined}
            />
            <SiteFigure label={t("figures.volume")} value={formatNumber(search?.volume)} detail={<span className="text-muted">{t("figures.volumeDetail")}</span>} />
            <SiteFigure label={t("figures.traffic")} value={formatNumber(rank?.traffic)} detail={<span className="text-muted">{t("figures.trafficDetail")}</span>} />
            <SiteFigure label={t("figures.cpc")} value={formatCpc(search?.cpc ?? null)} detail={<span className="text-muted">{t("figures.cpcDetail")}</span>} />
          </div>

          <SiteChartCard
            title={t("chartTitle")}
            hint={t("chartHint")}
            exportName={`${site?.host ?? "site"}-${record.keyword.replace(/[^a-z0-9]+/gi, "-")}-positions-${range.from}-to-${range.to}`}
            csv={() => toCsv(["day", record.keyword], points.map((point) => [point.day, point.position]))}
            enoughData={points.length > 0}
          >
            <SiteLineChart
              reversed
              data={points.map((point) => ({ label: formatShortDay(point.day), position: point.position }))}
              series={[{ key: "position", name: record.keyword, colour: SITE_SERIES_COLOURS[0] }]}
            />
          </SiteChartCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SettingsCard title={t("about.title")}>
              <SiteFacts facts={aboutFacts} empty={t("notRanking")} />
            </SettingsCard>

            <SettingsCard title={t("rankingPage.title")}>
              <SiteFacts facts={pageFacts} empty={t("rankingPage.none")} />
            </SettingsCard>

            <SettingsCard title={t("rivals.title")}>
              <CompactList
                rows={record.rivals.length === 0 ? [] : standings}
                rowKey={(row) => row.siteId ?? "this"}
                empty={t("rivals.none")}
                columns={[
                  {
                    key: "host",
                    className: "text-[13px]",
                    cell: (row) => row.siteId === null
                      ? <span className="text-foreground">{row.host} <span className="text-muted">· {t("rivals.thisWebsite")}</span></span>
                      : <RecordLinkCell href={recordHref({ kind: "keyword", keyword: record.keyword }, row.siteId)}>{row.host}</RecordLinkCell>,
                  },
                  {
                    key: "position",
                    align: "right",
                    cell: (row) => row.position === null
                      ? <span className="text-[12px] text-muted">{row.siteId === null ? t("figures.notRanking") : t("rivals.notRanking")}</span>
                      : <span className="font-mono text-[13px] text-foreground">{row.position}</span>,
                  },
                ]}
              />
            </SettingsCard>

            <SettingsCard title={t("features.title")}>
              <CompactList
                rows={record.features}
                rowKey={(row) => `${row.feature}:${row.page ?? ""}`}
                empty={t("features.none")}
                columns={[
                  { key: "kind", className: "text-[13px] text-foreground", cell: (row) => t(`features.kinds.${row.feature}`) },
                  {
                    key: "page",
                    className: "text-[12px]",
                    cell: (row) => row.page
                      ? <RecordLinkCell href={recordHref({ kind: "page", page: row.page })} className="break-all text-[12px] text-info">{row.page}</RecordLinkCell>
                      : <span className="text-muted">–</span>,
                  },
                  {
                    key: "position",
                    align: "right",
                    className: "text-[12px] text-secondary",
                    cell: (row) => (row.position === null ? "–" : t("features.at", { position: row.position })),
                  },
                ]}
              />
            </SettingsCard>

            {record.tracked ? (
              <SettingsCard title={t("tracked.title")}>
                {!record.tracked.isActive ? <p className="text-[12px] text-muted">{t("tracked.paused")}</p> : null}
                <SiteFacts facts={trackedFacts} empty="–" />
              </SettingsCard>
            ) : null}

            {record.serp && (record.serp.questions.length > 0 || record.serp.related.length > 0) ? (
              <SettingsCard title={t("serp.questions")}>
                <ul className="flex flex-col gap-1.5 text-[13px] text-foreground">
                  {record.serp.questions.map((question) => <li key={question}>{question}</li>)}
                </ul>
                {record.serp.related.length > 0 ? (
                  <>
                    <h3 className="mt-2 text-[12px] font-medium text-secondary">{t("serp.related")}</h3>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
                      {record.serp.related.map((related) => (
                        <li key={related}>
                          <RecordLinkCell href={recordHref({ kind: "keyword", keyword: related })} className="text-[13px] text-info">{related}</RecordLinkCell>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </SettingsCard>
            ) : null}

            {record.serp ? (
              <SettingsCard title={t("serp.title")} className="xl:col-span-2">
                <p className="text-[12px] text-muted">{t("serp.checked", { day: formatDay(record.serp.day) })}</p>
                <CompactList
                  rows={allResults ? record.serp.results : record.serp.results.slice(0, PAGE_ONE)}
                  rowKey={(row) => `${row.position}:${row.domain}`}
                  empty="–"
                  columns={[
                    { key: "position", align: "right", className: "w-10 font-mono text-[12px] text-muted", cell: (row) => row.position },
                    {
                      key: "domain",
                      className: "text-[13px]",
                      cell: (row) => (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={row.isYou || row.rivalSiteId ? "text-foreground" : "text-secondary"}>{row.domain}</span>
                          {row.isYou ? <StatusPill tone="success">{t("serp.thisWebsite")}</StatusPill> : null}
                          {row.rivalSiteId ? <StatusPill tone="warning">{t("serp.competitor")}</StatusPill> : null}
                        </span>
                      ),
                    },
                    { key: "url", className: "text-[12px]", cell: (row) => (row.url ? <ExternalUrlCell url={row.url} /> : null) },
                  ]}
                />
                {record.serp.results.length > PAGE_ONE ? (
                  <Button variant="ghost" onClick={() => setAllResults((shown) => !shown)} className="self-start px-0 text-[12px] text-info hover:bg-transparent hover:underline">
                    {allResults ? t("serp.showTop") : t("serp.showAll", { count: record.serp.results.length })}
                  </Button>
                ) : null}
              </SettingsCard>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
