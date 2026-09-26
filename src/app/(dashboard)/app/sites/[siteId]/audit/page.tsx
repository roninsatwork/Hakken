"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Stethoscope } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { CheckedCell, RecordLinkCell } from "../../_components/SiteCells";
import { SiteTableBar } from "../../_components/SiteTableBar";
import { SiteChartCard } from "../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../_components/SiteCharts";
import { useSiteRange } from "../../_components/SiteDateRange";
import { formatDay, formatNumber, formatShortDay, toCsv } from "../../_components/siteFormat";
import { useSite, useSiteId } from "../../_components/useSite";
import { SiteFigure } from "../../_components/SiteFigure";
import { useSiteRecordHref } from "../../_components/siteRecordLinks";
import { sharedSiteQuery, useSiteParam, useSiteSearch } from "../../_components/useSiteParam";
import { useSitePager } from "../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../_components/useSiteSort";
import { ListDownload } from "../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

type Severity = "ERROR" | "WARNING" | "NOTICE";
const SEVERITIES: Severity[] = ["ERROR", "WARNING", "NOTICE"];
const SEVERITY_TONES: Record<Severity, StatusTone> = { ERROR: "danger", WARNING: "warning", NOTICE: "neutral" };
/** How serious, as a number to sort by: the worst the most. */
const SEVERITY_WEIGHTS: Record<Severity, number> = { ERROR: 3, WARNING: 2, NOTICE: 1 };
type Issue = { check: string; severity: Severity; pages: number };
const pagesOf = (row: Issue) => row.pages;


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
  const router = useRouter();
  const params = useSearchParams();
  const recordHref = useSiteRecordHref(siteId);
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const [search, setSearch, term] = useSiteSearch();
  const [severity, setSeverity] = useSiteParam<Severity | "">("severity", "", SEVERITIES);
  // A severity's figure narrows the table below to it, on this same page.
  const shared = sharedSiteQuery(params);
  const severityHref = (wanted: Severity) => `/app/sites/${siteId}/audit${shared ? `${shared}&` : "?"}severity=${wanted}`;

  const label = useCallback((check: string) => (t.has(`checks.${check}`) ? t(`checks.${check}`) : check.replace(/_/g, " ")), [t]);
  const issues = audit?.issues ?? [];
  const matches = wordStartMatcher(term);
  const matching = audit === undefined ? undefined : issues
    .filter((issue) => (!severity || issue.severity === severity) && (!matches || matches(label(issue.check))));
  // The columns that sort (docs/plans/active/sites-table-sorting-plan.md):
  // the problem A to Z as it reads, how serious — the worst first, then the
  // most pages, the order it opens on — and the most pages first. Last
  // checked is the same day on every row, and does not.
  const columns = useMemo<SiteSortColumns<Issue, "issue" | "severity" | "pages">>(() => ({
    issue: { value: (row) => label(row.check), first: "asc" },
    severity: { value: (row) => SEVERITY_WEIGHTS[row.severity] * 1_000_000 + row.pages, first: "desc" },
    pages: { value: pagesOf, first: "desc" },
  }), [label]);
  const nameOf = useCallback((row: Issue) => label(row.check), [label]);
  const { rows: sorted, tableSort } = useSiteSortedList(matching, columns, { opening: "severity", name: nameOf });
  const pager = useSitePager(sorted, { isLoading: audit === undefined });
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
          <SiteFigure label={t("score")} value={formatNumber(audit?.onPageScore)} detail={<span className="text-muted">{t("scoreScale")}</span>} />
          <SiteFigure
            label={t("pages")}
            value={formatNumber(audit?.pagesCrawled)}
            detail={audit?.maxPages ? <span className="text-muted">{t("pagesOf", { max: formatNumber(audit.maxPages) })}</span> : undefined}
          />
          <SiteFigure label={t("errors")} value={audit ? String(count("ERROR")) : "–"} href={severityHref("ERROR")} />
          <SiteFigure label={t("warnings")} value={audit ? String(count("WARNING")) : "–"} href={severityHref("WARNING")} />
          <SiteFigure label={t("notices")} value={audit ? String(count("NOTICE")) : "–"} href={severityHref("NOTICE")} />
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
        rows={pager.pageRows}
        rowKey={(row) => row.check}
        onRowClick={(row) => router.push(recordHref({ kind: "problem", check: row.check }))}
        minWidthClassName="min-w-[640px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("severityFilter"), choice: severity ? t(`severities.${severity}`) : null }} value={severity} onChange={(value) => setSeverity(value as Severity | "")}>
            <option value="">{t("anySeverity")}</option>
            {SEVERITIES.map((entry) => <option key={entry} value={entry}>{t(`severities.${entry}`)}</option>)}
          </Select>
          </>
        }
        cardHeader={<SiteTableBar footer={pager.footer} noun="problems" actions={<ListDownload fileName={`${site?.host ?? "site"}-site-audit`} rows={sorted} columns={[{ header: t("columns.issue"), value: (row) => label(row.check) }, { header: t("columns.severity"), value: (row) => t(`severities.${row.severity}`) }, { header: t("columns.pages"), value: (row) => row.pages }, { header: t("columns.lastChecked"), value: () => audit?.day ?? null }]} />} />}
        empty={{ icon: <Stethoscope className="h-8 w-8 text-muted/30" />, label: audit === null ? t("empty") : term || severity ? t("noMatch") : t("noIssues") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "issue", header: t("columns.issue"), sortable: true, cell: (row) => <RecordLinkCell href={recordHref({ kind: "problem", check: row.check })}>{label(row.check)}</RecordLinkCell> },
          { key: "severity", header: t("columns.severity"), sortable: true, cell: (row) => <StatusPill tone={SEVERITY_TONES[row.severity]}>{t(`severities.${row.severity}`)}</StatusPill> },
          { key: "pages", header: t("columns.pages"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.pages)}</span> },
          { key: "checked", header: t("columns.lastChecked"), cell: () => <CheckedCell day={audit?.day ?? null} /> },
        ]}
      />
    </div>
  );
}
