"use client";

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
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../_components/SiteCharts";
import { useSiteRange } from "../../_components/SiteDateRange";
import { formatNumber, formatShortDay, toCsv } from "../../_components/siteFormat";
import { RecordLinkCell } from "../../_components/SiteCells";
import { useSiteRecordHref } from "../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../_components/useSite";
import { useSitePagedRows } from "../../_components/useSitePagedTable";
import { useSiteSearch } from "../../_components/useSiteParam";
import { ListDownload } from "../../_components/SiteDownloads";

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
  const shownFigures = figures?.filter((row) => !lower || row.host.toLowerCase().includes(lower));
  // Fifteen rows a page, like every table, however many rivals a group holds.
  const paged = useSitePagedRows(shownFigures ?? [], lower);
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  // A competitor opens its own comparison with this site; this site is the one being read.
  const rivalHref = (row: { host: string; isYou: boolean }): string | null => {
    if (row.isYou) return null;
    const hold = site?.holds.find((entry) => entry.host === row.host);
    return hold ? recordHref({ kind: "rival", rivalId: hold.siteId }) : null;
  };
  const rivals = useQuery(api.siteCompetitors.listRivals, { siteId });
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step, withRivals: true });

  const compare = new Map((rivals ?? []).map((row) => [row.websiteId, row]));
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
        rows={shownFigures === undefined ? undefined : paged.pageRows}
        rowKey={(row) => row.websiteId}
        onRowClick={(row) => { const href = rivalHref(row); if (href) router.push(href); }}
        rowClickable={(row) => rivalHref(row) !== null}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: tc("findWebsite") }}
filters={<ListDownload fileName={`${site?.host ?? "site"}-side-by-side`} rows={shownFigures} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.traffic"), value: (row) => row.estimatedTraffic }, { header: t("columns.keywords"), value: (row) => row.keywords }, { header: t("columns.top3"), value: (row) => row.top3 }, { header: t("columns.linking"), value: (row) => row.referringDomains }, { header: t("columns.rank"), value: (row) => row.domainRank }, { header: tc("lastChecked"), value: (row) => row.day }]} />}
        empty={{ icon: <Swords className="h-8 w-8 text-muted/30" />, label: lower ? tc("noWebsiteMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.loadedCount,
          pageSize: paged.pageSize,
          isLoading: figures === undefined,
          onPageChange: paged.goToPage,
        }}
        columns={[
          {
            key: "website",
            header: t("columns.website"),
            cell: (row) => {
              const href = rivalHref(row);
              const className = `text-[13px] ${row.isYou ? "font-medium text-foreground" : "text-secondary"}`;
              const name = row.isYou ? tc("you", { host: row.host }) : row.host;
              return href ? <RecordLinkCell href={href} className={className}>{name}</RecordLinkCell> : <span className={className}>{name}</span>;
            },
          },
          { key: "traffic", header: t("columns.traffic"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.estimatedTraffic)}</span> },
          { key: "keywords", header: t("columns.keywords"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.keywords)}</span> },
          { key: "linking", header: t("columns.linking"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.referringDomains)}</span> },
          {
            key: "beats",
            header: t("columns.beatsYou"),
            align: "right",
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
