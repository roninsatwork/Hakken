"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { CUT_COLUMN, ExternalUrlCell, LinkStatusLabel, RecordLinkCell } from "../../../_components/SiteCells";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { formatDay, formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSetSiteParams, useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";
import { ListHeldLine } from "../../../_components/SiteCoverage";
import { Notice } from "@/src/ui/components/screens/Notice";
import { readLinkGroup, useLinkGroupName } from "../_components/linkGroups";
import { CompetitorNotCollected, useIsCompetitor } from "../../../_components/CompetitorNotCollected";

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
  const competitor = useIsCompetitor();
  const tl = useTranslations("sites.linkLists");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const [search, setSearch, term] = useSiteSearch();
  const [status, setStatus] = useSiteParam<Status | "">("status", "", ["LIVE", "NEW", "LOST"]);
  const [follow, setFollow] = useSiteParam<Follow | "">("follow", "", ["FOLLOW", "NOFOLLOW"]);
  const order = useSiteSort(SORTS, "domainRank");
  const [links, setLinks] = useSiteParam<"one" | "every">("links", "one", ["one", "every"]);
  // Opened from Where links come from (a group) or New and lost links (a stretch of days):
  // both narrow the strongest link from each website (discovery-detail-and-hakken-sees-plan.md §5).
  const [group, setGroup] = useSiteParam<string>("group", "");
  const [changedFrom] = useSiteParam<string>("changedFrom", "");
  const [changedUntil] = useSiteParam<string>("changedUntil", "");
  const setParams = useSetSiteParams();
  const groupName = useLinkGroupName();
  const chosenGroup = group ? readLinkGroup(group) : null;
  const changed = Boolean(changedFrom && changedUntil);
  // The stretch's last day: its end is the day after (`changedUntil`).
  const lastDay = changed ? new Date(Date.parse(`${changedUntil}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : "";
  const narrowed = Boolean(chosenGroup) || changed;
  const every = links === "every" && !narrowed;
  const table = useSiteListPage(api.siteLinkLists.listBacklinks, {
    siteId,
    ...(every ? { every } : {}),
    ...(chosenGroup ? { group } : {}),
    ...(changed ? { changedFrom, changedUntil } : {}),
    ...(term ? { search: term } : {}),
    ...(status ? { status } : {}),
    ...(follow ? { follow } : {}),
    sort: order.key,
    direction: order.direction,
  }, every ? [{ siteId, list: "links" }] : []);
  // The whole list's length, for what the rows kept are of (sites-data-completeness-plan.md, §4.E).
  const totals = useQuery(api.siteLinks.linkListTotals, { siteId });

  // Bought for a company's own websites only (finish-off plan, items 6b, 6c and 14).
  if (competitor) {
    return (
      <CompetitorNotCollected
        icon={<Link2 className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description")}
        notice={t("competitor")}
        tab="backlinks/all"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Link2 className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={every ? t("descriptionEvery") : t("description")}
      />
      {narrowed ? <Notice>{t("narrowedNotice")}</Notice> : <ListHeldLine held={!term && !status && !follow ? table.result?.total : undefined} total={totals?.[every ? "backlinks" : "oneEach"]} />}
      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "domain", domain: row.domainFrom }))}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            {narrowed ? null : (
              <Select chip={{ label: every ? t("showEvery") : t("showOne") }} aria-label={t("showLabel")} value={links} onChange={(value) => setLinks(value as "one" | "every")}>
                <option value="one">{t("showOne")}</option>
                <option value="every">{t("showEvery")}</option>
              </Select>
            )}
            {chosenGroup ? (
              <Select chip={{ label: t(`groupFilters.${chosenGroup.breakdown}`), choice: groupName(chosenGroup.breakdown, chosenGroup.key) }} aria-label={t(`groupFilters.${chosenGroup.breakdown}`)} value={group} onChange={(value) => setGroup(value)}>
                <option value={group}>{groupName(chosenGroup.breakdown, chosenGroup.key)}</option>
                <option value="">{t("everyGroup")}</option>
              </Select>
            ) : null}
            {changed ? (
              <Select chip={{ label: t("changedFilter"), choice: t("changedRange", { from: formatDay(changedFrom), until: formatDay(lastDay) }) }} aria-label={t("changedFilter")} value="chosen" onChange={() => setParams({ changedFrom: null, changedUntil: null })}>
                <option value="chosen">{t("changedRange", { from: formatDay(changedFrom), until: formatDay(lastDay) })}</option>
                <option value="">{t("anyTime")}</option>
              </Select>
            ) : null}
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
        cardHeader={<TableBar footer={table.footer} noun="links" actions={<TableDownload siteId={siteId} kind={every ? "links" : "backlinks"} sort={order.tableSort} />} />}
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
            cell: (row) => <StatusLabel tone={row.dofollow ? "success" : "neutral"}>{row.dofollow ? tl("follow") : tl("nofollow")}</StatusLabel>,
          },
          { key: "domainRank", header: t("columns.domainRank"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.domainRank)}</span> },
          { key: "firstSeen", header: t("columns.firstSeen"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(row.firstSeen)}</span> },
          { key: "status", header: t("columns.status"), cell: (row) => <LinkStatusLabel status={row.status} /> },
        ]}
      />
    </div>
  );
}
