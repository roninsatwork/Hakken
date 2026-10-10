"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Radar } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { PageSection } from "../../../_components/PageSection";
import { SiteChartCard } from "../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../_components/SiteCharts";
import { RecordLinkCell } from "../../_components/SiteCells";
import { formatMonth, formatNumber, toCsv } from "../../_components/siteFormat";
import { ListDownload } from "../../_components/SiteDownloads";
import { useSiteListHref, useSiteRecordHref } from "../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../_components/useSite";
import { SiteSees } from "../../_components/SiteSees";
import { useSitePager } from "../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../_components/useSiteSort";
import { FigureCell } from "../local/_components/LocalParts";

type Business = { websiteId: string; host: string; you: boolean; mentions: number | null; before: number | null; asks: number | null; pagesCited: number; series: Array<number | null>; share: number | null };
type Question = { question: string; volume: number; you: number | null; rivals: string[]; yourPage: string | null; tracked: boolean };

const BUSINESS_SORTS: SiteSortColumns<Business, "business" | "mentions" | "change" | "share" | "asks" | "pages"> = {
  business: { value: (row) => row.host, first: "asc" },
  mentions: { value: (row) => row.mentions, first: "desc" },
  change: { value: (row) => (row.mentions !== null && row.before !== null ? row.mentions - row.before : null), first: "desc" },
  share: { value: (row) => row.share, first: "desc" },
  asks: { value: (row) => row.asks, first: "desc" },
  pages: { value: (row) => row.pagesCited, first: "desc" },
};
const QUESTION_SORTS: SiteSortColumns<Question, "question" | "volume" | "you"> = {
  question: { value: (row) => row.question, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  you: { value: (row) => row.you, first: "asc" },
};
const hostOf = (row: Business) => row.host;
const questionOf = (row: Question) => row.question;
/** A fraction of a dollar to one figure that counts; whole cents above a cent. */
const dollars = (usd: number) => (usd < 0.01 ? `$${Number(usd.toPrecision(1))}` : `$${usd.toFixed(2)}`);
const pagedOnly = <Footer extends { totalCount: number; pageSize: number }>(footer: Footer) => (footer.totalCount > footer.pageSize ? footer : undefined);

/**
 * Discovery → Brand radar → Overview (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, step 4, D18; drawn as "Brand radar · Overview"): how
 * often Google's AI answers name the website beside the rivals watched with
 * it, month by month, and the real questions behind them — questions nobody
 * chose, read monthly.
 */
export default function BrandRadarPage() {
  const t = useTranslations("sites.radar");
  const siteId = useSiteId();
  const site = useSite();
  const recordHref = useSiteRecordHref(siteId);
  const listHref = useSiteListHref(siteId);
  const router = useRouter();
  const data = useQuery(api.siteBrandRadar.radarOverview, { siteId });
  const me = useQuery(api.users.getMe);
  const addQuestion = useMutation(api.websiteCanonical.addWebsiteQuestion);
  const action = useAdminAction({ scope: "site-radar" });

  const total = (data?.businesses ?? []).reduce((sum, row) => sum + (row.mentions ?? 0), 0);
  const businesses = data?.businesses.map((row) => ({ ...row, share: total > 0 && row.mentions !== null ? row.mentions / total : null })) as Business[] | undefined;
  const businessesSorted = useSiteSortedList(businesses, BUSINESS_SORTS, { opening: "mentions", name: hostOf, table: "businesses" });
  const businessesPager = useSitePager(businessesSorted.rows, { isLoading: data === undefined, table: "businesses" });
  const questionsSorted = useSiteSortedList(data?.questions as Question[] | undefined, QUESTION_SORTS, { opening: "volume", name: questionOf, table: "questions" });
  const questionsPager = useSitePager(questionsSorted.rows, { isLoading: data === undefined, table: "questions" });

  const you = businesses?.find((row) => row.you);
  const ranked = [...(businesses ?? [])].sort((left, right) => (right.mentions ?? 0) - (left.mentions ?? 0));
  const place = you ? ranked.indexOf(you) + 1 : null;
  const superAdmin = me?.role === "SUPER_ADMIN";
  const chartRows = (data?.months ?? []).map((month, at) => {
    const sum = (data?.businesses ?? []).reduce((all, row) => all + (row.series[at] ?? 0), 0);
    return {
      label: formatMonth(month),
      ...Object.fromEntries((data?.businesses ?? []).map((row) => [row.websiteId, sum > 0 && row.series[at] !== null ? Math.round(((row.series[at] ?? 0) / sum) * 100) : null])),
    };
  });
  const fileBase = `${site?.host ?? "site"}-brand-radar`;
  const nameOf = (row: { host: string; you: boolean }) => (row.you ? t("you", { name: row.host }) : row.host);
  // A business opens One business, yours its Business profile; a question opens One question (discovery-detail-and-hakken-sees-plan.md §4).
  const businessHref = (row: Business) => (row.you ? listHref("local") : recordHref({ kind: "business", business: row.host }));
  const questionHref = (row: Question) => recordHref({ kind: "question", question: row.question });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Radar className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={site ? <TagLabel>{t("where", { place: site.placeLabel })}</TagLabel> : undefined}
      />
      <SiteSees screen="radarOverview" seen={data?.seen} />

      {data ? (
        <FigureRow>
          <Figure
            label={t("figures.naming")}
            emphasis
            value={you?.mentions ?? "–"}
            detail={you?.mentions !== null && you?.before !== null && you ? <><Change by={you.mentions! - you.before!} arrow={you.mentions! >= you.before! ? "up" : "down"} /> <span className="text-secondary">{t("figures.monthBefore")}</span></> : <span className="text-secondary">{t("figures.firstMonth")}</span>}
          />
          <Figure label={t("figures.asked")} value={you?.asks === null || !you ? "–" : formatNumber(you.asks)} detail={<span className="text-secondary">{t("figures.askedDetail")}</span>} />
          <Figure label={t("figures.share")} value={you?.share === null || !you ? "–" : `${Math.round(you.share! * 100)}%`} detail={<span className="text-secondary">{place ? t("figures.shareDetail", { place, of: ranked.length }) : "–"}</span>} />
          <Figure label={t("figures.pages")} href={`/app/sites/${siteId}/radar/sources`} value={you?.pagesCited ?? 0} detail={<span className="text-secondary">{t("figures.pagesDetail", { count: data.yourCitedAnswers })}</span>} />
        </FigureRow>
      ) : null}
      <Notice>{data?.perCheckUsd ? t("notice", { cost: dollars(data.perCheckUsd) }) : t("noticeUnpriced")}</Notice>

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${fileBase}-share-of-voice`}
        csv={() => toCsv([t("chartMonth"), ...(data?.businesses ?? []).map(nameOf)], chartRows.map((row) => [row.label, ...(data?.businesses ?? []).map((business) => (row as Record<string, unknown>)[business.websiteId] as number | null)]))}
        enoughData={(data?.months.length ?? 0) > 1}
      >
        <SiteLineChart
          sharedScale
          data={chartRows}
          series={(data?.businesses ?? []).map((row, at) => ({ key: row.websiteId, name: row.you ? t("youShort") : row.host, colour: SITE_SERIES_COLOURS[at % SITE_SERIES_COLOURS.length] }))}
        />
      </SiteChartCard>

      <PageSection tight title={t("rivalsTitle")} description={t("rivalsDescription")}>
        <DataTable
          rows={businessesPager.pageRows}
          rowKey={(row) => row.websiteId}
          rowClassName={(row) => (row.you ? "bg-brand/5" : "")}
          onRowClick={(row) => router.push(businessHref(row))}
          cardHeader={<TableBar footer={businessesPager.footer} noun="businesses" actions={<ListDownload fileName={`${fileBase}-rivals`} rows={businessesSorted.rows ?? []} columns={[{ header: t("columns.business"), value: (row) => row.host }, { header: t("columns.mentions"), value: (row) => row.mentions }, { header: t("columns.change"), value: (row) => (row.mentions !== null && row.before !== null ? row.mentions - row.before : null) }, { header: t("columns.share"), value: (row) => (row.share === null ? null : Math.round(row.share * 100)) }, { header: t("columns.asked"), value: (row) => row.asks }, { header: t("columns.pages"), value: (row) => row.pagesCited }]} />}><span className="text-[13px] text-secondary">{t("youAndRivals", { count: Math.max(0, (businesses?.length ?? 1) - 1) })}</span></TableBar>}
          empty={{ icon: <Radar className="h-8 w-8 text-muted/30" />, label: t("rivalsEmpty") }}
          footer={pagedOnly(businessesPager.footer)}
          sort={businessesSorted.tableSort}
          columns={[
            { key: "business", header: t("columns.business"), sortable: true, cell: (row) => <RecordLinkCell href={businessHref(row)}>{nameOf(row)}</RecordLinkCell> },
            { key: "mentions", header: t("columns.mentions"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.mentions} /> },
            { key: "change", header: t("columns.change"), align: "right", sortable: true, cell: (row) => (row.mentions !== null && row.before !== null ? <Change by={row.mentions - row.before} /> : <FigureCell value={null} />) },
            { key: "share", header: t("columns.share"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.share} text={row.share === null ? undefined : `${Math.round(row.share * 100)}%`} /> },
            { key: "asks", header: t("columns.asked"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.asks} /> },
            { key: "pages", header: t("columns.pages"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.pagesCited} /> },
          ]}
        />
      </PageSection>

      <PageSection tight title={t("questionsTitle")} description={t("questionsDescription")}>
        <DataTable
          rows={questionsPager.pageRows}
          rowKey={(row) => row.question}
          onRowClick={(row) => router.push(questionHref(row))}
          cardHeader={<TableBar footer={questionsPager.footer} noun="questions" actions={<ListDownload fileName={`${fileBase}-questions`} rows={questionsSorted.rows ?? []} columns={[{ header: t("columns.question"), value: (row) => row.question }, { header: t("columns.asked"), value: (row) => row.volume }, { header: t("columns.you"), value: (row) => row.you }, { header: t("columns.rivals"), value: (row) => row.rivals.join(" · ") }, { header: t("columns.yourPage"), value: (row) => row.yourPage }]} />} />}
          empty={{ icon: <Radar className="h-8 w-8 text-muted/30" />, label: t("questionsEmpty") }}
          footer={questionsPager.footer}
          sort={questionsSorted.tableSort}
          columns={[
            { key: "question", header: t("columns.question"), sortable: true, cell: (row) => <RecordLinkCell href={questionHref(row)}>{row.question}</RecordLinkCell> },
            { key: "volume", header: t("columns.asked"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
            { key: "you", header: t("columns.you"), sortable: true, cell: (row) => (row.you === null ? <span className="text-[12px] text-muted">{t("notNamed")}</span> : <span className="whitespace-nowrap text-[12px] text-foreground">{t("namedAt", { place: row.you })}</span>) },
            { key: "rivals", header: t("columns.rivals"), cell: (row) => <span className="text-[12px] text-secondary">{row.rivals.join(" · ") || "–"}</span> },
            { key: "page", header: t("columns.yourPage"), cell: (row) => (row.yourPage ? <RecordLinkCell href={recordHref({ kind: "page", page: row.yourPage })} className="text-[12px] text-info">{row.yourPage}</RecordLinkCell> : <span className="text-[12px] text-muted">–</span>) },
            {
              key: "actions",
              header: t("columns.actions"),
              cell: (row) => (row.tracked
                ? <StatusLabel tone="success">{t("tracked")}</StatusLabel>
                : superAdmin && site
                  ? (
                    <Button
                      variant="quiet"
                      className="whitespace-nowrap"
                      disabled={action.isBusy(`track:${row.question}`)}
                      onClick={(event) => {
                        event.stopPropagation();
                        void action.run(() => addQuestion({ companyWebsiteId: siteId, prompt: row.question }), { key: `track:${row.question}`, fallbackMessage: t("trackFailed") });
                      }}
                    >
                      {t("track")}
                    </Button>
                  )
                  : null),
            },
          ]}
        />
      </PageSection>
    </div>
  );
}
