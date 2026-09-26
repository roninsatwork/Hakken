"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { CompareControl } from "../../_components/CompareControl";
import { ChangeCell, PageLinkCell, PositionCell, RecordLinkCell } from "../../_components/SiteCells";
import { SiteTableBar } from "../../_components/SiteTableBar";
import { SiteChartCard } from "../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteStackedAreaChart } from "../../_components/SiteCharts";
import { useSiteRange } from "../../_components/SiteDateRange";
import { formatCpc, formatDay, formatNumber, formatShortDay, toCsv } from "../../_components/siteFormat";
import { useSiteRecordHref } from "../../_components/siteRecordLinks";
import { useCompareDay, useSite, useSiteId } from "../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../_components/useSiteParam";
import { useSiteSort } from "../../_components/useSiteSort";
import { TableDownload } from "../../_components/SiteDownloads";
import { useSiteListPage } from "../../_components/useSitePagedTable";

const BANDS = ["p01_03", "p04_10", "p11_20", "p21_50", "p51_up"] as const;
const INTENTS = ["BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER", "UNJUDGED"] as const;
/** The movements, and the searches still held from an older check (T9): "OLDER" is not a movement, and asks for those. */
const STATUSES = ["NEW", "UP", "DOWN", "SAME", "LOST", "OLDER"] as const;
const KD_BANDS = ["kd00_10", "kd11_30", "kd31_70", "kd71_100"] as const;
/**
 * The columns whose headings order the list — the whole list, on the server
 * (docs/plans/active/sites-table-sorting-plan.md) — each with its first
 * press: the keyword A to Z, position from the top, the biggest rise, most
 * searched, dearest clicks, most visits. Change gives way to "On {day}" when
 * a day is compared, which is fetched for the rows on screen only and so
 * cannot order the list; Last seen is only in the view that shows it.
 */
const SORTS = { keyword: "asc", position: "asc", change: "desc", volume: "desc", cpc: "desc", traffic: "desc" } as const;
const SORTS_COMPARED = { keyword: "asc", position: "asc", volume: "desc", cpc: "desc", traffic: "desc" } as const;
const SORTS_OLDER = { ...SORTS, lastSeen: "desc" } as const;

type Band = (typeof BANDS)[number];
type Intent = (typeof INTENTS)[number];
type Status = (typeof STATUSES)[number];
type KdBand = (typeof KD_BANDS)[number];

/**
 * Every search the site ranks for (Organic search › Keywords).
 *
 * Searched, filtered, sorted and counted on the server (D14, D15), from the
 * site's compact keyword copy (docs/plans/active/sites-table-pages-plan.md
 * §5.2): the footer shows the exact total and opens any page. The searches
 * the latest check found, unless "Not in the latest check" asks for those
 * still held from an older one (T9). The "compare with" column fetches the
 * chosen day's position for the rows on screen only. The chart above is the
 * position bands over the dates chosen.
 *
 * Seven columns, the ones a reader decides on, so the table fits a 13-inch
 * screen; each row opens the keyword's own screen, with everything else we
 * keep about it (docs/plans/active/sites-ux-updates-plan.md §3).
 *
 * Laid out like Ahrefs' Organic keywords (Anthony, 2026-09-26): the search
 * box and four compact filters on one row; the count, the comparison and the
 * download in the table's own top bar; and the order chosen by pressing a
 * heading — its best first, then the other way — in place of a sort dropdown.
 */
export default function SiteKeywordsPage() {
  const t = useTranslations("sites.keywords");
  const tc = useTranslations("sites.common");
  const to = useTranslations("sites.overview");
  const tb = useTranslations("sites.overview.bands");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const compareDay = useCompareDay();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);

  const [search, setSearch, term] = useSiteSearch();
  const [band, setBand] = useSiteParam<Band | "">("band", "", BANDS);
  const [intent, setIntent] = useSiteParam<Intent | "">("intent", "", INTENTS);
  const [status, setStatus] = useSiteParam<Status | "">("status", "", STATUSES);
  const [kdBand, setKdBand] = useSiteParam<KdBand | "">("kd", "", KD_BANDS);
  const order = useSiteSort<keyof typeof SORTS_OLDER>(status === "OLDER" ? SORTS_OLDER : compareDay ? SORTS_COMPARED : SORTS, "position");

  const table = useSiteListPage(api.siteKeywords.listKeywords, {
    siteId,
    ...(term ? { search: term } : {}),
    ...(band ? { band } : {}),
    ...(intent ? { intent } : {}),
    ...(status === "OLDER" ? { older: true } : status ? { status } : {}),
    ...(kdBand ? { kdBand } : {}),
    sort: order.key,
    direction: order.direction,
  }, [{ siteId, list: "keywords" }]);
  const shownRows = table.pageRows ?? [];
  const compared = useQuery(
    api.siteKeywords.keywordsOnDay,
    compareDay && shownRows.length > 0 ? { siteId, day: compareDay, keywords: shownRows.map((row) => row.keyword) } : "skip",
  );
  const onDay = new Map((compared ?? []).map((row) => [row.keyword, row.position]));

  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  // DataForSEO's bands over everything the site ranks for where it has them.
  const points = (series?.[0]?.points ?? []).flatMap((point) => {
    const bands = point.allBands ?? point.bands;
    return bands ? [{ day: point.day, bands }] : [];
  });
  const filtered = Boolean(term || band || intent || status || kdBand);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<KeyRound className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description")}
        pills={
          site?.counts.keywords !== null && site?.counts.keywordsStored !== null && site?.counts.keywords !== undefined
            ? <span className="text-[12px] text-secondary">{t("listing", { stored: formatNumber(site.counts.keywordsStored), total: formatNumber(site.counts.keywords) })}</span>
            : null
        }
      />

      <SiteChartCard
        title={to("positions")}
        hint={to("positionsHint")}
        exportName={`${site?.host ?? "site"}-keywords-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", ...BANDS.map((entry) => tb(entry))], points.map((point) => [point.day, ...BANDS.map((entry) => point.bands?.[entry] ?? null)]))}
        enoughData={points.length > 0}
      >
        <SiteStackedAreaChart
          data={points.map((point) => ({ label: formatShortDay(point.day), ...point.bands }))}
          series={BANDS.map((entry, index) => ({ key: entry, name: tb(entry), colour: SITE_SERIES_COLOURS[index] }))}
        />
      </SiteChartCard>

      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        minWidthClassName="min-w-[800px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("bandFilter"), choice: band ? tb(band) : null }} value={band} onChange={(value) => setBand(value as Band | "")}>
              <option value="">{t("anyBand")}</option>
              {BANDS.map((entry) => <option key={entry} value={entry}>{tb(entry)}</option>)}
            </Select>
            <Select chip={{ label: tc("intentFilter"), choice: intent ? tc(`intents.${intent}`) : null }} value={intent} onChange={(value) => setIntent(value as Intent | "")}>
              <option value="">{tc("anyIntent")}</option>
              {INTENTS.map((entry) => <option key={entry} value={entry}>{tc(`intents.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: t("statusFilter"), choice: status ? t(`statuses.${status}`) : null }} value={status} onChange={(value) => setStatus(value as Status | "")}>
              <option value="">{t("anyStatus")}</option>
              {STATUSES.map((entry) => <option key={entry} value={entry}>{t(`statuses.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: t("kdFilter"), choice: kdBand ? t(`kdBands.${kdBand}`) : null }} value={kdBand} onChange={(value) => setKdBand(value as KdBand | "")}>
              <option value="">{t("anyKd")}</option>
              {KD_BANDS.map((entry) => <option key={entry} value={entry}>{t(`kdBands.${entry}`)}</option>)}
            </Select>
          </>
        }
        cardHeader={
          <SiteTableBar
            footer={table.footer}
            noun="keywords"
            actions={<TableDownload siteId={siteId} kind="keywords" sort={order.tableSort} />}
          >
            <CompareControl days={site?.checkDays ?? []} />
          </SiteTableBar>
        }
        sort={order.tableSort}
        empty={{ icon: <KeyRound className="h-8 w-8 text-muted/30" />, label: filtered ? t("noMatch") : t("empty") }}
        footer={table.footer}
        columns={[
          {
            key: "keyword",
            header: t("columns.keyword"),
            sortable: true,
            cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell>,
          },
          { key: "position", header: t("columns.position"), align: "right", sortable: true, cell: (row) => <PositionCell position={row.position} /> },
          ...(compareDay
            ? [{
              key: "compared",
              header: t("columns.compared", { day: formatDay(compareDay) }),
              align: "right" as const,
              cell: (row: (typeof shownRows)[number]) => {
                const then = onDay.get(row.keyword);
                if (compared === undefined) return <span className="text-muted">…</span>;
                return then === undefined || then === null
                  ? <span className="text-[12px] text-muted">{tc("notOnPageOne")}</span>
                  : <span className="font-mono text-[12px] text-secondary">{then}{row.position !== null ? <ChangeCell change={then - row.position} /> : null}</span>;
              },
            }]
            : [{ key: "change", header: t("columns.change"), align: "right" as const, sortable: true, cell: (row: (typeof shownRows)[number]) => <ChangeCell change={row.change} /> }]),
          { key: "volume", header: t("columns.volume"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.volume)}</span> },
          {
            key: "cpc",
            header: <span title={t("cpcHint")}>{t("columns.cpc")}</span>,
            align: "right",
            sortable: true,
            cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatCpc(row.cpc)}</span>,
          },
          {
            key: "traffic",
            header: <span title={t("trafficHint")}>{t("columns.traffic")}</span>,
            align: "right",
            sortable: true,
            cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.traffic === null ? "–" : formatNumber(row.traffic)}</span>,
          },
          ...(status === "OLDER"
            ? [{
              key: "lastSeen",
              header: t("columns.lastSeen"),
              sortable: true,
              cell: (row: (typeof shownRows)[number]) => <span className="text-[12px] text-secondary">{formatDay(row.day)}</span>,
            }]
            : []),
          {
            key: "page",
            header: t("columns.page"),
            cell: (row) => row.page
              ? <PageLinkCell href={recordHref({ kind: "page", page: row.page })} page={row.page} was={row.previousPage} />
              : <span className="text-muted">–</span>,
          },
        ]}
      />
    </div>
  );
}
