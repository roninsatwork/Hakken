"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Network } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { LinkStatusPill, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { formatDay, formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";

type Status = "LIVE" | "NEW" | "LOST";

/**
 * The columns that sort, over every linking website (docs/plans/active/
 * sites-table-sorting-plan.md): the website A to Z; the strongest, most links,
 * most suspicious and newest first.
 */
const SORTS = { domain: "asc", rank: "desc", backlinks: "desc", spam: "desc", firstSeen: "desc" } as const;

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
  const order = useSiteSort(SORTS, "rank");
  const table = useSiteListPage(api.siteLinkLists.listReferringDomains, {
    siteId,
    ...(term ? { search: term } : {}),
    ...(status ? { status } : {}),
    sort: order.key,
    direction: order.direction,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Network className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "domain", domain: row.domain }))}
        minWidthClassName="min-w-[720px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: tl("statusFilter"), choice: status ? tl(`statuses.${status}`) : null }} value={status} onChange={(value) => setStatus(value as Status | "")}>
              <option value="">{tl("anyStatus")}</option>
              <option value="LIVE">{tl("statuses.LIVE")}</option>
              <option value="LOST">{tl("statuses.LOST")}</option>
            </Select>
          </>
        }
        cardHeader={<SiteTableBar footer={table.footer} noun="linkingWebsites" actions={<TableDownload siteId={siteId} kind="domains" sort={order.tableSort} />} />}
        empty={{ icon: <Network className="h-8 w-8 text-muted/30" />, label: term || status ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          { key: "domain", header: t("columns.domain"), sortable: true, cell: (row) => <RecordLinkCell href={recordHref({ kind: "domain", domain: row.domain })}>{row.domain}</RecordLinkCell> },
          { key: "rank", header: <span title={t("rankHint")}>{t("columns.rank")}</span>, align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.rank)}</span> },
          { key: "backlinks", header: t("columns.backlinks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.backlinks)}</span> },
          { key: "spam", header: t("columns.spam"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.spamScore)}</span> },
          { key: "firstSeen", header: t("columns.firstSeen"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(row.firstSeen)}</span> },
          { key: "status", header: t("columns.status"), cell: (row) => <LinkStatusPill status={row.status} /> },
        ]}
      />
    </div>
  );
}
