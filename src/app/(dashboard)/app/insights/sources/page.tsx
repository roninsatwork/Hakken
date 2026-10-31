"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { Plug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { formatDay } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";

type Status = "CONNECTED" | "NOT_CONNECTED" | "SET" | "NOT_SET" | "SOON";
const TONE: Record<Status, "success" | "warning" | "neutral"> = { CONNECTED: "success", SET: "success", NOT_CONNECTED: "warning", NOT_SET: "warning", SOON: "neutral" };

/**
 * Sources (docs/plans/active/insights-analyst-plan.md §4.1, phase 13, drawn
 * as the Sources board): what Hakken reads for each of the company's
 * websites, how far back each source goes, and what connecting or setting the
 * rest would let it tell you — each missing one with the place it is done.
 * No supplier is named (Anthony): a source is what it gives, not who sells it.
 */
export default function InsightsSourcesPage() {
  const t = usePlatformTranslations("insights.sources");
  const [siteParam, setSite] = useSiteParam<string>("site", "");
  const data = useQuery(api.insightsReads.insightsSources, {});
  const [search, setSearch, term] = useSiteSearch();
  const chosen = data?.find((entry) => entry.siteId === siteParam) ?? data?.[0];
  const matches = wordStartMatcher(term.toLowerCase());
  const rows = chosen?.sources.filter((row) => !matches || matches(`${t(`names.${row.source}`)} ${t(`gives.${row.source}`)}`));
  const pages = useSitePager(data ? rows : undefined, { isLoading: data === undefined });
  const header = <PageHeader icon={<Plug className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (!chosen) return <>{header}<HakkenEmptyState icon={Plug} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const statusWords = (row: (typeof chosen.sources)[number]) => (row.source === "businessProfiles" && row.count ? t("listings", { count: row.count }) : t(`statuses.${row.status}`));
  const history = (row: (typeof chosen.sources)[number]) => {
    if (row.source === "searchConsole" && row.since) return t("history.searchConsole", { day: formatDay(row.since) });
    // Analytics keeps its days for eight weeks, and its lists for 12 months and the 12 before (I43).
    if (row.source === "analytics" && row.status === "CONNECTED") return t("history.analytics");
    if (row.since) return t("history.since", { day: formatDay(row.since) });
    return "–";
  };
  const missing = chosen.sources.filter((row) => row.status === "NOT_CONNECTED" || row.status === "NOT_SET");
  const says = missing.length === 0
    ? [t("sees.everything", { host: chosen.host })]
    : [t("sees.missing", { host: chosen.host, count: missing.length, first: t(`unlocks.${missing[0].source}`) })];
  const fixHref = (source: string, siteId: Id<"companyWebsites">) => {
    if (source === "searchConsole") return "/app/search-console";
    if (source === "analytics") return "/app/analytics";
    if (source === "clarity") return `/app/clarity/${siteId}/connection`;
    if (source === "enquiryValue") return `/app/analytics/${siteId}/tracking-health`;
    if (source === "businessProfiles") return `/app/sites/${siteId}/local`;
    return `/app/sites/${siteId}`;
  };
  const steps: HakkenSeesStep[] = missing.slice(0, 3).map((row) => ({ words: t(`fix.${row.source}`), link: t(`fixLink.${row.source}`), href: fixHref(row.source, chosen.siteId) }));

  return (
    <>
      {header}
      <HakkenSees says={says} steps={steps} page={{ screen: "insights.sources", siteId: chosen.siteId, data: chosen }} />
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.source}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <Select chip={{ label: t("website"), choice: chosen.host }} value={chosen.siteId} onChange={setSite} aria-label={t("website")}>
            {data.map((entry) => <option key={entry.siteId} value={entry.siteId}>{entry.host}</option>)}
          </Select>
        }
        cardHeader={<TableBar footer={pages.footer} noun="results" title={t("tableTitle", { count: chosen.sources.length, host: chosen.host })} actions={<ListDownload label={t("download")} fileName={`${chosen.host}-sources`} rows={rows} columns={[{ header: t("columns.source"), value: (row) => t(`names.${row.source}`) }, { header: t("columns.status"), value: statusWords }, { header: t("columns.history"), value: history }, { header: t("columns.gives"), value: (row) => t(`gives.${row.source}`) }]} />} />}
        empty={{ icon: <Plug className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
        footer={pages.footer}
        columns={[
          { key: "source", header: t("columns.source"), cell: (row) => <span className="text-[13px] text-foreground">{t(`names.${row.source}`)}</span> },
          { key: "status", header: t("columns.status"), cell: (row) => <StatusLabel tone={TONE[row.status]}>{statusWords(row)}</StatusLabel> },
          { key: "history", header: t("columns.history"), cell: (row) => <span className="text-[12px] text-secondary">{history(row)}</span> },
          { key: "gives", header: t("columns.gives"), cell: (row) => <span className="text-[12px] text-secondary">{t(`gives.${row.source}`)}</span> },
        ]}
      />
    </>
  );
}
