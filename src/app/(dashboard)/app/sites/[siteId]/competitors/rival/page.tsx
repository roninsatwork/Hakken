"use client";

import Link from "next/link";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { datedRow } from "../../../_components/datedRows";
import { toCsv } from "../../../_components/siteFormat";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Swords } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { CUT_COLUMN, RecordLinkCell } from "../../../_components/SiteCells";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { Figure } from "@/src/ui/components/screens/Figure";
import { formatNumber } from "../../../_components/siteFormat";
import { heldIcon } from "../../../_components/siteGroups";
import { SiteMark } from "../../../_components/SiteMark";
import { useRecordBack, useRecordKey, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { SiteSees } from "../../../_components/SiteSees";
import { sharedSiteQuery, useSiteParam } from "../../../_components/useSiteParam";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";
import { SiteViewSwitch } from "../../../_components/SiteViewSwitch";
import { useCitedPagesTable } from "../../../_components/useCitedPagesTable";

const LEADS = ["THEM", "YOU", "ALL"] as const;
type Lead = (typeof LEADS)[number];

/**
 * The columns that sort, over every shared search (docs/plans/active/
 * sites-table-sorting-plan.md): the search A to Z, both positions from the
 * top, and the most places between you, most searched and the competitor's
 * most visits first — the order it opens on, now shown as a column.
 */
const SORTS = { keyword: "asc", theirs: "asc", yours: "asc", gap: "desc", volume: "desc", theirVisits: "desc" } as const;

const VERDICT_TONES: Record<string, StatusTone> = {
  AHEAD: "warning",
  LEVEL: "info",
  BEHIND: "success",
  GONE_QUIET: "neutral",
  TOO_NEW: "neutral",
  NOT_CHECKED: "neutral",
};

/**
 * One competitor's own screen (Competitors › Side by side › a competitor):
 * its headline figures beside this site's, and every search the two both rank
 * for — where it is ahead, where this site is, or all of them — each search
 * opening its own screen.
 *
 * Only a competitor the company holds has its rankings collected, so only
 * those open here; the rest of the market is on Organic competitors. Opened
 * from a row, never as a modal (Anthony, 2026-09-24: "These are all new
 * screens with a back button").
 */
export default function SiteRivalPage() {
  const t = useTranslations("sites.rivalRecord");
  const ts = useTranslations("sites.sideBySide");
  const tc = useTranslations("sites.common");
  const router = useRouter();
  const params = useSearchParams();
  const siteId = useSiteId();
  const site = useSite();
  const back = useRecordBack("rival");
  const recordHref = useSiteRecordHref(siteId);
  const asked = useRecordKey("rival");
  const [lead, setLead] = useSiteParam<Lead>("lead", "THEM", LEADS);

  // Only a website beside this one — its group — has a comparison; any other,
  // even one the company holds, is not found here rather than an error.
  const hold = site?.rivals.find((entry) => entry.siteId === asked) ?? null;
  const rivalId = hold ? (hold.siteId as Id<"companyWebsites">) : null;
  const figures = useQuery(api.siteCharts.siteAndRivals, rivalId ? { siteId } : "skip");
  const rivals = useQuery(api.siteCompetitors.listRivals, rivalId ? { siteId } : "skip");
  // Searches shared across everything both rank for: the list below is the part in both kept lists (§4.D3).
  const sharedInAll = useQuery(api.siteDiscovery.sharedWithRival, rivalId ? { siteId, rivalId } : "skip");
  const order = useSiteSort(SORTS, "theirVisits");
  const table = useSiteListPage(
    api.siteRecords.sharedSearches,
    rivalId ? { siteId, rivalId, ...(lead === "ALL" ? {} : { lead }), sort: order.key, direction: order.direction } : "skip",
    rivalId ? [{ siteId, list: "keywords" }, { siteId, list: "keywords", rivalId }] : [],
  );

  // Each one's estimated visits over the date menu's period (calendar-periods-plan.md, item 11.1).
  const range = useSiteRange();
  const tp = useTranslations("common.periods");
  const trend = useQuery(api.siteCharts.siteSeries, rivalId ? { siteId, from: range.from, to: range.to, step: range.step, withRivals: true } : "skip");
  const ownLine = trend?.find((line) => line.isYou), rivalLine = trend?.find((line) => !line.isYou && line.host === hold?.host);
  const months = [...new Set([...(ownLine?.points ?? []), ...(rivalLine?.points ?? [])].map((point) => point.day))].sort();
  const monthly = (you: boolean, day: string) => ((you ? ownLine : rivalLine)?.points.find((point) => point.day === day)?.estimatedTraffic ?? null);

  const tcp = useTranslations("sites.citedPages");
  const citedRows = useQuery(api.siteRivalCited.rivalCitedPages, rivalId ? { siteId, rivalId } : "skip");
  const cited = useCitedPagesTable(citedRows, { fileName: `${site?.host ?? "site"}-${hold?.host ?? "rival"}-cited-pages`, withHost: false, table: "cited" });

  if (!asked) {
    return <DetailHeader back={back} icon={<Swords className="h-6 w-6 text-brand" />} title={t("missingTitle")} description={t("missingBody")} />;
  }
  if (site && !hold) {
    return <DetailHeader back={back} icon={<Swords className="h-6 w-6 text-brand" />} title={t("notFoundTitle")} description={t("notFoundBody")} />;
  }

  const theirs = figures?.find((row) => !row.isYou && row.host === hold?.host) ?? null;
  const yours = figures?.find((row) => row.isYou) ?? null;
  const verdict = rivals?.find((row) => row.host === hold?.host)?.verdict ?? null;
  const yoursLine = (value: number | null | undefined) =>
    value === null || value === undefined ? undefined : <span className="text-muted">{t("figures.yours", { value: formatNumber(value) })}</span>;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={hold ? <SiteMark host={hold.host} iconUrl={heldIcon(site?.holds, { siteId: hold.siteId })} owned={false} /> : undefined}
        title={hold?.host ?? ""}
        description={hold && site ? t("description", { rival: hold.host, site: site.host }) : undefined}
        pills={verdict ? <StatusLabel tone={VERDICT_TONES[verdict] ?? "neutral"}>{ts(`verdicts.${verdict}`)}</StatusLabel> : undefined}
        action={hold ? (
          <Link href={`/app/sites/${hold.siteId}${sharedSiteQuery(params)}`} className="text-[13px] text-info hover:underline">
            {t("openTheirs")} →
          </Link>
        ) : undefined}
      />
      <SiteSees screen="competitorsRival" seen={table.result?.seen} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Figure label={t("figures.traffic")} value={formatNumber(theirs?.estimatedTraffic)} detail={yoursLine(yours?.estimatedTraffic)} />
        <Figure label={t("figures.keywords")} value={formatNumber(theirs?.keywords)} detail={yoursLine(yours?.keywords)} />
        <Figure label={t("figures.linking")} value={formatNumber(theirs?.referringDomains)} detail={yoursLine(yours?.referringDomains)} />
        <Figure label={t("figures.rank")} value={formatNumber(theirs?.domainRank)} detail={yoursLine(yours?.domainRank)} />
      </div>

      {/* Their Google visitors a month against yours (insights-analyst-plan.md phase 4, the VisRival board). */}
      <SiteChartCard
        title={t("trafficTitle", { rival: hold?.host ?? "" })}
        hint={t("trafficHint", { byStep: tp("byStep", { step: range.step }) })}
        exportName={`${site?.host ?? "site"}-against-${hold?.host ?? "rival"}-${range.from}-to-${range.to}`}
        csv={() => toCsv([tp("stepColumn", { step: range.step }), site?.host ?? "", hold?.host ?? ""], months.map((month) => [month, monthly(true, month), monthly(false, month)]))}
        enoughData={months.length > 1}
      >
        <SiteLineChart
          sharedScale
          data={months.map((month) => datedRow({ day: month }, { you: monthly(true, month), them: monthly(false, month) }))}
          series={[
            { key: "you", name: tc("you", { host: site?.host ?? "" }), colour: SITE_SERIES_COLOURS[0] },
            { key: "them", name: hold?.host ?? "", colour: SITE_SERIES_COLOURS[1], dashed: true },
          ]}
        />
      </SiteChartCard>

      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        filters={
          <SiteViewSwitch
            label={t("tableTitle")}
            options={LEADS.map((entry) => ({ value: entry, label: t(`leads.${entry}`) }))}
            value={lead}
            onChange={setLead}
          />
        }
        cardHeader={<TableBar
          footer={table.footer}
          noun="searches"
          title={t("tableTitle")}
          description={sharedInAll && hold
            ? (lead === "ALL" && table.result && table.result.total < sharedInAll
              ? t("sharedHeldOf", { held: formatNumber(table.result.total), total: formatNumber(sharedInAll) })
              : t("sharedOf", { total: formatNumber(sharedInAll), rival: hold.host }))
            : t("tableHint")}
        />}
        empty={{ icon: <Swords className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          {
            key: "keyword",
            header: t("columns.keyword"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell>,
          },
          { key: "theirs", header: t("columns.theirs"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[13px] text-foreground">{row.theirPosition}</span> },
          { key: "yours", header: t("columns.yours"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[13px] text-foreground">{row.yourPosition}</span> },
          {
            key: "gap",
            header: t("columns.gap"),
            align: "right",
            sortable: true,
            // The arrow says who is ahead, without the colour: up is this site.
            cell: (row) => <Change by={row.theirPosition - row.yourPosition} />,
          },
          { key: "volume", header: t("columns.volume"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.volume)}</span> },
          {
            key: "theirVisits",
            header: t("columns.theirVisits"),
            align: "right",
            sortable: true,
            cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.theirTraffic)}</span>,
          },
        ]}
      />

      {/* What the rival is building: its pages AI assistants cite for the company's own questions (the VisRival board). */}
      <DataTable
        rows={cited.pager.pageRows}
        rowKey={(row) => row.url}
        onRowClick={() => { if (hold) router.push(`/app/sites/${hold.siteId}/ai/sources`); }}
        search={cited.search}
        cardHeader={<TableBar footer={cited.pager.footer} noun="results" title={tcp("rivalTitle", { count: citedRows?.length ?? 0 })} actions={cited.download} />}
        empty={cited.empty}
        footer={cited.pager.footer}
        sort={cited.sort}
        columns={cited.columns}
      />
    </div>
  );
}
