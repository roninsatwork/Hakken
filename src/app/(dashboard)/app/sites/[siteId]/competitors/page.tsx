"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Swords } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { SiteChartCard } from "../../_components/SiteChartCard";
import { SiteTableBar } from "../../_components/SiteTableBar";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../_components/SiteCharts";
import { useSiteRange } from "../../_components/SiteDateRange";
import { formatNumber, formatShortDay, toCsv } from "../../_components/siteFormat";
import { RecordLinkCell } from "../../_components/SiteCells";
import { useSiteRecordHref } from "../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../_components/useSite";
import { useSitePager } from "../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../_components/useSiteSort";
import { useSiteSearch } from "../../_components/useSiteParam";
import { ListDownload } from "../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

type Figures = { websiteId: string; host: string; estimatedTraffic: number | null; keywords: number | null; referringDomains: number | null };
const hostOf = (row: Figures) => row.host;

const VERDICT_TONES: Record<string, StatusTone> = {
  AHEAD: "warning",
  LEVEL: "info",
  BEHIND: "success",
  GONE_QUIET: "neutral",
  TOO_NEW: "neutral",
  NOT_CHECKED: "neutral",
};

/**
 * Side by side: this site beside the others in its group — as each stood at
 * its newest check, and how each compares on the searches and questions the
 * site is measured on. The chart draws their estimated traffic together.
 */
export default function SiteSideBySidePage() {
  const t = useTranslations("sites.sideBySide");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const figures = useQuery(api.siteCharts.siteAndRivals, { siteId });
  const [search, setSearch, settled] = useSiteSearch();
  const lower = settled.toLowerCase();
  const matches = wordStartMatcher(lower);
  const shownFigures = figures?.filter((row) => !matches || matches(row.host));
  const rivals = useQuery(api.siteCompetitors.listRivals, { siteId });
  const compare = useMemo(() => new Map((rivals ?? []).map((row) => [row.websiteId as string, row])), [rivals]);
  // The columns that sort (docs/plans/active/sites-table-sorting-plan.md):
  // the website A to Z; the most visits — the order it opens on — keywords,
  // linking websites, and searches it is above this site on, first; this
  // site sorted in with the rest, still marked.
  const columns = useMemo<SiteSortColumns<Figures, "website" | "traffic" | "keywords" | "linking" | "beats">>(() => ({
    website: { value: (row) => row.host, first: "asc" },
    traffic: { value: (row) => row.estimatedTraffic, first: "desc" },
    keywords: { value: (row) => row.keywords, first: "desc" },
    linking: { value: (row) => row.referringDomains, first: "desc" },
    beats: { value: (row) => compare.get(row.websiteId)?.beatsYouOn ?? null, first: "desc" },
  }), [compare]);
  const { rows: sorted, tableSort } = useSiteSortedList(shownFigures, columns, { opening: "traffic", name: hostOf });
  // Paged like every table, however many rivals a group holds.
  const paged = useSitePager(sorted ?? [], { isLoading: figures === undefined });
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  // A competitor opens its own comparison with this site; this site is the one being read.
  const rivalHref = (row: { host: string; isYou: boolean }): string | null => {
    if (row.isYou) return null;
    const hold = site?.holds.find((entry) => entry.host === row.host);
    return hold ? recordHref({ kind: "rival", rivalId: hold.siteId }) : null;
  };
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step, withRivals: true });

  const lines = series ?? [];
  const days = [...new Set(lines.flatMap((line) => line.points.map((point) => point.day)))].sort();
  const traffic = (line: (typeof lines)[number], day: string) => line.points.find((point) => point.day === day)?.estimatedTraffic ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Swords className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-traffic-side-by-side-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", ...lines.map((line) => line.host)], days.map((day) => [day, ...lines.map((line) => traffic(line, day))]))}
        enoughData={days.length > 0}
      >
        <SiteLineChart
          sharedScale
          data={days.map((day) => ({ label: formatShortDay(day), ...Object.fromEntries(lines.map((line) => [line.host, traffic(line, day)])) }))}
          series={lines.map((line, index) => ({
            key: line.host,
            name: line.isYou ? tc("you", { host: line.host }) : line.host,
            colour: SITE_SERIES_COLOURS[index % SITE_SERIES_COLOURS.length],
            dashed: !line.isYou,
          }))}
        />
      </SiteChartCard>

      <DataTable
        rows={paged.pageRows}
        rowKey={(row) => row.websiteId}
        onRowClick={(row) => { const href = rivalHref(row); if (href) router.push(href); }}
        rowClickable={(row) => rivalHref(row) !== null}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: tc("findWebsite") }}
        cardHeader={<SiteTableBar footer={paged.footer} noun="websites" actions={<ListDownload fileName={`${site?.host ?? "site"}-side-by-side`} rows={sorted} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.traffic"), value: (row) => row.estimatedTraffic }, { header: t("columns.keywords"), value: (row) => row.keywords }, { header: t("columns.top3"), value: (row) => row.top3 }, { header: t("columns.linking"), value: (row) => row.referringDomains }, { header: t("columns.rank"), value: (row) => row.domainRank }, { header: tc("lastChecked"), value: (row) => row.day }]} />} />}
        empty={{ icon: <Swords className="h-8 w-8 text-muted/30" />, label: lower ? tc("noWebsiteMatch") : t("empty") }}
        footer={paged.footer}
        sort={tableSort}
        columns={[
          {
            key: "website",
            header: t("columns.website"),
            sortable: true,
            cell: (row) => {
              const href = rivalHref(row);
              const className = `text-[13px] ${row.isYou ? "font-medium text-foreground" : "text-secondary"}`;
              const name = row.isYou ? tc("you", { host: row.host }) : row.host;
              return href ? <RecordLinkCell href={href} className={className}>{name}</RecordLinkCell> : <span className={className}>{name}</span>;
            },
          },
          { key: "traffic", header: t("columns.traffic"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.estimatedTraffic)}</span> },
          { key: "keywords", header: t("columns.keywords"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.keywords)}</span> },
          { key: "linking", header: t("columns.linking"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.referringDomains)}</span> },
          {
            key: "beats",
            header: t("columns.beatsYou"),
            align: "right",
            sortable: true,
            cell: (row) => {
              const entry = compare.get(row.websiteId);
              return entry ? <span className="font-mono text-[12px]">{t("searchesOf", { count: entry.beatsYouOn, total: entry.comparedOn })}</span> : <span className="text-muted">–</span>;
            },
          },
          {
            key: "verdict",
            header: t("columns.verdict"),
            cell: (row) => {
              const entry = compare.get(row.websiteId);
              return entry ? <StatusPill tone={VERDICT_TONES[entry.verdict] ?? "neutral"}>{t(`verdicts.${entry.verdict}`)}</StatusPill> : <span className="text-muted">–</span>;
            },
          },
        ]}
      />
    </div>
  );
}
