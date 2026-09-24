"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { RecordLinkCell, useFeatureLabel } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { formatNumber, toCsv } from "../../../_components/siteFormat";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { SiteFigure } from "../../../_components/SiteFigure";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch, useSiteTablePage } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

/** Features that name websites, where "is this site in it" has an answer. */
const NAMING = new Set(["ai_overview", "local_pack", "featured_snippet"]);

/**
 * Search features: what Google shows on each of the site's searches besides
 * the links, how many searches show each, and whether the site is in the
 * ones that name websites. Read from the newest kept results page of each
 * search on the site's list.
 */
export default function SiteFeaturesPage() {
  const t = useTranslations("sites.googleFeatures");
  const tc = useTranslations("sites.common");
  const label = useFeatureLabel();
  const siteId = useSiteId();
  const site = useSite();
  const data = useQuery(api.siteGoogleSerp.listFeatures, { siteId });
  const range = useSiteRange();
  // DataForSEO's own count across everything the site ranks for, not just the
  // searches on its list: the newest check's figures from the day summaries.
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const across = [...(series?.[0]?.points ?? [])].reverse().find((point) => point.aiOverviewRefs !== undefined) ?? null;
  const [search, setSearch, term] = useSiteSearch();
  const [feature, setFeature] = useSiteParam<string>("feature", "");
  const [page, setPage] = useSiteTablePage();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);

  const lower = term.toLowerCase();
  const matching = data?.searches.filter((row) =>
    (!lower || row.keyword.includes(lower)) && (!feature || row.features.includes(feature)));
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);
  const totals = data?.totals ?? [];

  const yesNo = (present: boolean, inIt: boolean) => {
    if (!present) return <span className="text-[12px] text-muted">{t("notShown")}</span>;
    return inIt ? <StatusPill tone="success">{tc("yes")}</StatusPill> : <span className="text-[12px] text-secondary">–</span>;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Sparkles className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      {across ? (
        <section aria-label={t("acrossAll")} className="flex flex-col gap-2">
          <h2 className="text-[12px] text-secondary" title={t("acrossAllHint")}>{t("acrossAll")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {([
              ["inAiOverviews", across.aiOverviewRefs, "ai_overview_reference"],
              ["inLocalPacks", across.localPacks, "local_pack"],
              ["inSnippets", across.featuredSnippets, "featured_snippet"],
            ] as const).map(([key, value, feature]) => (
              <SiteFigure key={key} label={t(key)} value={formatNumber(value)} href={recordHref({ kind: "feature", feature })} />
            ))}
          </div>
        </section>
      ) : null}

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint", { count: data?.checked ?? 0 })}
        exportName={`${site?.host ?? "site"}-search-features`}
        csv={() => toCsv(
          [t("featureFilter"), t("seriesSearches"), t("seriesWithSite")],
          totals.map((row) => [label(row.feature), row.searches, row.withSite]),
        )}
        enoughData={totals.length > 0}
      >
        <SiteBarChart
          horizontal
          height={Math.max(160, totals.length * 30)}
          data={totals.map((row) => ({ label: label(row.feature), searches: row.searches, withSite: row.withSite ?? undefined }))}
          series={[
            { key: "searches", name: t("seriesSearches"), colour: SITE_SERIES_COLOURS[1] },
            { key: "withSite", name: t("seriesWithSite"), colour: SITE_SERIES_COLOURS[0] },
          ]}
        />
      </SiteChartCard>

      <DataTable
        rows={shown}
        rowKey={(row) => row.keyword}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        minWidthClassName="min-w-[780px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={t("featureFilter")} value={feature} onChange={setFeature}>
            <option value="">{t("anyFeature")}</option>
            {totals.map((row) => <option key={row.feature} value={row.feature}>{label(row.feature)}</option>)}
          </Select>
            <ListDownload fileName={`${site?.host ?? "site"}-search-features`} rows={matching} columns={[{ header: t("columns.search"), value: (row) => row.keyword }, { header: t("columns.features"), value: (row) => row.features.map(label).join("; ") }, { header: t("columns.aiOverview"), value: (row) => (row.inAiOverview ? tc("yes") : "") }, { header: t("columns.localPack"), value: (row) => (row.inLocalPack ? tc("yes") : "") }, { header: t("columns.snippet"), value: (row) => (row.hasFeaturedSnippet ? tc("yes") : "") }, { header: t("columns.lastChecked"), value: (row) => row.day }]} />
          </>
        }
        empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: term || feature ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: matching?.length ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: data === undefined,
          onPageChange: setPage,
        }}
        columns={[
          { key: "search", header: t("columns.search"), cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          {
            key: "features",
            header: t("columns.features"),
            cell: (row) => (
              <span className="flex flex-wrap gap-1">
                {row.features.map((entry) => (
                  <StatusPill key={entry} tone={NAMING.has(entry) ? "info" : "neutral"}>{label(entry)}</StatusPill>
                ))}
              </span>
            ),
          },
          { key: "aiOverview", header: t("columns.aiOverview"), cell: (row) => yesNo(row.features.includes("ai_overview"), row.inAiOverview) },
          { key: "localPack", header: t("columns.localPack"), cell: (row) => yesNo(row.features.includes("local_pack"), row.inLocalPack) },
          { key: "snippet", header: t("columns.snippet"), cell: (row) => yesNo(row.features.includes("featured_snippet"), row.hasFeaturedSnippet) },
        ]}
      />
    </div>
  );
}
