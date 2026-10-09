"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { RecordLinkCell } from "../../../_components/SiteCells";
import { formatNumber } from "../../../_components/siteFormat";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { FigureCell } from "../../local/_components/LocalParts";

type Row = { keyword: string; volume: number | null; position: number | null; overview: boolean; quotesYou: boolean; quotes: string[]; yourPage: string | null };

const QUOTES = ["no", "yes"] as const;
const SORTS: SiteSortColumns<Row, "search" | "volume" | "position"> = {
  search: { value: (row) => row.keyword, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  position: { value: (row) => row.position, first: "asc" },
};
const keywordOf = (row: Row) => row.keyword;
/** A page in Google's top ten that the overview leaves out is a gap. */
const TOP = 10;

/**
 * Discovery → Brand radar → AI Overview gaps (docs/plans/active/discovery-
 * local-reputation-ai-plan.md, step 3, D18; drawn as "Brand radar · AI
 * Overview gaps"): the tracked searches where the website ranks on Google
 * but the AI Overview above every result quotes someone else — read from the
 * Google checks already made, so it costs nothing more.
 */
export default function AiOverviewGapsPage() {
  const t = useTranslations("sites.aiApps.gaps");
  const { platformName } = useSystemSettings();
  const siteId = useSiteId();
  const site = useSite();
  const recordHref = useSiteRecordHref(siteId);
  const data = useQuery(api.siteAiOverviewGaps.overviewGaps, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [quotes, setQuotes] = useSiteParam<(typeof QUOTES)[number] | "">("quotes", "", QUOTES);

  const matches = wordStartMatcher(term);
  const withOverview = (data?.rows ?? []).filter((row) => row.overview);
  const rows = data ? withOverview.filter((row) => (!quotes || row.quotesYou === (quotes === "yes")) && (!matches || matches(row.keyword))) : undefined;
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "volume", name: keywordOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });
  const quoted = withOverview.filter((row) => row.quotesYou).length;
  const gaps = withOverview.filter((row) => !row.quotesYou && row.position !== null && row.position <= TOP);
  const behind = gaps.reduce((sum, row) => sum + (row.volume ?? 0), 0);
  const fileBase = `${site?.host ?? "site"}-ai-overview-gaps`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Sparkles className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={site ? <TagLabel>{t("where", { place: site.placeLabel })}</TagLabel> : undefined}
      />

      {data ? (
        <FigureRow>
          <Figure label={t("figures.overview")} value={t("of", { count: withOverview.length, of: data.searches })} detail={<span className="text-secondary">{t("figures.overviewDetail")}</span>} />
          <Figure
            label={t("figures.quotes")}
            value={quoted}
            detail={data.quotedBefore === null ? <span className="text-secondary">{t("figures.noMonthBefore")}</span> : <><Change by={quoted - data.quotedBefore} arrow={quoted >= data.quotedBefore ? "up" : "down"} /> <span className="text-secondary">{t("figures.monthBefore")}</span></>}
          />
          <Figure label={t("figures.gaps", { top: TOP })} emphasis value={gaps.length} detail={<span className="text-secondary">{t("figures.gapsDetail")}</span>} />
          <Figure label={t("figures.behind")} value={formatNumber(behind)} detail={<span className="text-secondary">{t("figures.behindDetail")}</span>} />
        </FigureRow>
      ) : null}
      <Notice>{t("notice", { platformName })}</Notice>

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.keyword}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <Select chip={{ label: t("quotesFilter"), choice: quotes ? t(`quotesFilters.${quotes}`) : null }} value={quotes} onChange={(value) => setQuotes(value as (typeof QUOTES)[number] | "")}>
            <option value="">{t("either")}</option>
            {QUOTES.map((entry) => <option key={entry} value={entry}>{t(`quotesFilters.${entry}`)}</option>)}
          </Select>
        }
        cardHeader={<TableBar footer={pager.footer} noun="searches" actions={<ListDownload fileName={fileBase} rows={sorted ?? []} columns={[{ header: t("columns.search"), value: (row) => row.keyword }, { header: t("columns.volume"), value: (row) => row.volume }, { header: t("columns.position"), value: (row) => row.position }, { header: t("columns.overview"), value: (row) => (row.quotesYou ? t("quotesYou") : t("notQuoted")) }, { header: t("columns.quotes"), value: (row) => row.quotes.join(" · ") }, { header: t("columns.page"), value: (row) => row.yourPage }]} />}><span className="text-[13px] text-secondary">{t("withOverview")}</span></TableBar>}
        empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: term || quotes ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "search", header: t("columns.search"), sortable: true, cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          { key: "volume", header: t("columns.volume"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
          { key: "position", header: t("columns.position"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.position} /> },
          { key: "overview", header: t("columns.overview"), cell: (row) => <StatusLabel tone={row.quotesYou ? "success" : "warning"}>{row.quotesYou ? t("quotesYou") : t("notQuoted")}</StatusLabel> },
          { key: "quotes", header: t("columns.quotes"), cell: (row) => <span className="text-[12px] text-secondary">{row.quotes.join(" · ") || "–"}</span> },
          { key: "page", header: t("columns.page"), cell: (row) => (row.yourPage ? <RecordLinkCell href={recordHref({ kind: "page", page: row.yourPage })} className="text-[12px] text-info">{row.yourPage}</RecordLinkCell> : <span className="text-[12px] text-muted">–</span>) },
        ]}
      />
    </div>
  );
}
