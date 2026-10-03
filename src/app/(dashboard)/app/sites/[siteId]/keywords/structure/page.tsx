"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { FolderTree } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CHART_SERIES_BLUE, CHART_SERIES_TEAL } from "@/src/ui/components/charts/chartPalette";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Meter } from "@/src/ui/components/screens/Meter";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { RecordLinkCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { ListDownload } from "../../../_components/SiteDownloads";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { SiteTreemap } from "../../../_components/SiteTreemap";
import { SiteViewSwitch } from "../../../_components/SiteViewSwitch";
import { formatNumber, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteListHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { HeldLine, isPartHeld } from "../../../_components/SiteCoverage";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

type Section = { section: string; pages: number; keywords: number; top3: number; traffic: number | null };
type Measure = "traffic" | "keywords" | "pages";
const MEASURES: Measure[] = ["traffic", "keywords", "pages"];

/** A folder is drawn darkest when this share of its searches, or more, are in the top 3. */
const STRONG_TOP3_SHARE = 0.4;

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * folder A to Z (the home page's "/" first), and the most pages, searches,
 * top-3 places and visits first — visits the order it opens on, as the design
 * agreed. The share column sorts by visits, the bar it ends on.
 */
const SORTS: SiteSortColumns<Section, "section" | "pages" | "keywords" | "top3" | "traffic" | "share"> = {
  section: { value: (row) => row.section, first: "asc" },
  pages: { value: (row) => row.pages, first: "desc" },
  keywords: { value: (row) => row.keywords, first: "desc" },
  top3: { value: (row) => row.top3, first: "desc" },
  traffic: { value: (row) => row.traffic, first: "desc" },
  share: { value: (row) => row.traffic, first: "desc" },
};
const sectionOf = (row: Section) => row.section;
const percent = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/**
 * Site structure, as agreed with Anthony on 2026-09-27 ("B + A together"):
 * a map of the site's folders, each box sized by its visits, searches or
 * pages and the stronger its colour the more of its searches are in the top 3; then every
 * folder in a table, with its share of the site's searches beside its share
 * of the visits — a folder with many searches and few visits is where the
 * rankings are not paying. A folder opens its pages. From the latest
 * rankings; a site has a few hundred folders at most, so the list arrives
 * whole and the search box narrows it in place.
 */
export default function SiteStructurePage() {
  const t = useTranslations("sites.structure");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const site = useSite();
  const answer = useQuery(api.siteKeywords.listSections, { siteId });
  const sections = answer?.rows;
  const [search, setSearch, term] = useSiteSearch();
  const [measure, setMeasure] = useSiteParam<Measure>("size", "traffic", MEASURES);
  const router = useRouter();
  const listHref = useSiteListHref(siteId);
  // A folder opens its pages: Top pages narrowed to it.
  const folderHref = (section: string) => listHref("keywords/pages", { section });
  const label = (section: string) => (section === "/" ? t("home") : section);
  const all = sections ?? [];
  const totals = {
    pages: all.reduce((sum, row) => sum + row.pages, 0),
    keywords: all.reduce((sum, row) => sum + row.keywords, 0),
    traffic: all.reduce((sum, row) => sum + (row.traffic ?? 0), 0),
  };
  const sizeOf = (row: Section) => (measure === "traffic" ? row.traffic ?? 0 : row[measure]);
  // Shares are of the whole site's searches and visits, as the supplier counts
  // them: a list held in part is not the site (sites-data-completeness-plan.md,
  // §4.D4). With no total yet, they are of what is held, and say so.
  const coverage = site?.coverage;
  const partHeld = isPartHeld(coverage);
  const siteTotals = {
    pages: totals.pages,
    keywords: partHeld && coverage?.searches.total ? coverage.searches.total : totals.keywords,
    // The visits held can pass the site's own estimate, which is worked out apart: never a share over the whole.
    traffic: partHeld && coverage?.visits.total ? Math.max(coverage.visits.total, totals.traffic) : totals.traffic,
  };
  const allVisitsHeld = siteTotals.traffic <= totals.traffic;
  const ofHeld = partHeld && !coverage?.searches.total;
  const shareLine = (share: number, what: string) => t(ofHeld ? "shareLineHeld" : "shareLine", { share: `${Math.round(share)}%`, what });

  const matches = wordStartMatcher(term);
  const matching = sections?.filter((row) => !matches || matches(label(row.section)));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "traffic", name: sectionOf });
  // A site with more folders than are read says the list is longer (4.4).
  const pager = useSitePager(sorted, { isLoading: sections === undefined, cut: answer?.cut });
  const host = site?.host ?? "site";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<FolderTree className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description")}
        pills={all.length > 0 ? (
          <span className="text-[12px] text-muted">
            {t(partHeld ? "summaryHeld" : "summary", { sections: all.length, pages: totals.pages, keywords: totals.keywords, traffic: formatNumber(totals.traffic) })}
          </span>
        ) : null}
      />
      {partHeld ? (
        <div className="flex flex-col gap-1">
          <HeldLine coverage={coverage} />
          {!ofHeld ? (
            <p className="text-[12px] leading-relaxed text-secondary">
              {t(allVisitsHeld ? "outsideAllVisits" : "outside", {
                searches: `${Math.round(percent(totals.keywords, siteTotals.keywords))}%`,
                visits: `${Math.round(percent(totals.traffic, siteTotals.traffic))}%`,
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <SiteChartCard
        dated={false}
        title={t("mapTitle", { measure: t(`measures.${measure}`) })}
        hint={t("mapHint", { measure: t(`measures.${measure}`) })}
        controls={(
          <SiteViewSwitch
            label={t("measure")}
            options={MEASURES.map((entry) => ({ value: entry, label: t(`switch.${entry}`) }))}
            value={measure}
            onChange={setMeasure}
          />
        )}
        exportName={`${host}-structure`}
        csv={() => toCsv(
          [t("columns.section"), t("columns.pages"), t("columns.keywords"), t("columns.top3"), t("columns.traffic")],
          all.map((row) => [row.section, row.pages, row.keywords, row.top3, row.traffic === null ? null : Math.round(row.traffic)]),
        )}
        enoughData={all.length > 0}
      >
        <SiteTreemap
          onOpen={(section) => router.push(folderHref(section))}
          items={[...all].sort((left, right) => sizeOf(right) - sizeOf(left)).map((row) => ({
            id: row.section,
            name: label(row.section),
            value: sizeOf(row),
            shade: row.keywords > 0 ? row.top3 / row.keywords / STRONG_TOP3_SHARE : 0,
            caption: `${formatNumber(sizeOf(row))} · ${Math.round(percent(sizeOf(row), siteTotals[measure]))}%`,
            readout: [
              { value: formatNumber(row.traffic), label: t("readout.traffic") },
              { value: formatNumber(row.keywords), label: t("readout.keywords") },
              { value: formatNumber(row.pages), label: t("readout.pages") },
              { value: `${Math.round(percent(row.top3, row.keywords))}%`, label: t("readout.top3") },
            ],
          }))}
        />
        <p className="mt-2 text-[12px] text-muted">{t("mapNote")}</p>
      </SiteChartCard>

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.section}
        onRowClick={(row) => router.push(folderHref(row.section))}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        cardHeader={<TableBar footer={pager.footer} noun="folders" actions={<ListDownload fileName={`${host}-structure`} rows={sorted} columns={[{ header: t("columns.section"), value: (row) => row.section }, { header: t("columns.pages"), value: (row) => row.pages }, { header: t("columns.keywords"), value: (row) => row.keywords }, { header: t("columns.top3"), value: (row) => row.top3 }, { header: t("columns.traffic"), value: (row) => (row.traffic === null ? null : Math.round(row.traffic)) }, { header: tc("lastChecked"), value: (row) => row.day }]} />} />}
        empty={{ icon: <FolderTree className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "section", header: t("columns.section"), sortable: true, cell: (row) => <RecordLinkCell href={folderHref(row.section)} className="text-[13px] text-info">{label(row.section)}</RecordLinkCell> },
          { key: "pages", header: t("columns.pages"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.pages)}</span> },
          { key: "keywords", header: t("columns.keywords"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.keywords)}</span> },
          { key: "top3", header: t("columns.top3"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.top3)}</span> },
          { key: "traffic", header: t("columns.traffic"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.traffic)}</span> },
          {
            key: "share",
            className: "w-[26%]",
            header: (
              <span>
                {/* The key to the two bars below, in the bars' own colours. */}
                {t("columns.share")}: <span style={{ color: CHART_SERIES_BLUE }}>{t("shareOf.keywords")}</span> · <span style={{ color: CHART_SERIES_TEAL }}>{t("shareOf.traffic")}</span>
              </span>
            ),
            sortable: true,
            cell: (row) => {
              const searches = percent(row.keywords, siteTotals.keywords);
              const visits = percent(row.traffic ?? 0, siteTotals.traffic);
              return (
                <span
                  className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-x-2 gap-y-1 text-[11px]"
                  title={`${shareLine(searches, t("shareOf.keywords"))} · ${shareLine(visits, t("shareOf.traffic"))}`}
                >
                  <Meter value={searches / 100} colour={CHART_SERIES_BLUE} className="w-full" />
                  <span className="text-right font-mono text-secondary">{Math.round(searches)}%</span>
                  <Meter value={visits / 100} colour={CHART_SERIES_TEAL} className="w-full" />
                  <span className="text-right font-mono text-secondary">{Math.round(visits)}%</span>
                </span>
              );
            },
          },
        ]}
      />
    </div>
  );
}
