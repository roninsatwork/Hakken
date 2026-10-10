"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Network } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { LinkStatusLabel, RecordLinkCell } from "../../../_components/SiteCells";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { formatDay, formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { SiteSees } from "../../../_components/SiteSees";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";
import { ListHeldLine } from "../../../_components/SiteCoverage";

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
  // The websites with a nofollow link here: what Link quality's count opens (4.13).
  const [follow, setFollow] = useSiteParam<"NOFOLLOW" | "">("follow", "", ["NOFOLLOW"]);
  const order = useSiteSort(SORTS, "rank");
  const table = useSiteListPage(api.siteLinkLists.listReferringDomains, {
    siteId,
    ...(term ? { search: term } : {}),
    ...(status ? { status } : {}),
    ...(follow ? { follow } : {}),
    sort: order.key,
    direction: order.direction,
  });
  // The whole list's length, for what the rows kept are of (sites-data-completeness-plan.md, §4.E).
  const totals = useQuery(api.siteLinks.linkListTotals, { siteId });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Network className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <SiteSees screen="backlinksDomains" seen={table.result?.seen} />
      <ListHeldLine held={!term && !status && !follow ? table.result?.total : undefined} total={totals?.referringDomains} />
      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row.domain}
        onRowClick={(row) => router.push(recordHref({ kind: "domain", domain: row.domain }))}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: tl("statusFilter"), choice: status ? tl(`statuses.${status}`) : null }} value={status} onChange={(value) => setStatus(value as Status | "")}>
              <option value="">{tl("anyStatus")}</option>
              <option value="LIVE">{tl("statuses.LIVE")}</option>
              <option value="LOST">{tl("statuses.LOST")}</option>
            </Select>
            <Select chip={{ label: tl("followFilter"), choice: follow ? tl("nofollow") : null }} value={follow} onChange={(value) => setFollow(value as "NOFOLLOW" | "")}>
              <option value="">{tl("anyFollow")}</option>
              <option value="NOFOLLOW">{tl("nofollow")}</option>
            </Select>
          </>
        }
        cardHeader={<TableBar footer={table.footer} noun="linkingWebsites" actions={<TableDownload siteId={siteId} kind="domains" sort={order.tableSort} />} />}
        empty={{ icon: <Network className="h-8 w-8 text-muted/30" />, label: term || status || follow ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          { key: "domain", header: t("columns.domain"), sortable: true, cell: (row) => <RecordLinkCell href={recordHref({ kind: "domain", domain: row.domain })}>{row.domain}</RecordLinkCell> },
          { key: "rank", header: <span title={t("rankHint")}>{t("columns.rank")}</span>, align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.rank)}</span> },
          { key: "backlinks", header: t("columns.backlinks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.backlinks)}</span> },
          { key: "spam", header: t("columns.spam"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.spamScore)}</span> },
          { key: "firstSeen", header: t("columns.firstSeen"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(row.firstSeen)}</span> },
          { key: "status", header: t("columns.status"), cell: (row) => <LinkStatusLabel status={row.status} /> },
        ]}
      />
    </div>
  );
}
