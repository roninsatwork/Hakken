"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Puzzle } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable, type DataTableColumn, type DataTableHeaderGroup } from "@/src/ui/components/screens/DataTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { IntentLabel, RecordLinkCell } from "../../../_components/SiteCells";
import { heldIcon } from "../../../_components/siteGroups";
import { MarkedHost } from "../../../_components/SiteMark";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { formatNumber, formatVisits } from "../../../_components/siteFormat";
import { useSiteListHref, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { SiteSees } from "../../../_components/SiteSees";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";

const INTENTS = ["BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER", "UNJUDGED"] as const;
type Intent = (typeof INTENTS)[number];

type GapRow = FunctionReturnType<typeof api.siteCompetitors.listContentGap>["rows"][number];
type RivalColumn = "position" | "traffic";

/**
 * The columns that sort, over every gap (docs/plans/active/
 * sites-table-sorting-plan.md): the search A to Z, the most searched and the
 * easiest first; and each competitor's Position, the top first, and Traffic,
 * the most first, a search it does not rank for last either way.
 */
const SEARCH_SORTS = { keyword: "asc", volume: "desc", kd: "asc" } as const;
const RIVAL_FIRSTS: Record<RivalColumn, "asc" | "desc"> = { position: "asc", traffic: "desc" };

/** A competitor's column: which one, and whose — by its Sites page, as the address keeps it. */
const rivalKey = (column: RivalColumn, siteId: string) => `${column}:${siteId}`;

const numberCell = (value: string, strong = false) => (
  <span className={`font-mono text-[12px] ${strong ? "text-foreground" : "text-secondary"}`}>{value}</span>
);
const blank = <NoFigure />;

/**
 * Content gap: searches the other websites in the group rank for and this one
 * does not, most searched first unless a heading asks otherwise — laid out as
 * Ahrefs lays out its content gap, organic search only (Anthony, 2026-09-30:
 * "I prefer the layout of ahrefs … only organic search"; drawn, then "yes
 * please build it"; docs/plans/active/content-gap-ahrefs-layout-plan.md).
 * The search, what it is for, its volume and difficulty — its cost per click
 * and its page's features were taken off the same day — then a Position and
 * Traffic pair per competitor,
 * the keyword kept in place as the table scrolls sideways. Worked out when
 * read from the keyword lists kept for the website and its competitors, then
 * searched, filtered, sorted and paged on the server. For the company's own
 * websites only (Anthony, 2026-10-06): on a competitor the page says so and
 * leads to the website it is measured against, as Your pages does.
 */
export default function SiteContentGapPage() {
  const router = useRouter();
  const t = useTranslations("sites.gap");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const recordHref = useSiteRecordHref(siteId);
  const listHref = useSiteListHref(siteId);
  const site = useSite();
  const [search, setSearch, settled] = useSiteSearch();
  const [intent, setIntent] = useSiteParam<Intent | "">("intent", "", INTENTS);
  const [rivalsText, setRivalsText] = useSiteParam<string>("rivals", "1");
  const minRivals = Math.max(1, Number(rivalsText) || 1);
  // Every competitor's pair sorts, named from the site's own list of them, so
  // an address sorted by one opens in that order at once.
  const firsts = useMemo<Record<string, "asc" | "desc">>(() => ({
    ...SEARCH_SORTS,
    ...Object.fromEntries((site?.rivals ?? []).flatMap((rival) =>
      (Object.keys(RIVAL_FIRSTS) as RivalColumn[]).map((column) => [rivalKey(column, rival.siteId), RIVAL_FIRSTS[column]]))),
  }), [site?.rivals]);
  const order = useSiteSort<string>(firsts, "volume");
  const [column, rivalId] = order.key.split(":");
  const table = useSiteListPage(api.siteCompetitors.listContentGap, {
    siteId,
    ...(settled ? { search: settled } : {}),
    ...(intent ? { intent } : {}),
    ...(minRivals > 1 ? { minRivals } : {}),
    sort: column as keyof typeof SEARCH_SORTS | RivalColumn,
    ...(rivalId ? { rivalId: rivalId as Id<"companyWebsites"> } : {}),
    direction: order.direction,
  }, [{ siteId, list: "gap" }]);
  const competitors = table.result?.competitors ?? [];
  const most = Math.max(1, site?.rivals.length ?? 1);

  if (site?.relationship === "TRACKED") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader icon={<Puzzle className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
        <Notice
          action={site.ofSiteId && site.ofHost ? (
            <Link href={`/app/sites/${site.ofSiteId}/competitors/gap`} className="text-[12.5px] text-info hover:underline">
              {t("notices.competitorLink", { host: site.ofHost })}
            </Link>
          ) : undefined}
        >
          {t("notices.competitor")}
        </Notice>
      </div>
    );
  }

  const hinted = (key: "volume" | "kd" | "position" | "traffic") => (
    <span title={t(`hints.${key}`)}>{t(`columns.${key}`)}</span>
  );
  const columns: DataTableColumn<GapRow>[] = [
    // A set width, cut short with "…": a share of the width (`CUT_COLUMN`) is
    // nothing in a table wider than the screen, which this one is by design.
    { key: "keyword", header: t("columns.keyword"), sortable: true, className: "w-[220px] min-w-[220px] max-w-[220px]", cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
    { key: "intent", header: t("columns.intent"), className: "whitespace-nowrap", cell: (row) => <IntentLabel intent={row.intent} /> },
    { key: "volume", header: hinted("volume"), align: "right", sortable: true, className: "whitespace-nowrap", cell: (row) => numberCell(formatNumber(row.volume), true) },
    { key: "kd", header: hinted("kd"), align: "right", sortable: true, className: "whitespace-nowrap", cell: (row) => numberCell(formatNumber(row.difficulty)) },
    ...competitors.flatMap((rival): DataTableColumn<GapRow>[] => {
      const ranking = (row: GapRow) => row.rivals.find((entry) => entry.websiteId === rival.websiteId);
      return [
        {
          key: rivalKey("position", rival.siteId),
          header: hinted("position"),
          align: "right",
          sortable: true,
          className: "whitespace-nowrap border-l border-border-dim",
          // Tinted where the competitor ranks, as Ahrefs tints it: the rows it is in stand out down its column.
          cellClassName: (row) => (ranking(row) ? "bg-info/10" : ""),
          cell: (row) => {
            const found = ranking(row);
            return found ? <span className="font-mono text-[13px] text-foreground">{found.position}</span> : blank;
          },
        },
        {
          key: rivalKey("traffic", rival.siteId),
          header: hinted("traffic"),
          align: "right",
          sortable: true,
          className: "whitespace-nowrap",
          cell: (row) => {
            const found = ranking(row);
            return found ? numberCell(formatVisits(found.traffic), true) : blank;
          },
        },
      ];
    }),
  ];
  // The website each pair is for, over its two headings, opening its own pages.
  const headerGroups: DataTableHeaderGroup[] | undefined = competitors.length > 0
    ? [
      { key: "keyword", span: 1 },
      { key: "search", span: 3 },
      ...competitors.map((rival) => ({
        key: rival.siteId,
        span: 2,
        className: "border-l border-border-dim",
        label: (
          <span title={t("hints.competitor", { host: rival.host })}>
            <MarkedHost host={rival.host} iconUrl={heldIcon(site?.holds, { siteId: rival.siteId })} owned={false}>
              <RecordLinkCell href={listHref("", {}, rival.siteId)} className="text-[13px] font-medium text-foreground">{rival.host}</RecordLinkCell>
            </MarkedHost>
          </span>
        ),
      })),
    ]
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Puzzle className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description")}
        pills={<span className="text-[12px] text-secondary">{t("ceiling")}</span>}
      />
      <SiteSees screen="competitorsGap" seen={table.result?.seen} />
      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row.keyword}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        minWidthClassName="min-w-[1100px]"
        stickyFirstColumn
        headerGroups={headerGroups}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: tc("intentFilter"), choice: intent ? tc(`intents.${intent}`) : null }} value={intent} onChange={(value) => setIntent(value as Intent | "")}>
              <option value="">{tc("anyIntent")}</option>
              {INTENTS.map((entry) => <option key={entry} value={entry}>{tc(`intents.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: t("rivalsFilter"), choice: minRivals > 1 ? t("atLeast", { count: minRivals }) : null }} value={String(minRivals)} onChange={(value) => setRivalsText(value)}>
              <option value="1">{t("anyRivals")}</option>
              {Array.from({ length: most - 1 }, (_, index) => index + 2).map((count) => (
                <option key={count} value={count}>{t("atLeast", { count })}</option>
              ))}
            </Select>
          </>
        }
        cardHeader={<TableBar footer={table.footer} noun="keywords" actions={<TableDownload siteId={siteId} kind="gap" sort={order.tableSort} />} />}
        empty={{ icon: <Puzzle className="h-8 w-8 text-muted/30" />, label: settled || intent || minRivals > 1 ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={columns}
      />
    </div>
  );
}
