"use client";

import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { FlaskConical } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { formatDay, formatNumber } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useInsightsHref, useInsightsSite } from "../_components/useInsights";

const STATUSES = ["READY", "RUNNING", "DONE"] as const;
const TONE = { READY: "info", RUNNING: "warning", DONE: "success" } as const;
const EIGHT_WEEKS = 56 * 86_400_000;

/**
 * Experiments (docs/plans/active/insights-analyst-plan.md §4.1, phase 14,
 * I44, drawn as the Experiments board): the changes worth making, from the
 * page reviews, the most visited page first. When a change goes live the
 * person says so; Hakken keeps the page's 30 days before it and measures its
 * last 30 days eight weeks on — the honest way when there is too little
 * traffic for a split test.
 */
export default function InsightsExperimentsPage() {
  const t = useTranslations("insights.experiments");
  const tVerdict = useTranslations("insights.verdicts");
  const href = useInsightsHref();
  const site = useInsightsSite();
  const data = useQuery(api.insightsConversion.insightsConversion, site ? { siteId: site } : {});
  const start = useMutation(api.insightsConversion.startExperiment);
  const action = useAdminAction({ scope: "insight-experiment" });
  const [search, setSearch, term] = useSiteSearch();
  const [status, setStatus] = useSiteParam<string>("status", "");
  const matches = wordStartMatcher(term.toLowerCase());
  const rows = data?.experiments
    .filter((row) => (!status || row.status === status) && (!matches || matches(`${row.page} ${tVerdict(row.verdict)}`)))
    .sort((a, b) => STATUSES.indexOf(a.status as (typeof STATUSES)[number]) - STATUSES.indexOf(b.status as (typeof STATUSES)[number]) || b.visits - a.visits);
  const pages = useSitePager(data ? rows : undefined, { isLoading: data === undefined });
  const header = <PageHeader icon={<FlaskConical className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (!data || data.experiments.length === 0) return <>{header}<HakkenEmptyState icon={FlaskConical} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const ready = data.experiments.filter((row) => row.status === "READY");
  const first = [...ready].sort((a, b) => b.visits - a.visits)[0];
  const says = [t("sees.ready", { count: ready.length, running: data.experiments.filter((row) => row.status === "RUNNING").length })];
  const steps = first ? [{ words: t("do", { page: first.page }), link: t("seeReviews"), href: href("page-reviews") }] : [];
  const set = (experimentId: Id<"insightExperiments">, state: "RUNNING" | "READY" | "DROPPED") => void action.run(() => start({ experimentId, state }), { key: `${experimentId}`, fallbackMessage: t("failed") });
  const statusWords = (row: NonNullable<typeof rows>[number]) => {
    if (row.status === "RUNNING" && row.startedAt) return t("statuses.RUNNING", { day: formatDay(new Date(row.startedAt + EIGHT_WEEKS).toISOString().slice(0, 10)) });
    if (row.status === "DONE" && row.baseline && row.result) return t("statuses.DONE", { before: formatNumber(row.baseline.enquiries), after: formatNumber(row.result.enquiries) });
    return t(`statuses.${row.status}`, { day: "", before: "", after: "" });
  };

  return (
    <>
      {header}
      <HakkenSees says={says} steps={steps} />
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.experimentId}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <Select chip={{ label: t("status"), choice: status ? t(`filter.${status}`) : null }} value={status} onChange={setStatus} aria-label={t("status")}>
            <option value="">{t("everyStatus")}</option>
            {STATUSES.map((value) => <option key={value} value={value}>{t(`filter.${value}`)}</option>)}
          </Select>
        }
        cardHeader={<TableBar footer={pages.footer} noun="results" title={t("tableTitle", { count: rows?.length ?? 0 })} actions={<ListDownload label={t("download")} fileName={`${data.host}-experiments`} rows={rows} columns={[{ header: t("columns.change"), value: (row) => tVerdict(row.verdict) }, { header: t("columns.page"), value: (row) => row.page }, { header: t("columns.why"), value: (row) => row.why }, { header: t("columns.status"), value: statusWords }]} />} />}
        empty={{ icon: <FlaskConical className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
        footer={pages.footer}
        columns={[
          { key: "change", header: t("columns.change"), cell: (row) => <span className="text-[13px] text-foreground">{tVerdict(row.verdict)}</span> },
          { key: "page", header: t("columns.page"), cell: (row) => <span className="truncate text-[12px] text-secondary">{row.page}</span> },
          { key: "why", header: t("columns.why"), cell: (row) => <span className="text-[12px] text-secondary">{row.why || "–"}</span> },
          { key: "measured", header: t("columns.measured"), cell: () => <span className="text-[12px] text-secondary">{t("measuredBy")}</span> },
          { key: "status", header: t("columns.status"), cell: (row) => <StatusLabel tone={TONE[row.status as keyof typeof TONE] ?? "neutral"}>{statusWords(row)}</StatusLabel> },
          {
            key: "act",
            header: t("columns.act"),
            cell: (row) => row.status === "READY"
              ? <Button variant="quiet" onClick={() => set(row.experimentId, "RUNNING")} disabled={action.isBusy(`${row.experimentId}`)}>{t("live")}</Button>
              : row.status === "RUNNING"
                ? <Button variant="quiet" onClick={() => set(row.experimentId, "READY")} disabled={action.isBusy(`${row.experimentId}`)}>{t("notLive")}</Button>
                : null,
          },
        ]}
      />
    </>
  );
}
