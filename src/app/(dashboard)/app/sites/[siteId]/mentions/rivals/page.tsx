"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { AtSign } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { formatMonth, toCsv } from "../../../_components/siteFormat";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { FigureCell } from "../../local/_components/LocalParts";

type Business = { host: string; you: boolean; mentions: number; before: number; well: number; badly: number; noLink: number; series: number[]; share: number | null };

const SORTS: SiteSortColumns<Business, "business" | "mentions" | "change" | "well" | "badly" | "noLink" | "share"> = {
  business: { value: (row) => row.host, first: "asc" },
  mentions: { value: (row) => row.mentions, first: "desc" },
  change: { value: (row) => row.mentions - row.before, first: "desc" },
  well: { value: (row) => row.well, first: "desc" },
  badly: { value: (row) => row.badly, first: "desc" },
  noLink: { value: (row) => row.noLink, first: "desc" },
  share: { value: (row) => row.share, first: "desc" },
};
const hostOf = (row: Business) => row.host;
const pagedOnly = <Footer extends { totalCount: number; pageSize: number }>(footer: Footer) => (footer.totalCount > footer.pageSize ? footer : undefined);

/**
 * Discovery → Web mentions → Against rivals (docs/plans/active/discovery-
 * local-reputation-ai-plan.md, step 6, D18; drawn as "Web mentions · Against
 * rivals"): how often the web names the business and each rival watched
 * beside it, month by month, and how it speaks of each.
 */
export default function MentionsAgainstRivalsPage() {
  const t = useTranslations("sites.mentions.rivals");
  const tm = useTranslations("sites.mentions");
  const siteId = useSiteId();
  const site = useSite();
  const data = useQuery(api.siteWebMentions.mentionsAgainstRivals, { siteId });
  const total = (data?.businesses ?? []).reduce((sum, row) => sum + row.mentions, 0);
  const businesses = data?.businesses.map((row) => ({ ...row, share: total > 0 ? row.mentions / total : null })) as Business[] | undefined;
  const { rows: sorted, tableSort } = useSiteSortedList(businesses, SORTS, { opening: "mentions", name: hostOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });

  const ranked = [...(businesses ?? [])].sort((left, right) => right.mentions - left.mentions);
  const you = businesses?.find((row) => row.you);
  const most = ranked[0];
  const fastest = [...(businesses ?? [])].sort((left, right) => (right.mentions - right.before) - (left.mentions - left.before))[0];
  const worst = [...(businesses ?? [])].filter((row) => row.mentions > 0).sort((left, right) => right.badly / right.mentions - left.badly / left.mentions)[0];
  const nameOf = (row: { host: string; you: boolean }) => (row.you ? tm("you", { name: row.host }) : row.host);
  const shortName = (row: { host: string; you: boolean }) => (row.you ? tm("youShort") : row.host);
  const chartRows = (data?.months ?? []).map((month, at) => ({ label: formatMonth(month), ...Object.fromEntries((data?.businesses ?? []).map((row) => [row.host, row.series[at]])) }));
  const fileBase = `${site?.host ?? "site"}-web-mentions-against-rivals`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<AtSign className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />

      {data ? (
        <FigureRow>
          <Figure label={t("figures.share")} emphasis value={you?.share === null || !you ? "–" : `${Math.round(you.share! * 100)}%`} detail={<span className="text-secondary">{you ? t("figures.shareDetail", { place: ranked.indexOf(you) + 1, of: ranked.length }) : "–"}</span>} />
          <Figure label={t("figures.most")} value={most ? shortName(most) : "–"} detail={<span className="text-secondary">{most && most.share !== null ? t("figures.mostDetail", { count: most.mentions, share: Math.round(most.share * 100) }) : "–"}</span>} />
          <Figure
            label={t("figures.fastest")}
            value={fastest ? shortName(fastest) : "–"}
            detail={fastest ? <><Change by={fastest.mentions - fastest.before} arrow={fastest.mentions >= fastest.before ? "up" : "down"} /> <span className="text-secondary">{tm("figures.monthBefore")}</span></> : <span className="text-secondary">–</span>}
          />
          <Figure label={t("figures.worst")} value={worst && worst.badly > 0 ? shortName(worst) : "–"} detail={<span className="text-secondary">{worst && worst.badly > 0 ? t("figures.worstDetail", { count: worst.badly, of: worst.mentions }) : t("figures.noneBadly")}</span>} />
        </FigureRow>
      ) : null}

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${fileBase}-a-month`}
        csv={() => toCsv([tm("chartMonth"), ...(data?.businesses ?? []).map(nameOf)], chartRows.map((row) => [row.label, ...(data?.businesses ?? []).map((business) => (row as Record<string, unknown>)[business.host] as number)]))}
        enoughData={(data?.businesses ?? []).some((row) => row.series.some((count) => count > 0))}
      >
        <SiteLineChart
          sharedScale
          data={chartRows}
          series={(data?.businesses ?? []).map((row, at) => ({ key: row.host, name: shortName(row), colour: SITE_SERIES_COLOURS[at % SITE_SERIES_COLOURS.length] }))}
        />
      </SiteChartCard>

      <DataTable
        rows={pager.pageRows}
        rowKey={hostOf}
        rowClassName={(row) => (row.you ? "bg-brand/5" : "")}
        cardHeader={<TableBar footer={pager.footer} noun="businesses" actions={<ListDownload fileName={fileBase} rows={sorted ?? []} columns={[{ header: t("columns.business"), value: (row) => row.host }, { header: t("columns.mentions"), value: (row) => row.mentions }, { header: t("columns.change"), value: (row) => row.mentions - row.before }, { header: t("columns.well"), value: (row) => row.well }, { header: t("columns.badly"), value: (row) => row.badly }, { header: t("columns.noLink"), value: (row) => row.noLink }, { header: t("columns.share"), value: (row) => (row.share === null ? null : Math.round(row.share * 100)) }]} />}><span className="text-[13px] text-secondary">{t("youAndRivals", { count: Math.max(0, (businesses?.length ?? 1) - 1) })}</span></TableBar>}
        empty={{ icon: <AtSign className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={pagedOnly(pager.footer)}
        sort={tableSort}
        columns={[
          { key: "business", header: t("columns.business"), sortable: true, cell: (row) => <span className="text-[13px] text-foreground">{nameOf(row)}</span> },
          { key: "mentions", header: t("columns.mentions"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.mentions} /> },
          { key: "change", header: t("columns.change"), align: "right", sortable: true, cell: (row) => <Change by={row.mentions - row.before} /> },
          { key: "well", header: t("columns.well"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.well} /> },
          { key: "badly", header: t("columns.badly"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.badly} /> },
          { key: "noLink", header: t("columns.noLink"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.noLink} /> },
          { key: "share", header: t("columns.share"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.share} text={row.share === null ? undefined : `${Math.round(row.share * 100)}%`} /> },
        ]}
      />
    </div>
  );
}
