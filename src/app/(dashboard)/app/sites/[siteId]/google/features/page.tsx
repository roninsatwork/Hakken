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
import { CUT_COLUMN, RecordLinkCell, useFeatureLabel } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { formatNumber, toCsv } from "../../../_components/siteFormat";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { SiteFigure } from "../../../_components/SiteFigure";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

/** Features that name websites, where "is this site in it" has an answer. */
const NAMING = new Set(["ai_overview", "local_pack", "featured_snippet"]);

type Featured = { keyword: string; features: readonly string[] };

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * search A to Z, and the most features on its page — the order it opens on.
 * The three yes-or-no columns do not; the feature filter narrows to them.
 */
const SORTS: SiteSortColumns<Featured, "search" | "features"> = {
  search: { value: (row) => row.keyword, first: "asc" },
  features: { value: (row) => row.features.length, first: "desc" },
};
const keywordOf = (row: Featured) => row.keyword;

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
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);

  const matches = wordStartMatcher(term);
  const matching = data?.searches.filter((row) =>
    (!matches || matches(row.keyword)) && (!feature || row.features.includes(feature)));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "features", name: keywordOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });
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
        rows={pager.pageRows}
        rowKey={(row) => row.keyword}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        minWidthClassName="min-w-[780px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("featureFilter"), choice: feature ? label(feature) : null }} value={feature} onChange={setFeature}>
            <option value="">{t("anyFeature")}</option>
            {totals.map((row) => <option key={row.feature} value={row.feature}>{label(row.feature)}</option>)}
          </Select>
          </>
        }
        cardHeader={<SiteTableBar footer={pager.footer} noun="searches" actions={<ListDownload fileName={`${site?.host ?? "site"}-search-features`} rows={sorted} columns={[{ header: t("columns.search"), value: (row) => row.keyword }, { header: t("columns.features"), value: (row) => row.features.map(label).join("; ") }, { header: t("columns.aiOverview"), value: (row) => (row.inAiOverview ? tc("yes") : "") }, { header: t("columns.localPack"), value: (row) => (row.inLocalPack ? tc("yes") : "") }, { header: t("columns.snippet"), value: (row) => (row.hasFeaturedSnippet ? tc("yes") : "") }, { header: t("columns.lastChecked"), value: (row) => row.day }]} />} />}
        empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: term || feature ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "search", header: t("columns.search"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          {
            key: "features",
            header: t("columns.features"),
            // By how many features the page shows.
            sortable: true,
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
