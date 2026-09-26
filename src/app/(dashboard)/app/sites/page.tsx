"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { formatDate, formatDateTime } from "@/src/lib/dates";
import { formatDay, formatNumber } from "./_components/siteFormat";
import { SiteTableBar } from "./_components/SiteTableBar";
import { sharedSiteQuery, useSiteParam, useSiteSearch } from "./_components/useSiteParam";
import { useSitePager } from "./_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "./_components/useSiteSort";
import { ListDownload } from "./_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

type Kind = "all" | "OWNED" | "TRACKED";
type SiteRow = FunctionReturnType<typeof api.sites.listMySites>[number];

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * website A to Z — the order it opens on — and the most AI mentions,
 * keywords, top-3 places, visits and things to do, and the newest checked and
 * added, first. The company's own websites stay above its competitors in
 * every order, as they always have; the type filter shows either alone.
 */
const SORTS: SiteSortColumns<SiteRow, "host" | "ai" | "keywords" | "top3" | "traffic" | "todo" | "checked" | "added"> = {
  host: { value: (row) => row.host, first: "asc" },
  ai: { value: (row) => row.aiNamed, first: "desc" },
  keywords: { value: (row) => row.keywords, first: "desc" },
  top3: { value: (row) => row.top3, first: "desc" },
  traffic: { value: (row) => row.estimatedTraffic, first: "desc" },
  todo: { value: (row) => row.toDo, first: "desc" },
  checked: { value: (row) => row.lastCheckedAt ?? (row.lastCheckedDay ? Date.parse(`${row.lastCheckedDay}T00:00:00Z`) : null), first: "desc" },
  added: { value: (row) => row.addedAt, first: "desc" },
};
const hostOf = (row: SiteRow) => row.host;
const ownedFirst = (row: SiteRow) => (row.relationship === "OWNED" ? 0 : 1);

/**
 * Every website the company holds, owned and watched alike (D17), one row
 * each, owned first. Opening any of them gives the same pages, drawn for that
 * site.
 *
 * A company holds a handful of websites — capped on the server — so the list
 * arrives whole and the search box and type filter narrow it in place; the
 * big tables inside a site are the ones searched on the server (D15).
 */
export default function SitesPage() {
  const t = useTranslations("sites.list");
  const router = useRouter();
  const params = useSearchParams();
  const sites = useQuery(api.sites.listMySites, {});
  const [search, setSearch, settled] = useSiteSearch();
  const [kind, setKind] = useSiteParam<Kind>("type", "all", ["all", "OWNED", "TRACKED"]);

  // Into a site go the dates only: this list's own search and type filter
  // are not the site pages' (a "type" there is a kind of page).
  const range = sharedSiteQuery(params);
  const term = settled.toLowerCase();
  const matches = wordStartMatcher(term);
  const rows = sites?.filter((row) =>
    (kind === "all" || row.relationship === kind)
    && (!matches || matches(row.host, row.ofHost)));

  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "host", name: hostOf, group: ownedFirst });

  // Paged like every Sites table: a company may hold many sites.
  const paged = useSitePager(sorted, { isLoading: sorted === undefined });

  const dash = <span className="text-muted">–</span>;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader icon={<Globe className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} divider />

        <DataTable
          rows={paged.pageRows}
          rowKey={(row) => row.siteId}
          onRowClick={(row) => router.push(`/app/sites/${row.siteId}${range}`)}
          minWidthClassName="min-w-[980px]"
          search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
          filters={
            <Select chip={{ label: t("typeFilter"), choice: kind === "all" ? null : kind === "OWNED" ? t("owned") : t("competitors") }} value={kind} onChange={(value) => setKind(value as Kind)}>
              <option value="all">{t("allTypes")}</option>
              <option value="OWNED">{t("owned")}</option>
              <option value="TRACKED">{t("competitors")}</option>
            </Select>
          }
          cardHeader={
            <SiteTableBar
              footer={paged.footer}
              noun="websites"
              actions={
                <ListDownload
                  fileName={"sites"}
                  rows={sorted}
                  columns={[
                    { header: t("columns.website"), value: (row) => row.host },
                    { header: t("columns.type"), value: (row) => (row.relationship === "OWNED" ? t("owned") : t("competitor")) },
                    {
                      header: t("columns.aiMentions"),
                      value: (row) => (row.aiNamed === null || row.aiAsked === null ? null : t("ofEngines", { named: row.aiNamed, asked: row.aiAsked })),
                    },
                    { header: t("columns.keywords"), value: (row) => row.keywords },
                    { header: t("columns.top3"), value: (row) => row.top3 },
                    { header: t("columns.traffic"), value: (row) => row.estimatedTraffic },
                    {
                      header: t("columns.moved"),
                      value: (row) => (row.rankedUp === null && row.rankedDown === null ? null : `▲ ${row.rankedUp ?? 0} · ▼ ${row.rankedDown ?? 0}`),
                    },
                    { header: t("columns.toDo"), value: (row) => (row.toDoCapped ? `${row.toDo}+` : row.toDo) },
                    { header: t("columns.checked"), value: (row) => row.lastCheckedDay },
                    { header: t("columns.added"), value: (row) => new Date(row.addedAt).toISOString().slice(0, 10) },
                  ]}
                />
              }
            />
          }
          empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: term || kind !== "all" ? t("noMatch") : t("empty") }}
          footer={paged.footer}
          sort={tableSort}
          columns={[
            {
              key: "host",
              header: t("columns.website"),
              sortable: true,
              cell: (row) => <span className="font-medium text-foreground">{row.host}</span>,
            },
            {
              key: "type",
              header: t("columns.type"),
              cell: (row) => (
                <div className="flex flex-col gap-1">
                  <StatusPill tone={row.relationship === "OWNED" ? "info" : "neutral"}>
                    {row.relationship === "OWNED" ? t("owned") : t("competitor")}
                  </StatusPill>
                  {row.ofHost ? <span className="text-[12px] text-secondary">{t("of", { host: row.ofHost })}</span> : null}
                </div>
              ),
            },
            {
              key: "ai",
              header: t("columns.aiMentions"),
              align: "right",
              sortable: true,
              cell: (row) => (row.aiNamed === null || row.aiAsked === null ? dash : t("ofEngines", { named: row.aiNamed, asked: row.aiAsked })),
            },
            { key: "keywords", header: t("columns.keywords"), align: "right", sortable: true, cell: (row) => (row.keywords === null ? dash : formatNumber(row.keywords)) },
            { key: "top3", header: t("columns.top3"), align: "right", sortable: true, cell: (row) => (row.top3 === null ? dash : formatNumber(row.top3)) },
            {
              key: "traffic",
              header: t("columns.traffic"),
              align: "right",
              sortable: true,
              cell: (row) => (row.estimatedTraffic === null ? dash : formatNumber(row.estimatedTraffic)),
            },
            {
              key: "moved",
              header: t("columns.moved"),
              cell: (row) =>
                row.rankedUp === null && row.rankedDown === null ? dash : (
                  <span className="text-[12px]">
                    <span className="text-success">▲ {row.rankedUp ?? 0}</span>
                    <span className="text-muted"> · </span>
                    <span className="text-destructive">▼ {row.rankedDown ?? 0}</span>
                  </span>
                ),
            },
            {
              key: "todo",
              header: t("columns.toDo"),
              align: "right",
              sortable: true,
              cell: (row) => (row.toDo === 0 ? dash : <span className="text-brand">{row.toDoCapped ? `${row.toDo}+` : row.toDo}</span>),
            },
            {
              key: "checked",
              header: t("columns.checked"),
              sortable: true,
              cell: (row) =>
                row.lastCheckedAt ? (
                  <span className="text-secondary">{formatDateTime(row.lastCheckedAt)}</span>
                ) : row.lastCheckedDay ? (
                  <span className="text-secondary">{formatDay(row.lastCheckedDay)}</span>
                ) : row.nextRunAt ? (
                  <span className="text-secondary">{t("firstCheck", { when: formatDateTime(row.nextRunAt) })}</span>
                ) : (
                  <span className="text-muted">{t("notChecked")}</span>
                ),
            },
            { key: "added", header: t("columns.added"), sortable: true, cell: (row) => <span className="text-secondary">{formatDate(row.addedAt)}</span> },
          ]}
        />
      </div>
    </>
  );
}
