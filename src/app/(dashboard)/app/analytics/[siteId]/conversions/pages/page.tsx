"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { ConversionColumns } from "@/convex/googleAnalyticsConversionsMap";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CUT_COLUMN } from "../../../../sites/_components/SiteCells";
import { ListDownload } from "../../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../../sites/_components/useSiteSort";
import { AnalyticsGate } from "../../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../../_components/AnalyticsSees";
import { FigureCell, PageLink, TextFigure } from "../../../_components/AnalyticsCells";
import { formatPercent, pathOf } from "../../../_components/analyticsFormat";
import { backTarget } from "../../../_components/analyticsBack";
import { COLUMNS, useColumnName } from "../../../_components/ConversionsCards";
import { useEventName } from "../../../_components/useEventName";
import { periodWord, useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePageHref, usePeriod, type AnalyticsStatus } from "../../../_components/useAnalytics";

type Answer = FunctionReturnType<typeof api.googleAnalyticsConversionsMap.analyticsConversionsPages>;
type Row = Answer["rows"][number];

const SORTS: SiteSortColumns<Row, "name" | "visits" | "did" | "times" | "rate"> = {
  name: { value: (row) => row.title ?? pathOf(row.address), first: "asc" },
  visits: { value: (row) => row.visits, first: "desc" },
  did: { value: (row) => row.did, first: "desc" },
  times: { value: (row) => row.times, first: "desc" },
  rate: { value: (row) => (row.visits > 0 ? row.did / row.visits : 0), first: "desc" },
};

/**
 * The pages behind a square of the Conversions map (conversion-charts-plan.md,
 * agreed 2026-10-29): opened from a square, the landing pages in its column
 * on which a visit that made the conversion landed — each with its visits,
 * the visits that converted, the times it happened and the rate — the most
 * conversions first. A page opens its own screen and comes back here; back
 * returns to Conversions as it stood. Read from what the nightly runs keep.
 */
export default function ConversionPagesScreen() {
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return status ? (
    <AnalyticsGate status={status} siteId={siteId}>
      <Body status={status} />
    </AnalyticsGate>
  ) : null;
}

function Body({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.conversionsMap.pages");
  const tf = useTranslations("googleAnalytics.filters");
  const tm = useTranslations("googleAnalytics.menu");
  const params = useSearchParams();
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const hrefFor = useAnalyticsHref(args.siteId);
  const pageHref = usePageHref();
  const nameOf = useEventName();
  const event = params.get("event") ?? "";
  const by = (COLUMNS as readonly string[]).includes(params.get("by") ?? "") ? (params.get("by") as ConversionColumns) : "kind";
  const key = params.get("key") ?? "";
  const back = backTarget(params.get("from"));
  const answer = useQuery(api.googleAnalyticsConversionsMap.analyticsConversionsPages, status.connection?.newestDay && event ? { ...args, columns: by, key, eventName: event } : "skip");
  const choices = useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId: args.siteId });
  const columnName = useColumnName(by, [{ kind: key, name: answer?.name ?? null }], choices?.main ?? null);
  const [search, setSearch, term] = useSiteSearch();
  const rows = answer?.rows;
  const nameFor = (row: Row) => (row.address === "(not set)" ? t("noPage") : row.title ?? pathOf(row.address));
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((row) => !matches || matches(nameFor(row)) || matches(pathOf(row.address)));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "did", name: nameFor });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });
  const periodName = tf(`periods.${periodWord(period)}`).toLowerCase();
  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back ? { label: tm("conversions"), href: `/app/analytics/${args.siteId}/${back.path}` } : { label: tm("conversions"), href: hrefFor("conversions") }}
        icon={<FileText className="h-5 w-5 text-brand" />}
        title={t("title", { event: nameOf(event), kind: columnName(key) })}
        description={t("description", { period: periodName })}
      />
      <AnalyticsSees screen="conversionPages" seen={answer?.seen} currency={status.connection?.currency} />
      {answer?.everyDevice ? <Notice>{t("everyDevice")}</Notice> : null}
      {answer?.cut ? <Notice>{t("cut", { count: answer.rows.length })}</Notice> : null}
      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.page}
        search={{ value: search, onChange: setSearch, placeholder: t("find") }}
        cardHeader={
          <TableBar
            footer={pager.footer}
            noun="pages"
            title={t("table")}
            actions={rows ? (
              <ListDownload
                label={t("download")}
                fileName={`${status.host}-google-analytics-conversion-pages`}
                rows={sorted ?? []}
                columns={[
                  { header: t("page"), value: (row) => row.address },
                  { header: t("visits"), value: (row) => row.visits },
                  { header: t("did"), value: (row) => row.did },
                  { header: t("times"), value: (row) => row.times },
                  { header: `${t("rate")} (%)`, value: (row) => (row.visits > 0 ? Math.round((row.did / row.visits) * 1000) / 10 : 0) },
                ]}
              />
            ) : undefined}
          />
        }
        sort={tableSort}
        empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: answer?.collecting ? t("none") : term ? t("noMatch") : t("none") }}
        footer={pager.footer}
        columns={[
          {
            key: "name",
            header: t("page"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => (row.address === "(not set)"
              ? <span className="text-[13px] text-secondary">{t("noPage")}</span>
              : <PageLink address={row.address} title={row.title} href={pageHref(row.page)} />),
          },
          { key: "visits", header: t("visits"), sortable: true, align: "right", cell: (row) => <FigureCell value={row.visits} quiet /> },
          { key: "did", header: t("did"), sortable: true, align: "right", cell: (row) => <FigureCell value={row.did} /> },
          { key: "times", header: t("times"), sortable: true, align: "right", cell: (row) => <FigureCell value={row.times} quiet /> },
          { key: "rate", header: t("rate"), sortable: true, align: "right", cell: (row) => <TextFigure text={row.visits > 0 ? formatPercent(row.did / row.visits) : "–"} /> },
        ]}
      />
    </div>
  );
}
