"use client";

import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Compass } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useInsightsHref, useInsightsSite } from "../../_components/useInsights";
import { percentMoved, useServiceName } from "../../_components/strategyWords";

/**
 * A service, opened from Strategy (docs/plans/active/insights-analyst-plan.md
 * §4.1, drawn as the ServiceDetail board): why it gets its call — its
 * enquiries against a year before, its share of the services' Google clicks,
 * how many visitors it takes for one enquiry — the searches its page ranks
 * for with the best rival on each, and its page's figures.
 */
export default function InsightsServicePage() {
  const t = useTranslations("insights.service");
  const ts = useTranslations("insights.strategy");
  const params = useSearchParams();
  const page = params.get("page") ?? "";
  const site = useInsightsSite();
  const href = useInsightsHref();
  const name = useServiceName();
  const data = useQuery(api.insightsReads.insightsService, page ? { page, ...(site ? { siteId: site } : {}) } : "skip");
  const searches = useSitePager(data ? data.searches : undefined, { isLoading: data === undefined });
  const pages = useSitePager(data ? [data.service] : undefined, { isLoading: data === undefined, table: "pages" });
  const back = { label: t("back"), href: href("strategy") };
  if (data === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  if (data === null) return <HakkenEmptyState icon={Compass} title={t("notFound")} description={t("notFoundDescription")} />;

  const service = data.service;
  const moved = percentMoved(service.enquiries, service.enquiriesBefore);
  const perEnquiry = service.enquiries > 0 ? Math.round(service.people / service.enquiries) : null;
  const share = data.siteClicks ? Math.round((service.clicks / data.siteClicks) * 100) : null;
  const says = [
    service.enquiriesBefore === null
      ? t("sees.noYear", { enquiries: service.enquiries })
      : t("sees.enquiries", { enquiries: service.enquiries, before: service.enquiriesBefore }),
    t(`sees.call.${service.verdict}`),
  ];

  return (
    <>
      <DetailHeader
        back={back}
        icon={<Compass className="h-6 w-6 text-brand" />}
        title={name(service)}
        description={service.kind === "GUIDES" ? t("descriptionGuides", { host: data.host }) : t("description", { page: service.page, host: data.host })}
        pills={<StatusLabel tone={service.verdict === "GROW" ? "success" : service.verdict === "STEADY" ? "neutral" : "warning"}>{ts(`verdicts.${service.verdict}`)}</StatusLabel>}
      />
      <HakkenSees says={says} steps={[{ words: ts(`do.${service.verdict}`, { service: name(service) }), link: t("seeStrategy"), href: href("strategy") }]} />
      <FigureRow>
        <Figure label={t("figures.enquiries")} value={formatNumber(service.enquiries)} detail={moved === null ? <span className="text-secondary">{t("figures.noYear")}</span> : <ChangeLine by={moved}>{t("figures.onYear", { percent: Math.abs(moved), before: formatNumber(service.enquiriesBefore ?? 0) })}</ChangeLine>} />
        <Figure label={t("figures.share")} value={share === null ? "–" : `${share}%`} detail={<span className="text-secondary">{t("figures.shareDetail", { clicks: formatNumber(service.clicks) })}</span>} />
        <Figure label={t("figures.perEnquiry")} value={perEnquiry === null ? "–" : formatNumber(perEnquiry)} detail={<span className="text-secondary">{t("figures.perEnquiryDetail", { people: formatNumber(service.people) })}</span>} />
        <Figure label={t("figures.shown")} value={formatNumber(service.impressions)} detail={<span className="text-secondary">{t("figures.shownDetail")}</span>} />
      </FigureRow>
      <DataTable
        rows={searches.pageRows}
        rowKey={(row) => row.keyword}
        cardHeader={<TableBar footer={searches.footer} noun="searches" title={t("searchesTitle")} actions={<ListDownload label={t("download")} fileName={`${data.host}-service-searches`} rows={data.searches} columns={[{ header: t("columns.search"), value: (row) => row.keyword }, { header: t("columns.volume"), value: (row) => row.volume }, { header: t("columns.place"), value: (row) => row.position ?? "" }, { header: t("columns.rival"), value: (row) => (row.rival ? `${row.rival} ${row.rivalPosition}` : "") }]} />} />}
        empty={{ icon: <Compass className="h-8 w-8 text-muted/30" />, label: t("noSearches") }}
        footer={searches.footer}
        columns={[
          { key: "keyword", header: t("columns.search"), cell: (row) => <span className="text-[13px] text-foreground">{row.keyword}</span> },
          { key: "volume", header: t("columns.volume"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.volume ? formatNumber(row.volume) : "–"}</span> },
          { key: "place", header: t("columns.place"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.position ?? "–"}</span> },
          { key: "rival", header: t("columns.rival"), cell: (row) => <span className="text-[12px] text-secondary">{row.rival ? t("rivalAt", { rival: row.rival, place: row.rivalPosition ?? 0 }) : "–"}</span> },
        ]}
      />
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.page}
        cardHeader={<TableBar footer={pages.footer} noun="pages" title={t("pagesTitle")} />}
        empty={{ icon: <Compass className="h-8 w-8 text-muted/30" />, label: t("noPages") }}
        footer={pages.footer}
        columns={[
          { key: "page", header: t("columns.page"), cell: (row) => <span className="text-[13px] text-foreground">{row.kind === "GUIDES" ? ts("guidesDetail") : row.page}</span> },
          { key: "visitors", header: t("columns.visitors"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.people)}</span> },
          { key: "enquiries", header: t("columns.enquiries"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.enquiries)}</span> },
          { key: "per", header: t("columns.per"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.enquiries > 0 ? formatNumber(Math.round(row.people / row.enquiries)) : "–"}</span> },
        ]}
      />
    </>
  );
}
