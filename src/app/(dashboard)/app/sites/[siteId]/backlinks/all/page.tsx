"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { CUT_COLUMN, ExternalUrlCell, LinkStatusPill, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { formatDay, formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";

type Status = "LIVE" | "NEW" | "LOST";
type Follow = "FOLLOW" | "NOFOLLOW";

/**
 * The columns that sort, over every link (docs/plans/active/
 * sites-table-sorting-plan.md): the linking website A to Z, the strongest
 * first, the newest first.
 */
const SORTS = { from: "asc", domainRank: "desc", firstSeen: "desc" } as const;

/**
 * All backlinks: every website linking here with its strongest link — one
 * per website, as Ahrefs shows by default — or every link the site's limit
 * keeps, searched, filtered and paged on the server, with the choice, the
 * search and the filters kept in the address.
 */
export default function SiteAllBacklinksPage() {
  const t = useTranslations("sites.backlinksAll");
  const tl = useTranslations("sites.linkLists");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const [search, setSearch, term] = useSiteSearch();
  const [status, setStatus] = useSiteParam<Status | "">("status", "", ["LIVE", "NEW", "LOST"]);
  const [follow, setFollow] = useSiteParam<Follow | "">("follow", "", ["FOLLOW", "NOFOLLOW"]);
  const order = useSiteSort(SORTS, "domainRank");
  const [links, setLinks] = useSiteParam<"one" | "every">("links", "one", ["one", "every"]);
  const every = links === "every";
  const table = useSiteListPage(api.siteLinkLists.listBacklinks, {
    siteId,
    ...(every ? { every } : {}),
    ...(term ? { search: term } : {}),
    ...(status ? { status } : {}),
    ...(follow ? { follow } : {}),
    sort: order.key,
    direction: order.direction,
  }, every ? [{ siteId, list: "links" }] : []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Link2 className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={every ? t("descriptionEvery") : t("description")}
      />
      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "domain", domain: row.domainFrom }))}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: every ? t("showEvery") : t("showOne") }} aria-label={t("showLabel")} value={links} onChange={(value) => setLinks(value as "one" | "every")}>
              <option value="one">{t("showOne")}</option>
              <option value="every">{t("showEvery")}</option>
            </Select>
            <Select chip={{ label: tl("statusFilter"), choice: status ? tl(`statuses.${status}`) : null }} value={status} onChange={(value) => setStatus(value as Status | "")}>
              <option value="">{tl("anyStatus")}</option>
              {(["LIVE", "NEW", "LOST"] as const).map((entry) => <option key={entry} value={entry}>{tl(`statuses.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: tl("followFilter"), choice: follow === "FOLLOW" ? tl("follow") : follow === "NOFOLLOW" ? tl("nofollow") : null }} value={follow} onChange={(value) => setFollow(value as Follow | "")}>
              <option value="">{tl("anyFollow")}</option>
              <option value="FOLLOW">{tl("follow")}</option>
              <option value="NOFOLLOW">{tl("nofollow")}</option>
            </Select>
          </>
        }
        cardHeader={<SiteTableBar footer={table.footer} noun="links" actions={<TableDownload siteId={siteId} kind={every ? "links" : "backlinks"} sort={order.tableSort} />} />}
        empty={{ icon: <Link2 className="h-8 w-8 text-muted/30" />, label: term || status || follow ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          {
            key: "from",
            header: t("columns.from"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => (
              <span className="flex min-w-0 flex-col gap-0.5">
                <RecordLinkCell cut href={recordHref({ kind: "domain", domain: row.domainFrom })}>{row.domainFrom}</RecordLinkCell>
                <ExternalUrlCell cut url={row.urlFrom} />
              </span>
            ),
          },
          {
            key: "anchor",
            header: t("columns.anchor"),
            className: CUT_COLUMN.second,
            cell: (row) => (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span title={row.anchor ?? undefined} className="truncate text-[12px] text-secondary">{row.anchor ?? <span className="text-muted">{t("noAnchor")}</span>}</span>
                <span title={row.pageTo} className="truncate text-[11px] text-muted">→ {row.pageTo}</span>
              </span>
            ),
          },
          {
            key: "follow",
            header: t("columns.follow"),
            cell: (row) => <StatusPill tone={row.dofollow ? "success" : "neutral"}>{row.dofollow ? tl("follow") : tl("nofollow")}</StatusPill>,
          },
          { key: "domainRank", header: t("columns.domainRank"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.domainRank)}</span> },
          { key: "firstSeen", header: t("columns.firstSeen"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(row.firstSeen)}</span> },
          { key: "status", header: t("columns.status"), cell: (row) => <LinkStatusPill status={row.status} /> },
        ]}
      />
    </div>
  );
}
