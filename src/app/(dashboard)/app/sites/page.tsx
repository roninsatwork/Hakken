"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { formatDate, formatDateTime } from "@/src/lib/dates";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import { formatDay, formatNumber } from "./_components/siteFormat";
import { sharedSiteQuery, useSiteParam, useSiteSearch } from "./_components/useSiteParam";
import { ListDownload } from "./_components/SiteDownloads";

type Kind = "all" | "OWNED" | "TRACKED";

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
  const rows = sites?.filter((row) =>
    (kind === "all" || row.relationship === kind)
    && (!term || row.host.toLowerCase().includes(term) || (row.ofHost ?? "").toLowerCase().includes(term)));

  // Fifteen rows a page, like every table: a company may hold many sites.
  const paged = usePagedRows(rows ?? [], { canLoadMore: false, loadMore: () => undefined, resetKey: `${term}|${kind}` });

  const dash = <span className="text-muted">–</span>;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader icon={<Globe className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} divider />

        <DataTable
          rows={rows === undefined ? undefined : paged.pageRows}
          rowKey={(row) => row.siteId}
          onRowClick={(row) => router.push(`/app/sites/${row.siteId}${range}`)}
          minWidthClassName="min-w-[980px]"
          search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
          filters={
          <>
            <Select aria-label={t("typeFilter")} value={kind} onChange={(value) => setKind(value as Kind)}>
              <option value="all">{t("allTypes")}</option>
              <option value="OWNED">{t("owned")}</option>
              <option value="TRACKED">{t("competitors")}</option>
            </Select>
            <ListDownload
              fileName={"sites"}
              rows={rows}
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
          </>
        }
          empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: term || kind !== "all" ? t("noMatch") : t("empty") }}
          footer={{
            mode: "paged",
            page: paged.page,
            totalPages: paged.totalPages,
            totalCount: paged.loadedCount,
            pageSize: paged.pageSize,
            isLoading: rows === undefined,
            onPageChange: paged.goToPage,
          }}
          columns={[
            {
              key: "host",
              header: t("columns.website"),
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
              cell: (row) => (row.aiNamed === null || row.aiAsked === null ? dash : t("ofEngines", { named: row.aiNamed, asked: row.aiAsked })),
            },
            { key: "keywords", header: t("columns.keywords"), align: "right", cell: (row) => (row.keywords === null ? dash : formatNumber(row.keywords)) },
            { key: "top3", header: t("columns.top3"), align: "right", cell: (row) => (row.top3 === null ? dash : formatNumber(row.top3)) },
            {
              key: "traffic",
              header: t("columns.traffic"),
              align: "right",
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
              cell: (row) => (row.toDo === 0 ? dash : <span className="text-brand">{row.toDoCapped ? `${row.toDo}+` : row.toDo}</span>),
            },
            {
              key: "checked",
              header: t("columns.checked"),
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
            { key: "added", header: t("columns.added"), cell: (row) => <span className="text-secondary">{formatDate(row.addedAt)}</span> },
          ]}
        />
      </div>
    </>
  );
}
