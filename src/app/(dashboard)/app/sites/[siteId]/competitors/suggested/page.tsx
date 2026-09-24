"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { CheckedCell } from "../../../_components/SiteCells";
import { formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSiteSearch } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

/**
 * Suggested competitors: websites worth watching that the company does not
 * hold yet — named by the AI answers first, then ranking for the same
 * searches. Read-only (D1, D6): adding one is done for the client in admin.
 */
export default function SiteSuggestedPage() {
  const t = useTranslations("sites.suggested");
  const to = useTranslations("sites.organic.kinds");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const rows = useQuery(api.siteCompetitors.listSuggested, { siteId });
  const [search, setSearch, settled] = useSiteSearch();
  const [page, setPage] = useState(1);
  const term = settled.toLowerCase();
  const matching = rows?.filter((row) => !term || row.host.includes(term));
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Lightbulb className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={shown}
        rowKey={(row) => row.host}
        minWidthClassName="min-w-[700px]"
        search={{ value: search, onChange: (next) => { setSearch(next); setPage(1); }, placeholder: t("searchPlaceholder") }}
filters={<ListDownload fileName={"suggested-competitors"} rows={matching} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.why"), value: (row) => (row.reason === "NAMED_BY_AI" ? t("namedByAi", { times: row.times ?? 0 }) : t("ranksFor", { count: String(row.intersections ?? 0) })) }, { header: tc("lastChecked"), value: (row) => row.day }]} />}
        empty={{ icon: <Lightbulb className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
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
            key: "why",
            header: t("columns.why"),
            cell: (row) => (
              <span className="flex flex-wrap items-center gap-2 text-[12px] text-secondary">
                {row.reason === "NAMED_BY_AI"
                  ? t("namedByAi", { times: row.times ?? 0 })
                  : t("ranksFor", { count: formatNumber(row.intersections) })}
                {row.kind ? <StatusPill tone={row.kind === "COMPETITOR" ? "warning" : "neutral"}>{to(row.kind)}</StatusPill> : null}
              </span>
            ),
          },
          { key: "checked", header: tc("lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
