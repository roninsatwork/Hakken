"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Radar } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { CheckedCell } from "../../../_components/SiteCells";
import { formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

const KINDS = ["COMPETITOR", "DIRECTORY", "PUBLISHER", "SUPPLIER", "OTHER"] as const;
type Kind = (typeof KINDS)[number];

/**
 * Organic competitors: every website DataForSEO found ranking for the same
 * searches, most overlap first, with what kind of website each is. A few
 * hundred at most per site, so the list arrives whole and is narrowed in place.
 */
export default function SiteOrganicCompetitorsPage() {
  const t = useTranslations("sites.organic");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const rows = useQuery(api.siteCompetitors.listOrganicCompetitors, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [kind, setKind] = useSiteParam<Kind | "">("kind", "", KINDS);
  const [page, setPage] = useState(1);

  const lower = term.toLowerCase();
  const matching = rows?.filter((row) => (!lower || row.host.includes(lower)) && (!kind || (row.kind ?? "OTHER") === kind));
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Radar className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={shown}
        rowKey={(row) => row.host}
        minWidthClassName="min-w-[1100px]"
        search={{ value: search, onChange: (next) => { setSearch(next); setPage(1); }, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={t("kindFilter")} value={kind} onChange={(value) => { setKind(value as Kind | ""); setPage(1); }}>
            <option value="">{t("anyKind")}</option>
            {KINDS.map((entry) => <option key={entry} value={entry}>{t(`kinds.${entry}`)}</option>)}
          </Select>
            <ListDownload fileName={"organic-competitors"} rows={matching} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.kind"), value: (row) => t(`kinds.${row.kind ?? "OTHER"}`) }, { header: t("columns.shared"), value: (row) => row.intersections }, { header: t("columns.position"), value: (row) => row.averagePosition }, { header: t("columns.traffic"), value: (row) => row.estimatedTraffic }, { header: t("columns.domainKeywords"), value: (row) => row.domainKeywords }, { header: t("columns.domainTraffic"), value: (row) => (row.domainTraffic === null ? null : Math.round(row.domainTraffic)) }, { header: tc("lastChecked"), value: (row) => row.day }]} />
          </>
        }
        empty={{ icon: <Radar className="h-8 w-8 text-muted/30" />, label: term || kind ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: matching?.length ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: rows === undefined,
          onPageChange: setPage,
        }}
        columns={[
          { key: "website", header: t("columns.website"), cell: (row) => <span className="text-[13px] text-foreground">{row.host}</span> },
          {
            key: "kind",
            header: t("columns.kind"),
            cell: (row) => <StatusPill tone={row.kind === "COMPETITOR" ? "warning" : "neutral"}>{t(`kinds.${row.kind ?? "OTHER"}`)}</StatusPill>,
          },
          { key: "shared", header: t("columns.shared"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.intersections)}</span> },
          { key: "position", header: t("columns.position"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.averagePosition === null ? "–" : row.averagePosition.toFixed(1)}</span> },
          { key: "traffic", header: t("columns.traffic"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.estimatedTraffic)}</span> },
          { key: "domainKeywords", header: t("columns.domainKeywords"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.domainKeywords)}</span> },
          { key: "domainTraffic", header: t("columns.domainTraffic"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.domainTraffic)}</span> },
          { key: "tracked", header: t("columns.tracked"), cell: (row) => (row.tracked ? <StatusPill tone="success">{tc("yes")}</StatusPill> : <span className="text-muted">–</span>) },
          { key: "checked", header: tc("lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
