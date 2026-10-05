"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { ExternalUrlCell, IntentLabel, PositionCell, RecordLinkCell, TrendCell, useFeatureLabel } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { Figure } from "@/src/ui/components/screens/Figure";
import { SiteFacts, type SiteFact } from "../../../_components/SiteRecordParts";
import { datedRow } from "../../../_components/datedRows";
import { formatCpc, formatDay, formatNumber, movement, toCsv } from "../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { isPartHeld } from "../../../_components/SiteCoverage";
import { heldIcon } from "../../../_components/siteGroups";
import { MarkedHost } from "../../../_components/SiteMark";
import { pagePath } from "@/convex/utils/siteShapes";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { SearchAnswers } from "./SearchAnswers";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";

/** Results shown before "Show all": Google's first page. */
const PAGE_ONE = 10;

/** Dollars, whole: what visits would cost as adverts. */
function formatUsd(value: number | null): string {
  return value === null ? "–" : `$${formatNumber(value)}`;
}

/**
 * One search's own screen (Organic search › Keywords › a keyword): where
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
  const tv = useTranslations("sites.aiSearched.pageVerdict");
  const engineLabel = useEngineLabel();
  const tr = useTranslations("sites.record");
  const siteId = useSiteId();
  const site = useSite();
  // A list held in part cannot say a search does not rank: only that it is not among those held (§4.F).
  const partHeld = isPartHeld(site?.coverage);
  const range = useSiteRange();
  const back = useRecordBack("keyword");
  const recordHref = useSiteRecordHref(siteId);
  const featureLabel = useFeatureLabel();
  const asked = useRecordKey("keyword");
  const [allResults, setAllResults] = useState(false);

  const record = useQuery(api.siteRecords.keywordRecord, asked ? { siteId, keyword: asked } : "skip");
  // The search as a fan-out query: what the Fan-out queries table left to this page.
  const fromAi = useQuery(api.siteAngles.keywordAngle, asked ? { siteId, keyword: asked } : "skip");
  const positions = useQuery(
    api.siteGoogle.searchPositions,
    record ? { siteId, keywords: [record.keyword], from: range.from, to: range.to, step: range.step } : "skip",
  );

  if (!asked) {
    return <DetailHeader layout="path" back={back} title={t("missingTitle")} description={t("missingBody")} />;
  }

  const rank = record?.rank ?? null;
  // What the search is worth: this site's own figures, or a competitor's for a search it does not rank for.
  const search = record?.search ?? null;
  const points = positions?.[0]?.points ?? [];
  // Where it ranks now, and with which page; nothing for a search it lost.
  const rankedAt = rank && rank.status !== "LOST" ? rank.position : null;
  const rankedPage = rank && rank.status !== "LOST" && rank.page !== "" ? rank.page : null;
  // A search this company tracks, or gave its one first check as a fan-out
  // query, was checked on Google itself: where that check found the site
  // stands in for a search the site's keyword list does not hold.
  const checkedOnce = record?.checkedOnce ?? null;
  const check = record?.tracked?.lastCheckedDay
    ? { position: record.tracked.lastPosition, day: record.tracked.lastCheckedDay }
    : checkedOnce;
  const checkedAt = rankedAt === null ? check?.position ?? null : null;
  const shownAt = rankedAt ?? checkedAt;
  const ranking = shownAt !== null;
  const checkedResult = checkedAt !== null ? record?.serp?.results.find((row) => row.isYou && row.url) ?? null : null;

  const positionDetail = (() => {
    if (!rank) return null;
    if (rank.status === "LOST") return <span className="text-muted">{t("figures.lostAtCheck")}</span>;
    if (rank.status === "NEW") return <span className="text-muted">{t("figures.newAtCheck")}</span>;
    if (!rank.previousDay) return null;
    const moved = movement(rank.change);
    return moved.tone === "none"
      ? <span className="text-muted">{t("figures.unchangedSince", { day: formatDay(rank.previousDay) })}</span>
      : <ChangeLine by={rank.change}>{t("figures.movedSince", { moved: moved.text, day: formatDay(rank.previousDay) })}</ChangeLine>;
  })();

  // Google Ads' figures for a search the keyword list does not measure: a fan-out query's (`searchVolumes.ts`).
  const bought = record?.bought ?? null;
  const boughtLow = bought && bought.trend.length > 0 ? Math.min(...bought.trend) : null;
  const boughtHigh = bought && bought.trend.length > 0 ? Math.max(...bought.trend) : null;
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
      { key: "ourIntent", label: t("about.ourIntent"), value: <IntentLabel intent={search.intent} /> },
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
    : record?.serp || bought
      // Not in the keyword list: what the results page itself showed, and
      // Google Ads' figures where they were bought (`searchVolumes.ts`).
      ? [
        ...(record?.serp ? [{
          key: "features",
          label: t("about.features"),
          value: record.serp.features.length === 0 ? "–" : record.serp.features.map(featureLabel).join(", "),
        }] : []),
        {
          key: "volume",
          label: t("figures.volume"),
          value: !bought
            ? <span className="text-muted">{t("about.notInList")}</span>
            : bought.volume === null ? <span className="text-muted">{t("about.tooFew")}</span> : formatNumber(bought.volume),
        },
        ...(bought ? [
          {
            key: "competition",
            label: t("about.competition"),
            value: bought.competition && t.has(`about.competitionLevels.${bought.competition}`) ? t(`about.competitionLevels.${bought.competition}`) : "–",
          },
          ...(boughtLow !== null && boughtHigh !== null ? [{
            key: "trend",
            label: t("about.trend"),
            value: (
              <span className="inline-flex items-center gap-3">
                <TrendCell trend={bought.trend} label={`${t("about.trend")}: ${bought.trend.join(", ")}`} />
                <span className="text-secondary">{t("about.trendRange", { low: formatNumber(boughtLow), high: formatNumber(boughtHigh) })}</span>
              </span>
            ),
          }] : []),
          { key: "from", label: t("about.volumeFrom"), value: <span className="text-muted">{t("about.googleAds", { day: formatDay(bought.day) })}</span> },
        ] : []),
      ]
      : [];

  const checkedPage = checkedResult?.url ? pagePath(checkedResult.url) : null;
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
    : checkedResult && checkedPage !== null && check
      ? [
        {
          key: "page",
          label: t("rankingPage.page"),
          value: <RecordLinkCell href={recordHref({ kind: "page", page: checkedPage })} className="break-all text-[13px] text-info">{checkedPage}</RecordLinkCell>,
        },
        { key: "position", label: t("figures.position"), value: checkedResult.position },
        { key: "from", label: t("rankingPage.from"), value: t("rankingPage.fromCheck", { day: formatDay(check.day) }) },
      ]
      : [];

  // This website among its competitors on the same search, best placed first.
  const standings = record
    ? [
      { siteId: null, host: site?.host ?? "", owned: site?.relationship === "OWNED", position: shownAt, page: rankedPage ?? checkedPage, checked: false },
      ...record.rivals.map((rival) => ({ siteId: rival.siteId, host: rival.host, owned: rival.relationship === "OWNED", position: rival.position, page: rival.page, checked: rival.checked })),
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

  // Whether any answer that ran this search named the site: said plainly, as a tag.
  const mentionedValue = (answers: Array<{ stance: string }>) => {
    const named = answers.filter((answer) => answer.stance !== "NOT_NAMED").length;
    return named > 0
      ? <StatusLabel tone="success">{t("fromAi.mentionedYes", { named, count: answers.length })}</StatusLabel>
      : <StatusLabel tone="warning">{t("fromAi.mentionedNo", { count: answers.length })}</StatusLabel>;
  };

  const fromAiPage = (() => {
    if (!fromAi?.page) return <span className="text-muted">{tv("unjudged")}</span>;
    if (fromAi.page.verdict === "ANSWERED" && fromAi.page.page) {
      return <RecordLinkCell href={recordHref({ kind: "page", page: fromAi.page.page })} className="text-[13px] text-info">{fromAi.page.page}</RecordLinkCell>;
    }
    if (fromAi.page.verdict === "NONE") return <StatusLabel tone="warning">{tv("NONE")}</StatusLabel>;
    return <span className="text-muted">{tv(fromAi.page.verdict === "OFF_TOPIC" ? "OFF_TOPIC" : "UNSURE")}</span>;
  })();
  const fromAiFacts: SiteFact[] = fromAi
    ? [
      { key: "asked", label: t("fromAi.asked"), value: fromAi.questions.map((question) => `“${question}”`).join(", ") },
      { key: "engines", label: t("fromAi.searchedBy"), value: fromAi.engines.map(engineLabel).join(", ") },
      { key: "times", label: t("fromAi.timesSeen"), value: t("fromAi.timesSeenValue", { count: fromAi.timesSeen, day: formatDay(fromAi.lastSeenDay) }) },
      ...(fromAi.otherWordings.length > 0
        ? [{ key: "wordings", label: t("fromAi.otherWordings"), value: fromAi.otherWordings.map((wording) => `“${wording}”`).join(", ") }]
        : []),
      { key: "intent", label: t("fromAi.intent"), value: <IntentLabel intent={fromAi.intent} /> },
      ...(site?.relationship === "TRACKED" ? [] : [{ key: "page", label: t("fromAi.page"), value: fromAiPage }]),
      ...(fromAi.answers.length > 0 ? [{ key: "mentioned", label: t("fromAi.mentioned", { host: site?.host ?? "" }), value: mentionedValue(fromAi.answers) }] : []),
    ]
    : [];

  const checkedOnceFacts: SiteFact[] = checkedOnce
    ? [
      { key: "position", label: t("checkedOnce.position"), value: <PositionCell position={checkedOnce.position} /> },
      { key: "checked", label: t("checkedOnce.checked"), value: formatDay(checkedOnce.day) },
      { key: "again", label: t("checkedOnce.again"), value: <span className="text-muted">{t("checkedOnce.onlyIfTracked")}</span> },
    ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        layout="path"
        back={back}
        title={record?.keyword ?? asked}
        // One sentence about this search, where a stock one used to be, and
        // the box that repeated it gone (Anthony chose header "B", 2026-09-29).
        description={record === undefined ? undefined
          : checkedOnce ? t("checkedOnceNotice", { day: formatDay(checkedOnce.day) })
          : !ranking ? t(partHeld ? "notInHeld" : "notRanking")
          : undefined}
        pills={search || fromAi || record?.tracked || checkedOnce ? (
          <>
            {record?.tracked ? <StatusLabel size="md" tone="info">{t("trackedPill")}</StatusLabel> : null}
            {checkedOnce ? <StatusLabel size="md" tone="info">{t("checkedOncePill")}</StatusLabel> : null}
            {/* What the searcher wants: the keyword list's judgement, or the AI answers' for a search only they ran. */}
            {search || fromAi ? <IntentLabel size="md" intent={search ? search.intent : fromAi?.intent ?? null} /> : null}
          </>
        ) : undefined}
      />

      {record === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" aria-label={tr("loading")} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Figure
              label={t("figures.position")}
              value={shownAt ?? t(partHeld ? "figures.notInHeld" : "figures.notRanking")}
              detail={check && checkedAt !== null
                ? <span className="text-muted">{t("figures.checkedOn", { day: formatDay(check.day) })}</span>
                : positionDetail ?? undefined}
            />
            <Figure label={t("figures.volume")} value={formatNumber(search?.volume ?? bought?.volume)} detail={<span className="text-muted">{t("figures.volumeDetail")}</span>} />
            <Figure label={t("figures.traffic")} value={formatNumber(rank?.traffic)} detail={<span className="text-muted">{t("figures.trafficDetail")}</span>} />
            <Figure label={t("figures.cpc")} value={formatCpc(search?.cpc ?? bought?.cpc ?? null)} detail={<span className="text-muted">{t("figures.cpcDetail")}</span>} />
          </div>

          {fromAi ? (
            <SettingsCard title={t("fromAi.title")}>
              <SiteFacts facts={fromAiFacts} empty="–" />
            </SettingsCard>
          ) : null}
          {fromAi && fromAi.answers.length > 0 ? <SearchAnswers answers={fromAi.answers} names={fromAi.names} host={site?.host ?? ""} /> : null}

          <SiteChartCard
            title={t("chartTitle")}
            hint={t("chartHint")}
            exportName={`${site?.host ?? "site"}-${record.keyword.replace(/[^a-z0-9]+/gi, "-")}-positions-${range.from}-to-${range.to}`}
            csv={() => toCsv(["day", record.keyword], points.map((point) => [point.day, point.position]))}
            enoughData={points.length > 0}
          >
            <SiteLineChart
              reversed
              data={points.map((point) => datedRow(point, { position: point.position }))}
              series={[{ key: "position", name: record.keyword, colour: SITE_SERIES_COLOURS[0] }]}
            />
          </SiteChartCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SettingsCard title={t("about.title")}>
              <SiteFacts facts={aboutFacts} empty={ranking ? t("about.notInList") : t(partHeld ? "notInHeld" : "notRanking")} />
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
                    cell: (row) => (
                      <MarkedHost host={row.host} iconUrl={heldIcon(site?.holds, { siteId: row.siteId ?? site?.siteId })} owned={row.owned}>
                        {row.siteId === null
                          ? <span className="text-foreground">{row.host} <span className="text-muted">· {t("rivals.thisWebsite")}</span></span>
                          : <RecordLinkCell href={recordHref({ kind: "keyword", keyword: record.keyword }, row.siteId)}>{row.host}</RecordLinkCell>}
                      </MarkedHost>
                    ),
                  },
                  {
                    key: "position",
                    align: "right",
                    cell: (row) => row.position === null
                      ? (
                        <span className="text-[12px] text-muted">
                          {row.siteId === null
                            ? t(partHeld ? "figures.notInHeld" : "figures.notRanking")
                            : row.checked ? t("rivals.notOnPage", { count: record.serp?.results.length ?? 0 }) : t("rivals.notRanking")}
                        </span>
                      )
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
                      : <NoFigure />,
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

            {checkedOnce ? (
              <SettingsCard title={t("checkedOnce.title")}>
                <SiteFacts facts={checkedOnceFacts} empty="–" />
              </SettingsCard>
            ) : null}

            {record.serp && (record.serp.questions.length > 0 || record.serp.related.length > 0) ? (
              <SettingsCard title={t("serp.questions")}>
                {record.serp.questions.length > 0 ? (
                  <CompactList
                    rows={record.serp.questions}
                    rowKey={(question) => question}
                    empty="–"
                    columns={[{ key: "question", className: "text-[13px] text-foreground", cell: (question) => question }]}
                  />
                ) : null}
                {record.serp.related.length > 0 ? (
                  // The kit's heading row names the related searches, in place of a heading drawn by hand.
                  <CompactList
                    rows={record.serp.related}
                    rowKey={(related) => related}
                    empty="–"
                    columns={[{
                      key: "related",
                      header: t("serp.related"),
                      className: "text-[13px]",
                      cell: (related) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: related })} className="text-[13px] text-info">{related}</RecordLinkCell>,
                    }]}
                  />
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
                          {row.isYou ? <StatusLabel tone="success">{t("serp.thisWebsite")}</StatusLabel> : null}
                          {row.rivalSiteId ? <StatusLabel tone="warning">{t("serp.competitor")}</StatusLabel> : null}
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
