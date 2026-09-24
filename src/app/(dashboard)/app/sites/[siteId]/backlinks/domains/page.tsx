"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Network } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { LinkStatusPill, RecordLinkCell } from "../../../_components/SiteCells";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { formatDay, formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSitePagedTable } from "../../../_components/useSitePagedTable";

type Status = "LIVE" | "NEW" | "LOST";
type Sort = "rank" | "backlinks" | "newest";

/**
 * Referring domains: every website linking here — its strength, its links,
 * when it first linked and whether it still does — paged on the server.
 */
export default function SiteReferringDomainsPage() {
  const t = useTranslations("sites.backlinksDomains");
  const tl = useTranslations("sites.linkLists");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const [search, setSearch, term] = useSiteSearch();
  const [status, setStatus] = useSiteParam<Status | "">("status", "", ["LIVE", "NEW", "LOST"]);
  const [sort, setSort] = useSiteParam<Sort>("sort", "rank", ["rank", "backlinks", "newest"]);
  const table = useSitePagedTable(api.siteLinkLists.listReferringDomains, {
    siteId,
    ...(term ? { search: term } : {}),
    ...(status ? { status } : {}),
    sort,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Network className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={table.isLoading ? undefined : table.rows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "domain", domain: row.domain }))}
        minWidthClassName="min-w-[720px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={tl("statusFilter")} value={status} onChange={(value) => setStatus(value as Status | "")}>
              <option value="">{tl("anyStatus")}</option>
              <option value="LIVE">{tl("statuses.LIVE")}</option>
              <option value="LOST">{tl("statuses.LOST")}</option>
            </Select>
            <Select aria-label={tl("sortLabel")} value={sort} onChange={(value) => setSort(value as Sort)}>
              <option value="rank">{t("sortRank")}</option>
              <option value="backlinks">{t("sortBacklinks")}</option>
              <option value="newest">{t("sortNewest")}</option>
            </Select>
            <TableDownload siteId={siteId} kind="domains" />
          </>
        }
        empty={{ icon: <Network className="h-8 w-8 text-muted/30" />, label: term || status ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: table.page,
          totalPages: table.totalPages,
          totalCount: table.loadedCount,
          pageSize: table.pageSize,
          isLoading: table.isBusy,
          onPageChange: table.goToPage,
        }}
        columns={[
          { key: "domain", header: t("columns.domain"), cell: (row) => <RecordLinkCell href={recordHref({ kind: "domain", domain: row.domain })}>{row.domain}</RecordLinkCell> },
          { key: "rank", header: <span title={t("rankHint")}>{t("columns.rank")}</span>, align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.rank)}</span> },
          { key: "backlinks", header: t("columns.backlinks"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.backlinks)}</span> },
          { key: "spam", header: t("columns.spam"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.spamScore)}</span> },
          { key: "firstSeen", header: t("columns.firstSeen"), cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(row.firstSeen)}</span> },
          { key: "status", header: t("columns.status"), cell: (row) => <LinkStatusPill status={row.status} /> },
        ]}
      />
    </div>
  );
}
