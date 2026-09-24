"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { CompareControl } from "../../_components/CompareControl";
import { ChangeCell, CheckedCell, FeaturesCell, IntentPill, PageCell, PositionCell, TrendCell } from "../../_components/SiteCells";
import { SiteChartCard } from "../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteStackedAreaChart } from "../../_components/SiteCharts";
import { useSiteRange } from "../../_components/SiteDateRange";
import { formatDay, formatNumber, formatShortDay, toCsv } from "../../_components/siteFormat";
import { useCompareDay, useSite, useSiteId } from "../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../_components/useSiteParam";
import { TableDownload } from "../../_components/SiteDownloads";
import { useSitePagedTable } from "../../_components/useSitePagedTable";

const BANDS = ["p01_03", "p04_10", "p11_20", "p21_50", "p51_up"] as const;
const INTENTS = ["BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER", "UNJUDGED"] as const;
const STATUSES = ["NEW", "UP", "DOWN", "SAME", "LOST"] as const;
const KD_BANDS = ["kd00_10", "kd11_30", "kd31_70", "kd71_100"] as const;
const SORTS = ["position", "volume", "traffic", "cpc"] as const;

type Band = (typeof BANDS)[number];
type Intent = (typeof INTENTS)[number];
type Status = (typeof STATUSES)[number];
type KdBand = (typeof KD_BANDS)[number];
type Sort = (typeof SORTS)[number];

const SORT_LABELS = { position: "sortPosition", volume: "sortVolume", traffic: "sortTraffic", cpc: "sortCpc" } as const;

/** A cost per click, which DataForSEO gives in US dollars. */
function formatCpc(value: number | null): string {
  return value === null ? "–" : `$${value.toFixed(2)}`;
}

/**
 * Every search the site ranks for (Organic keywords › All keywords).
 *
 * Searched, filtered, sorted and paged on the server (D14, D15): each change
 * of filter asks for one page of fifteen from the index that fits it. The
 * "compare with" column fetches the chosen day's position for the rows on
 * screen only. The chart above is the position bands over the dates chosen.
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

  const [search, setSearch, term] = useSiteSearch();
  const [band, setBand] = useSiteParam<Band | "">("band", "", BANDS);
  const [intent, setIntent] = useSiteParam<Intent | "">("intent", "", INTENTS);
  const [status, setStatus] = useSiteParam<Status | "">("status", "", STATUSES);
  const [kdBand, setKdBand] = useSiteParam<KdBand | "">("kd", "", KD_BANDS);
  const [sort, setSort] = useSiteParam<Sort>("sort", "position", SORTS);

  const table = useSitePagedTable(api.siteKeywords.listKeywords, {
    siteId,
    ...(term ? { search: term } : {}),
    ...(band ? { band } : {}),
    ...(intent ? { intent } : {}),
    ...(status ? { status } : {}),
    ...(kdBand ? { kdBand } : {}),
    sort,
  });
  const compared = useQuery(
    api.siteKeywords.keywordsOnDay,
    compareDay && table.rows.length > 0 ? { siteId, day: compareDay, keywords: table.rows.map((row) => row.keyword) } : "skip",
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
        rows={table.isLoading ? undefined : table.rows}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[1400px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={t("bandFilter")} value={band} onChange={(value) => setBand(value as Band | "")}>
              <option value="">{t("anyBand")}</option>
              {BANDS.map((entry) => <option key={entry} value={entry}>{tb(entry)}</option>)}
            </Select>
            <Select aria-label={tc("intentFilter")} value={intent} onChange={(value) => setIntent(value as Intent | "")}>
              <option value="">{tc("anyIntent")}</option>
              {INTENTS.map((entry) => <option key={entry} value={entry}>{tc(`intents.${entry}`)}</option>)}
            </Select>
            <Select aria-label={t("statusFilter")} value={status} onChange={(value) => setStatus(value as Status | "")}>
              <option value="">{t("anyStatus")}</option>
              {STATUSES.map((entry) => <option key={entry} value={entry}>{t(`statuses.${entry}`)}</option>)}
            </Select>
            <Select aria-label={t("kdFilter")} value={kdBand} onChange={(value) => setKdBand(value as KdBand | "")}>
              <option value="">{t("anyKd")}</option>
              {KD_BANDS.map((entry) => <option key={entry} value={entry}>{t(`kdBands.${entry}`)}</option>)}
            </Select>
            <Select aria-label={t("sortLabel")} value={sort} onChange={(value) => setSort(value as Sort)}>
              {SORTS.map((entry) => <option key={entry} value={entry}>{t(SORT_LABELS[entry])}</option>)}
            </Select>
            <CompareControl days={site?.checkDays ?? []} />
            <TableDownload siteId={siteId} kind="keywords" />
          </>
        }
        empty={{ icon: <KeyRound className="h-8 w-8 text-muted/30" />, label: filtered ? t("noMatch") : t("empty") }}
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
          { key: "keyword", header: t("columns.keyword"), cell: (row) => <span className="text-[13px] text-foreground">{row.keyword}</span> },
          { key: "intent", header: t("columns.intent"), cell: (row) => <IntentPill intent={row.intent} /> },
          { key: "volume", header: t("columns.volume"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.volume)}</span> },
          {
            key: "trend",
            header: t("columns.trend"),
            cell: (row) => <TrendCell trend={row.trend} label={`${t("trendHint")}: ${row.trend.join(", ")}`} />,
          },
          {
            key: "kd",
            header: <span title={t("kdHint")}>{t("columns.kd")}</span>,
            align: "right",
            cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.difficulty ?? "–"}</span>,
          },
          {
            key: "cpc",
            header: <span title={t("cpcHint")}>{t("columns.cpc")}</span>,
            align: "right",
            cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatCpc(row.cpc)}</span>,
          },
          {
            key: "traffic",
            header: <span title={t("trafficHint")}>{t("columns.traffic")}</span>,
            align: "right",
            cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.traffic === null ? "–" : formatNumber(row.traffic)}</span>,
          },
          { key: "position", header: t("columns.position"), align: "right", cell: (row) => <PositionCell position={row.position} /> },
          ...(compareDay
            ? [{
              key: "compared",
              header: t("columns.compared", { day: formatDay(compareDay) }),
              align: "right" as const,
              cell: (row: (typeof table.rows)[number]) => {
                const then = onDay.get(row.keyword);
                if (compared === undefined) return <span className="text-muted">…</span>;
                return then === undefined || then === null
                  ? <span className="text-[12px] text-muted">{tc("notOnPageOne")}</span>
                  : <span className="font-mono text-[12px] text-secondary">{then}{row.position !== null ? <ChangeCell change={then - row.position} /> : null}</span>;
              },
            }]
            : [{ key: "change", header: t("columns.change"), align: "right" as const, cell: (row: (typeof table.rows)[number]) => <ChangeCell change={row.change} /> }]),
          { key: "page", header: t("columns.page"), cell: (row) => <PageCell page={row.page} was={row.previousPage} /> },
          { key: "features", header: t("columns.features"), cell: (row) => <FeaturesCell features={row.serpFeatures} /> },
          { key: "checked", header: t("columns.lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
