"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import {
  ChangeCell,
  ExternalUrlCell,
  LinkStatusPill,
  PageTypePill,
  PositionCell,
  RecordLinkCell,
} from "../../../../_components/SiteCells";
import { SiteTableBar } from "../../../../_components/SiteTableBar";
import { SiteFigure } from "../../../../_components/SiteFigure";
import { SiteFacts, type SiteFact } from "../../../../_components/SiteRecordParts";
import { formatDay, formatNumber } from "../../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteRecordHref } from "../../../../_components/siteRecordLinks";
import { sharedSiteQuery } from "../../../../_components/useSiteParam";
import { useSiteId } from "../../../../_components/useSite";
import { useSiteListPage } from "../../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../../_components/useSiteSort";

/** Dollars, whole: what visits would cost as adverts. */
function formatUsd(value: number | null): string {
  return value === null ? "–" : `$${formatNumber(value)}`;
}

/**
 * The page's keywords sort as Keywords does (docs/plans/active/
 * sites-table-sorting-plan.md): the keyword A to Z, position from the top,
 * the biggest rise, and the most searched and most visits first.
 */
const KEYWORD_SORTS = { keyword: "asc", position: "asc", change: "desc", volume: "desc", traffic: "desc" } as const;

/**
 * One page's own screen (Organic search › Top pages › a page): the searches
 * it ranks for, the visits they bring, what the newest crawl found on it,
 * which AI answers link to it, and the strongest links to it.
 *
 * Opened from Top pages, a keyword's screen or the Site audit — never as a
 * modal (Anthony, 2026-09-24: "These are all new screens with a back button")
 * — and Back returns to where it was opened from, as it was left. Its
 * searches are the All keywords list narrowed to the page, paged on the
 * server; each opens its own screen.
 */
export default function SitePageRecordPage() {
  const t = useTranslations("sites.pageRecord");
  const tr = useTranslations("sites.record");
  const tk = useTranslations("sites.keywords");
  const tc = useTranslations("sites.audit.checks");
  const router = useRouter();
  const params = useSearchParams();
  const siteId = useSiteId();
  const back = useRecordBack("page");
  const recordHref = useSiteRecordHref(siteId);
  const engineLabel = useEngineLabel();
  const asked = useRecordKey("page");

  const record = useQuery(api.siteRecords.pageRecord, asked ? { siteId, page: asked } : "skip");
  const order = useSiteSort(KEYWORD_SORTS, "position");
  const table = useSiteListPage(
    api.siteKeywords.listKeywords,
    asked ? { siteId, path: asked, sort: order.key, direction: order.direction } : "skip",
    [{ siteId, list: "keywords" }],
  );

  if (!asked) {
    return <DetailHeader back={back} icon={<FileText className="h-6 w-6 text-brand" />} title={t("missingTitle")} description={t("missingBody")} />;
  }

  const rank = record?.rank ?? null;
  const crawl = record?.crawl ?? null;
  const address = rank?.url ?? crawl?.url ?? null;
  const problemLabel = (check: string) => (tc.has(check) ? tc(check) : check.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase()));

  const rankFacts: SiteFact[] = rank
    ? [
      {
        key: "topKeyword",
        label: t("ranks.topKeyword"),
        value: (
          <span className="flex flex-col items-end">
            <RecordLinkCell href={recordHref({ kind: "keyword", keyword: rank.topKeyword })}>{rank.topKeyword}</RecordLinkCell>
            <span className="text-[11px] text-muted">{t("ranks.searches", { count: formatNumber(rank.topKeywordVolume) })}</span>
          </span>
        ),
      },
      {
        key: "section",
        label: t("ranks.section"),
        // The folder's other pages: Top pages narrowed to it.
        value: (
          <Link
            href={`/app/sites/${siteId}/keywords/pages${sharedSiteQuery(params) ? `${sharedSiteQuery(params)}&` : "?"}section=${encodeURIComponent(rank.section)}`}
            className="break-all text-[13px] text-info hover:underline"
          >
            {rank.section}
          </Link>
        ),
      },
      { key: "strength", label: t("ranks.strength"), value: rank.pageRank === null ? "–" : t("ranks.outOf1000", { value: formatNumber(rank.pageRank) }) },
      { key: "firstSeen", label: t("ranks.firstSeen"), value: formatDay(rank.firstSeenDay) },
      { key: "lastChecked", label: t("ranks.lastChecked"), value: formatDay(rank.day) },
    ]
    : [];

  const crawlFacts: SiteFact[] = crawl
    ? [
      {
        key: "answered",
        label: t("crawl.answered"),
        value: crawl.statusCode === null ? "–" : (
          <StatusPill tone={crawl.statusCode >= 400 ? "danger" : crawl.statusCode >= 300 ? "warning" : "success"}>{crawl.statusCode}</StatusPill>
        ),
      },
      {
        key: "problems",
        label: t("crawl.problems"),
        value: crawl.problems.length === 0
          ? <span className="text-secondary">{t("crawl.noProblems")}</span>
          : <span className="flex flex-col items-end gap-0.5">{crawl.problems.map((check) => <span key={check}>{problemLabel(check)}</span>)}</span>,
      },
      ...(crawl.score !== null ? [{ key: "score", label: t("crawl.score"), value: t("crawl.outOf100", { value: Math.round(crawl.score) }) }] : []),
      ...(crawl.loadMs !== null ? [{ key: "load", label: t("crawl.load"), value: t("crawl.seconds", { value: (crawl.loadMs / 1000).toFixed(1) }) }] : []),
      ...(crawl.largestPaintMs !== null ? [{ key: "paint", label: t("crawl.paint"), value: t("crawl.seconds", { value: (crawl.largestPaintMs / 1000).toFixed(1) }) }] : []),
      ...(crawl.sizeBytes !== null ? [{ key: "size", label: t("crawl.size"), value: t("crawl.kilobytes", { value: formatNumber(crawl.sizeBytes / 1024) }) }] : []),
      ...(crawl.words !== null ? [{ key: "words", label: t("crawl.words"), value: formatNumber(crawl.words) }] : []),
      ...(crawl.internalLinks !== null ? [{ key: "internal", label: t("crawl.internalLinks"), value: formatNumber(crawl.internalLinks) }] : []),
      ...(crawl.externalLinks !== null ? [{ key: "external", label: t("crawl.externalLinks"), value: formatNumber(crawl.externalLinks) }] : []),
      ...(crawl.inboundLinks !== null ? [{ key: "inbound", label: t("crawl.inboundLinks"), value: formatNumber(crawl.inboundLinks) }] : []),
      ...(crawl.clickDepth !== null ? [{ key: "depth", label: t("crawl.depth"), value: formatNumber(crawl.clickDepth) }] : []),
      ...(crawl.redirectTo ? [{ key: "redirect", label: t("crawl.redirect"), value: <span className="break-all">{crawl.redirectTo}</span> }] : []),
      ...(crawl.canonical && crawl.canonical !== crawl.url
        ? [{ key: "canonical", label: t("crawl.canonical"), value: <span className="break-all">{crawl.canonical}</span> }]
        : []),
    ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={<FileText className="h-6 w-6 text-brand" />}
        title={asked}
        description={t("description")}
        pills={rank || (record?.cited.times ?? 0) > 0 ? (
          <>
            {rank ? <PageTypePill type={rank.pageType} /> : null}
            {(record?.cited.times ?? 0) > 0 ? <StatusPill tone="info">{t("citedPill")}</StatusPill> : null}
          </>
        ) : undefined}
        action={address ? <ExternalUrlCell url={address} label={`${t("openPage")} ↗`} /> : undefined}
      />

      {record === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" aria-label={tr("loading")} />
      ) : (
        <>
          {!rank ? (
            <p className="rounded-xl border border-border-dim bg-card/40 px-4 py-3 text-[13px] text-secondary">{t("notRanking")}</p>
          ) : null}

          {rank ? (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <SiteFigure
                label={t("figures.keywords")}
                value={formatNumber(rank?.keywords)}
                detail={rank ? <span className="text-muted">{t("figures.top3", { count: formatNumber(rank.top3) })}</span> : undefined}
              />
              <SiteFigure label={t("figures.best")} value={rank?.bestPosition ?? "–"} />
              <SiteFigure
                label={t("figures.traffic")}
                value={formatNumber(rank?.traffic)}
                detail={rank?.trafficValue !== null && rank?.trafficValue !== undefined
                  ? <span className="text-muted">{t("figures.worth", { value: formatUsd(rank.trafficValue) })}</span>
                  : undefined}
              />
              <SiteFigure
                label={t("figures.linking")}
                value={formatNumber(rank?.referringDomains)}
                detail={rank?.backlinks !== null && rank?.backlinks !== undefined
                  ? <span className="text-muted">{t("figures.links", { count: formatNumber(rank.backlinks) })}</span>
                  : undefined}
              />
            </div>
          ) : null}

          {rank ? (
            <DataTable
              sort={order.tableSort}
              rows={table.pageRows}
              rowKey={(row) => row._id}
              onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
              cardHeader={<SiteTableBar footer={table.footer} noun="keywords" title={t("keywordsTitle")} />}
              empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: t("notRanking") }}
              footer={table.footer}
              columns={[
                {
                  key: "keyword",
                  header: tk("columns.keyword"),
                  sortable: true,
                  cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell>,
                },
                { key: "position", header: tk("columns.position"), align: "right", sortable: true, cell: (row) => <PositionCell position={row.position} /> },
                { key: "change", header: tk("columns.change"), align: "right", sortable: true, cell: (row) => <ChangeCell change={row.change} /> },
                { key: "volume", header: tk("columns.volume"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.volume)}</span> },
                { key: "traffic", header: tk("columns.traffic"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.traffic)}</span> },
              ]}
            />
          ) : null}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {rank ? (
              <SettingsCard title={t("ranks.title")}>
                <SiteFacts facts={rankFacts} empty={t("notRanking")} />
              </SettingsCard>
            ) : null}

            <SettingsCard title={t("crawl.title")}>
              {crawl ? <p className="text-[12px] text-muted">{t("crawl.checked", { day: formatDay(crawl.day) })}</p> : null}
              <SiteFacts facts={crawlFacts} empty={t("crawl.none")} />
            </SettingsCard>

            <SettingsCard title={t("cited.title")}>
              {record.cited.times > 0 ? <p className="text-[12px] text-muted">{t("cited.times", { count: record.cited.times })}</p> : null}
              <CompactList
                rows={record.cited.questions}
                rowKey={(row) => `${row.prompt}:${row.engine}`}
                empty={t("cited.none")}
                columns={[
                  { key: "prompt", className: "text-[13px] text-foreground", cell: (row) => row.prompt },
                  { key: "engine", cell: (row) => <StatusPill tone="info">{engineLabel(row.engine)}</StatusPill> },
                  { key: "times", align: "right", className: "font-mono text-[12px] text-secondary", cell: (row) => formatNumber(row.times) },
                ]}
              />
            </SettingsCard>

            <SettingsCard title={t("links.title")} className="xl:col-span-2">
              <CompactList
                rows={record.links}
                rowKey={(row) => row._id}
                empty={t("links.none")}
                columns={[
                  {
                    key: "from",
                    className: "text-[12px]",
                    cell: (row) => (
                      <span className="flex flex-col">
                        <span className="text-[13px] text-foreground">{row.domainFrom}</span>
                        <ExternalUrlCell url={row.urlFrom} />
                      </span>
                    ),
                  },
                  { key: "anchor", className: "text-[12px] text-secondary", cell: (row) => row.anchor ?? "–" },
                  { key: "follow", className: "text-[12px] text-secondary", cell: (row) => (row.dofollow ? t("links.followed") : t("links.notFollowed")) },
                  { key: "status", cell: (row) => <LinkStatusPill status={row.status} /> },
                  { key: "rank", align: "right", className: "font-mono text-[12px] text-secondary", cell: (row) => t("links.strength", { rank: row.domainRank }) },
                ]}
              />
            </SettingsCard>
          </div>
        </>
      )}
    </div>
  );
}
