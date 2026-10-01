"use client";

import { useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChevronDown, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { formatDate, formatDateTime } from "@/src/lib/dates";
import { cn } from "@/src/ui/lib/utils";
import { formatDay, formatNumber } from "./_components/siteFormat";
import { SiteMark } from "./_components/SiteMark";
import { groupHolds } from "./_components/siteGroups";
import { SiteTableBar } from "./_components/SiteTableBar";
import { sharedSiteQuery, useSiteSearch } from "./_components/useSiteParam";
import { useSitePager } from "./_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "./_components/useSiteSort";
import { ListDownload } from "./_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

type SiteRow = FunctionReturnType<typeof api.sites.listMySites>[number];

/**
 * One line of the list: a website the company owns, a competitor folded out
 * beneath it, or the heading over the competitors watched against none of its
 * websites.
 */
type Line =
  | { kind: "site"; row: SiteRow; competitors: number; unfolded: boolean }
  | { kind: "competitor"; row: SiteRow }
  | { kind: "alone" };

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * website A to Z — the order it opens on — and the most AI mentions,
 * keywords, top-3 places and visits first. The websites are put in that order,
 * and the competitors beneath each in the same order.
 */
const SORTS: SiteSortColumns<SiteRow, "host" | "ai" | "keywords" | "top3" | "traffic"> = {
  host: { value: (row) => row.host, first: "asc" },
  ai: { value: (row) => row.aiNamed, first: "desc" },
  keywords: { value: (row) => row.keywords, first: "desc" },
  top3: { value: (row) => row.top3, first: "desc" },
  traffic: { value: (row) => row.estimatedTraffic, first: "desc" },
};
const hostOf = (row: SiteRow) => row.host;
const ownedFirst = (row: SiteRow) => (row.relationship === "OWNED" ? 0 : 1);

const lineKey = (line: Line) => (line.kind === "alone" ? "alone" : `${line.kind}-${line.row.siteId}`);

/**
 * "Your sites" (docs/plans/active/sites-website-switcher-plan.md, W1): each
 * website the company owns, with where it is watched from, how often it is
 * checked and when it last was, and the competitors measured against it folded
 * beneath it — all of them, once unfolded (Anthony, 2026-10-01); the competitors watched against none of them come last, on
 * their own. Opening any of them gives the same pages, drawn for that site (D17).
 *
 * A company holds a handful of websites — capped on the server — so the list
 * arrives whole and the search box narrows it in place, unfolding every
 * website with a competitor that matches; the big tables inside a site are
 * the ones searched on the server (D15).
 */
export default function SitesPage() {
  const t = useTranslations("sites.list");
  const router = useRouter();
  const params = useSearchParams();
  const sites = useQuery(api.sites.listMySites, {});
  const [search, setSearch, settled] = useSiteSearch();
  // A company with one website sees its competitors without asking.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string> | null>(null);

  // Into a site go the dates only: this list's own search is not the site pages'.
  const range = sharedSiteQuery(params);
  const matches = wordStartMatcher(settled.toLowerCase());

  const { rows: sorted, tableSort } = useSiteSortedList(sites, SORTS, { opening: "host", name: hostOf, group: ownedFirst });

  const { groups, alone } = groupHolds(sorted ?? []);
  const isUnfolded = (siteId: string) => (unfolded ?? new Set<string>(groups.length === 1 ? [groups[0].owner.siteId] : [])).has(siteId);
  const toggle = (siteId: string) => {
    const next = new Set<string>(groups.filter(({ owner }) => isUnfolded(owner.siteId)).map(({ owner }) => owner.siteId));
    if (next.has(siteId)) next.delete(siteId);
    else next.add(siteId);
    setUnfolded(next);
  };

  const lines: Line[] | undefined = sorted === undefined ? undefined : [
    ...groups.flatMap(({ owner, competitors }): Line[] => {
      const found = matches ? competitors.filter((rival) => matches(rival.host)) : competitors;
      if (matches && !matches(owner.host) && found.length === 0) return [];
      const open = matches ? found.length > 0 : isUnfolded(owner.siteId);
      return [
        { kind: "site", row: owner, competitors: competitors.length, unfolded: open },
        ...(open ? found : []).map((row): Line => ({ kind: "competitor", row })),
      ];
    }),
    ...((): Line[] => {
      const found = matches ? alone.filter((rival) => matches(rival.host)) : alone;
      return found.length > 0 ? [{ kind: "alone" }, ...found.map((row): Line => ({ kind: "competitor", row }))] : [];
    })(),
  ];

  // Paged like every Sites table: a company may hold many sites.
  const paged = useSitePager(lines, { isLoading: lines === undefined });

  const dash = <span className="text-muted">–</span>;
  const figure = (render: (row: SiteRow) => ReactNode) => (line: Line) =>
    line.kind === "site" || line.kind === "competitor" ? render(line.row) : null;

  // Where the website is watched from, how often it is checked, and when it last was.
  const aboutSite = (row: SiteRow) => {
    const cadence = row.cadence ? t(`cadence.${row.cadence}`) : null;
    if (row.lastCheckedAt || row.lastCheckedDay) {
      const day = row.lastCheckedAt ? formatDate(row.lastCheckedAt) : formatDay(row.lastCheckedDay ?? "");
      return cadence ? t("aboutChecked", { place: row.placeLabel, cadence, day }) : t("aboutCheckedOnce", { place: row.placeLabel, day });
    }
    if (row.nextRunAt) return t("aboutFirst", { place: row.placeLabel, when: formatDateTime(row.nextRunAt) });
    return t("aboutNotChecked", { place: row.placeLabel });
  };

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader icon={<Globe className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} divider />

        <DataTable
          rows={paged.pageRows}
          rowKey={lineKey}
          onRowClick={(line) => {
            if (line.kind === "site" || line.kind === "competitor") router.push(`/app/sites/${line.row.siteId}${range}`);
          }}
          rowClickable={(line) => line.kind === "site" || line.kind === "competitor"}
          rowClassName={(line) => (line.kind === "competitor" ? "bg-foreground/[0.015]" : "")}
          minWidthClassName="min-w-[1040px]"
          search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
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
                    { header: t("columns.of"), value: (row) => row.ofHost },
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
          empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch") : t("empty") }}
          footer={paged.footer}
          sort={tableSort}
          columns={[
            {
              key: "host",
              header: t("columns.website"),
              sortable: true,
              cell: (line) => {
                if (line.kind === "alone") {
                  return <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">{t("alone")}</span>;
                }
                if (line.kind === "competitor") {
                  return (
                    <span className="flex min-w-0 items-center gap-2.5 pl-11">
                      <SiteMark host={line.row.host} owned={false} small />
                      <span className="truncate text-foreground/90">{line.row.host}</span>
                    </span>
                  );
                }
                return (
                  <span className="flex min-w-0 items-center gap-3">
                    <SiteMark host={line.row.host} owned />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium text-foreground">{line.row.host}</span>
                      <span className="text-[12px] text-secondary">{aboutSite(line.row)}</span>
                    </span>
                  </span>
                );
              },
            },
            {
              key: "ai",
              header: t("columns.aiMentions"),
              align: "right",
              sortable: true,
              cell: figure((row) => (row.aiNamed === null || row.aiAsked === null ? dash : t("ofEngines", { named: row.aiNamed, asked: row.aiAsked }))),
            },
            { key: "keywords", header: t("columns.keywords"), align: "right", sortable: true, cell: figure((row) => (row.keywords === null ? dash : formatNumber(row.keywords))) },
            { key: "top3", header: t("columns.top3"), align: "right", sortable: true, cell: figure((row) => (row.top3 === null ? dash : formatNumber(row.top3))) },
            {
              key: "traffic",
              header: t("columns.traffic"),
              align: "right",
              sortable: true,
              cell: figure((row) => (row.estimatedTraffic === null ? dash : formatNumber(row.estimatedTraffic))),
            },
            {
              key: "moved",
              header: t("columns.moved"),
              cell: figure((row) =>
                row.rankedUp === null && row.rankedDown === null ? dash : (
                  <span className="flex flex-col text-[12px]">
                    <span>
                      <span className="text-success">▲ {row.rankedUp ?? 0}</span>
                      <span className="text-muted"> · </span>
                      <span className="text-destructive">▼ {row.rankedDown ?? 0}</span>
                    </span>
                    {row.movesAmongHeld !== null ? <span className="text-[11px] text-muted">{t("amongHeld", { count: formatNumber(row.movesAmongHeld) })}</span> : null}
                  </span>
                )),
            },
            {
              key: "competitors",
              header: t("columns.competitors"),
              cell: (line) =>
                line.kind !== "site" ? null : line.competitors === 0 ? dash : (
                  <span className="text-secondary">{t("competitorCount", { count: line.competitors })}</span>
                ),
            },
            {
              // The fold, at the end of the row (Anthony, 2026-10-01): the row opens the website.
              key: "fold",
              align: "right",
              cell: (line) =>
                line.kind !== "site" || line.competitors === 0 ? null : (
                  <Button
                    variant="icon"
                    aria-expanded={line.unfolded}
                    aria-label={t(line.unfolded ? "hideCompetitors" : "showCompetitors", { host: line.row.host })}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(line.row.siteId);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[8px]"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", line.unfolded && "rotate-180")} aria-hidden="true" />
                  </Button>
                ),
            },
          ]}
        />
      </div>
    </>
  );
}
