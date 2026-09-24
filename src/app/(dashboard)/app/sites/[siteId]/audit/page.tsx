"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Stethoscope } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { CheckedCell } from "../../_components/SiteCells";
import { SiteChartCard } from "../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../_components/SiteCharts";
import { useSiteRange } from "../../_components/SiteDateRange";
import { formatDay, formatNumber, formatShortDay, toCsv } from "../../_components/siteFormat";
import { useSite, useSiteId } from "../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../_components/useSiteParam";
import { ListDownload } from "../../_components/SiteDownloads";
import { ProblemPages } from "./ProblemPages";

type Severity = "ERROR" | "WARNING" | "NOTICE";
const SEVERITIES: Severity[] = ["ERROR", "WARNING", "NOTICE"];
const SEVERITY_TONES: Record<Severity, StatusTone> = { ERROR: "danger", WARNING: "warning", NOTICE: "neutral" };

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border-dim bg-card/40 px-5 py-4">
      <div className="text-[12px] text-secondary">{label}</div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-[12px] text-muted">{hint}</div> : null}
    </div>
  );
}

/**
 * Site audit: what the newest crawl found — the technical score, pages
 * crawled, and each problem as a count of pages, worst first — with the
 * crawls over the dates chosen drawn above the table.
 */
export default function SiteAuditPage() {
  const t = useTranslations("sites.audit");
  const tm = useTranslations("sites.measures");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const audit = useQuery(api.siteCrawl.siteAudit, { siteId });
  // The problem opened to see its pages.
  const [openCheck, setOpenCheck] = useState<string | null>(null);
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const [search, setSearch, term] = useSiteSearch();
  const [severity, setSeverity] = useSiteParam<Severity | "">("severity", "", SEVERITIES);
  const [page, setPage] = useState(1);

  const label = (check: string) => (t.has(`checks.${check}`) ? t(`checks.${check}`) : check.replace(/_/g, " "));
  const issues = audit?.issues ?? [];
  const lower = term.toLowerCase();
  const matching = audit === undefined ? undefined : issues
    .filter((issue) => (!severity || issue.severity === severity) && (!lower || label(issue.check).toLowerCase().includes(lower)))
    .sort((left, right) => SEVERITIES.indexOf(left.severity) - SEVERITIES.indexOf(right.severity) || right.pages - left.pages);
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);
  const count = (wanted: Severity) => issues.filter((issue) => issue.severity === wanted).length;
  const points = (series?.[0]?.points ?? []).filter((point) => point.crawledPages !== undefined);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Stethoscope className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description")}
        pills={audit ? (
          <span className="text-[12px] text-secondary">
            {t("asOf", { day: formatDay(audit.day) })}{audit.cms ? ` · ${t("builtWith", { cms: audit.cms })}` : ""}
          </span>
        ) : null}
      />

      {audit === null ? (
        <p className="rounded-2xl border border-border-dim bg-card/40 px-5 py-10 text-center text-[13px] text-secondary">{t("empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Figure label={t("score")} value={formatNumber(audit?.onPageScore)} hint={t("scoreScale")} />
          <Figure
            label={t("pages")}
            value={formatNumber(audit?.pagesCrawled)}
            {...(audit?.maxPages ? { hint: t("pagesOf", { max: formatNumber(audit.maxPages) }) } : {})}
          />
          <Figure label={t("errors")} value={audit ? String(count("ERROR")) : "–"} />
          <Figure label={t("warnings")} value={audit ? String(count("WARNING")) : "–"} />
          <Figure label={t("notices")} value={audit ? String(count("NOTICE")) : "–"} />
        </div>
      )}

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-site-audit-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", tm("crawledPages"), tm("onPageScore")], points.map((point) => [point.day, point.crawledPages, point.onPageScore]))}
        enoughData={points.length > 0}
      >
        <SiteLineChart
          data={points.map((point) => ({ label: formatShortDay(point.day), crawled: point.crawledPages ?? null, score: point.onPageScore ?? null }))}
          series={[
            { key: "crawled", name: tm("crawledPages"), colour: SITE_SERIES_COLOURS[1] },
            { key: "score", name: tm("onPageScore"), colour: SITE_SERIES_COLOURS[0] },
          ]}
        />
      </SiteChartCard>

      <DataTable
        rows={shown}
        rowKey={(row) => row.check}
        onRowClick={(row) => setOpenCheck(row.check)}
        minWidthClassName="min-w-[640px]"
        search={{ value: search, onChange: (next) => { setSearch(next); setPage(1); }, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={t("severityFilter")} value={severity} onChange={(value) => { setSeverity(value as Severity | ""); setPage(1); }}>
            <option value="">{t("anySeverity")}</option>
            {SEVERITIES.map((entry) => <option key={entry} value={entry}>{t(`severities.${entry}`)}</option>)}
          </Select>
            <ListDownload fileName={`${site?.host ?? "site"}-site-audit`} rows={matching} columns={[{ header: t("columns.issue"), value: (row) => label(row.check) }, { header: t("columns.severity"), value: (row) => t(`severities.${row.severity}`) }, { header: t("columns.pages"), value: (row) => row.pages }, { header: t("columns.lastChecked"), value: () => audit?.day ?? null }]} />
          </>
        }
        empty={{ icon: <Stethoscope className="h-8 w-8 text-muted/30" />, label: audit === null ? t("empty") : term || severity ? t("noMatch") : t("noIssues") }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: matching?.length ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: audit === undefined,
          onPageChange: setPage,
        }}
        columns={[
          { key: "issue", header: t("columns.issue"), cell: (row) => <span className="text-[13px] text-foreground">{label(row.check)}</span> },
          { key: "severity", header: t("columns.severity"), cell: (row) => <StatusPill tone={SEVERITY_TONES[row.severity]}>{t(`severities.${row.severity}`)}</StatusPill> },
          { key: "pages", header: t("columns.pages"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.pages)}</span> },
          { key: "checked", header: t("columns.lastChecked"), cell: () => <CheckedCell day={audit?.day ?? null} /> },
        ]}
      />
      <ProblemPages siteId={siteId} check={openCheck} label={openCheck ? label(openCheck) : ""} onClose={() => setOpenCheck(null)} />
    </div>
  );
}
