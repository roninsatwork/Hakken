"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Swords } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { SiteFigure } from "../../../_components/SiteFigure";
import { formatNumber } from "../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { sharedSiteQuery, useSiteParam } from "../../../_components/useSiteParam";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";
import { SiteViewSwitch } from "../../../_components/SiteViewSwitch";

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
  const router = useRouter();
  const params = useSearchParams();
  const siteId = useSiteId();
  const site = useSite();
  const back = useRecordBack("rival");
  const recordHref = useSiteRecordHref(siteId);
  const asked = useRecordKey("rival");
  const [lead, setLead] = useSiteParam<Lead>("lead", "THEM", LEADS);

  const hold = site?.holds.find((entry) => entry.siteId === asked && entry.siteId !== site.siteId) ?? null;
  const rivalId = hold ? (hold.siteId as Id<"companyWebsites">) : null;
  const figures = useQuery(api.siteCharts.siteAndRivals, rivalId ? { siteId } : "skip");
  const rivals = useQuery(api.siteCompetitors.listRivals, rivalId ? { siteId } : "skip");
  const order = useSiteSort(SORTS, "theirVisits");
  const table = useSiteListPage(
    api.siteRecords.sharedSearches,
    rivalId ? { siteId, rivalId, ...(lead === "ALL" ? {} : { lead }), sort: order.key, direction: order.direction } : "skip",
    rivalId ? [{ siteId, list: "keywords" }, { siteId, list: "keywords", rivalId }] : [],
  );

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
        icon={<Swords className="h-6 w-6 text-brand" />}
        title={hold?.host ?? ""}
        description={hold && site ? t("description", { rival: hold.host, site: site.host }) : undefined}
        pills={verdict ? <StatusPill tone={VERDICT_TONES[verdict] ?? "neutral"}>{ts(`verdicts.${verdict}`)}</StatusPill> : undefined}
        action={hold ? (
          <Link href={`/app/sites/${hold.siteId}${sharedSiteQuery(params)}`} className="text-[13px] text-info hover:underline">
            {t("openTheirs")} →
          </Link>
        ) : undefined}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <SiteFigure label={t("figures.traffic")} value={formatNumber(theirs?.estimatedTraffic)} detail={yoursLine(yours?.estimatedTraffic)} />
        <SiteFigure label={t("figures.keywords")} value={formatNumber(theirs?.keywords)} detail={yoursLine(yours?.keywords)} />
        <SiteFigure label={t("figures.linking")} value={formatNumber(theirs?.referringDomains)} detail={yoursLine(yours?.referringDomains)} />
        <SiteFigure label={t("figures.rank")} value={formatNumber(theirs?.domainRank)} detail={yoursLine(yours?.domainRank)} />
      </div>

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
        cardHeader={<SiteTableBar footer={table.footer} noun="searches" title={t("tableTitle")} description={t("tableHint")} />}
        empty={{ icon: <Swords className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          {
            key: "keyword",
            header: t("columns.keyword"),
            sortable: true,
            cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell>,
          },
          { key: "theirs", header: t("columns.theirs"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[13px] text-foreground">{row.theirPosition}</span> },
          { key: "yours", header: t("columns.yours"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[13px] text-foreground">{row.yourPosition}</span> },
          {
            key: "gap",
            header: t("columns.gap"),
            align: "right",
            sortable: true,
            // The arrow says who is ahead, without the colour: up is this site.
            cell: (row) => {
              const gap = row.theirPosition - row.yourPosition;
              if (gap === 0) return <span className="text-muted">–</span>;
              return <span className={`font-mono text-[12px] ${gap > 0 ? "text-success" : "text-destructive"}`}>{gap > 0 ? `▲ ${gap}` : `▼ ${-gap}`}</span>;
            },
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
    </div>
  );
}
