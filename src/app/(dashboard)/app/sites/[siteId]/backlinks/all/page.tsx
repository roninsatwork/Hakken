"use client";

import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { CheckedCell, ExternalUrlCell, LinkStatusPill } from "../../../_components/SiteCells";
import { formatDay, formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSitePagedTable } from "../../../_components/useSitePagedTable";

type Status = "LIVE" | "NEW" | "LOST";
type Follow = "FOLLOW" | "NOFOLLOW";

/**
 * All backlinks: every website linking here with its strongest link — one
 * per website, as Ahrefs shows by default — searched, filtered and paged on
 * the server, with the search and filters kept in the address.
 */
export default function SiteAllBacklinksPage() {
  const t = useTranslations("sites.backlinksAll");
  const tl = useTranslations("sites.linkLists");
  const siteId = useSiteId();
  const [search, setSearch, term] = useSiteSearch();
  const [status, setStatus] = useSiteParam<Status | "">("status", "", ["LIVE", "NEW", "LOST"]);
  const [follow, setFollow] = useSiteParam<Follow | "">("follow", "", ["FOLLOW", "NOFOLLOW"]);
  const [sort, setSort] = useSiteParam<"rank" | "newest">("sort", "rank", ["rank", "newest"]);
  const table = useSitePagedTable(api.siteLinkLists.listBacklinks, {
    siteId,
    ...(term ? { search: term } : {}),
    ...(status ? { status } : {}),
    ...(follow ? { follow } : {}),
    sort,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Link2 className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={table.isLoading ? undefined : table.rows}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[1200px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={tl("statusFilter")} value={status} onChange={(value) => setStatus(value as Status | "")}>
              <option value="">{tl("anyStatus")}</option>
              {(["LIVE", "NEW", "LOST"] as const).map((entry) => <option key={entry} value={entry}>{tl(`statuses.${entry}`)}</option>)}
            </Select>
            <Select aria-label={tl("followFilter")} value={follow} onChange={(value) => setFollow(value as Follow | "")}>
              <option value="">{tl("anyFollow")}</option>
              <option value="FOLLOW">{tl("follow")}</option>
              <option value="NOFOLLOW">{tl("nofollow")}</option>
            </Select>
            <Select aria-label={tl("sortLabel")} value={sort} onChange={(value) => setSort(value as "rank" | "newest")}>
              <option value="rank">{t("sortRank")}</option>
              <option value="newest">{t("sortNewest")}</option>
            </Select>
            <TableDownload siteId={siteId} kind="backlinks" />
          </>
        }
        empty={{ icon: <Link2 className="h-8 w-8 text-muted/30" />, label: term || status || follow ? t("noMatch") : t("empty") }}
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
          {
            key: "from",
            header: t("columns.from"),
            cell: (row) => (
              <span className="flex max-w-[34ch] flex-col gap-0.5">
                <span className="text-[13px] text-foreground">{row.domainFrom}</span>
                <ExternalUrlCell url={row.urlFrom} />
              </span>
            ),
          },
          {
            key: "anchor",
            header: t("columns.anchor"),
            cell: (row) => (
              <span className="flex max-w-[34ch] flex-col gap-0.5">
                <span className="text-[12px] text-secondary">{row.anchor ?? <span className="text-muted">{t("noAnchor")}</span>}</span>
                <span className="break-all text-[11px] text-muted">→ {row.pageTo}</span>
              </span>
            ),
          },
          {
            key: "follow",
            header: t("columns.follow"),
            cell: (row) => <StatusPill tone={row.dofollow ? "success" : "neutral"}>{row.dofollow ? tl("follow") : tl("nofollow")}</StatusPill>,
          },
          { key: "domainRank", header: t("columns.domainRank"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.domainRank)}</span> },
          { key: "firstSeen", header: t("columns.firstSeen"), cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(row.firstSeen)}</span> },
          { key: "lastSeen", header: t("columns.lastSeen"), cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(row.lastSeen)}</span> },
          { key: "status", header: t("columns.status"), cell: (row) => <LinkStatusPill status={row.status} /> },
          { key: "checked", header: t("columns.lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
