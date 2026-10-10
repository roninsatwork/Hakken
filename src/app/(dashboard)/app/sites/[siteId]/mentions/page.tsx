"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { AtSign } from "lucide-react";
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
import { SiteChartCard } from "../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../_components/SiteCharts";
import { ExternalUrlCell } from "../../_components/SiteCells";
import { formatDay, formatMonth, toCsv } from "../../_components/siteFormat";
import { ListDownload } from "../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../_components/useSite";
import { WORTH_ASKING } from "@/convex/utils/sees/mentions";
import { SiteSees } from "../../_components/SiteSees";
import { useSitePager } from "../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../_components/useSiteSort";
import { FigureCell } from "../local/_components/LocalParts";

type Row = { url: string; host: string; title: string | null; day: string; kind: number; tone: number; strength: number; linked: number };

/** As `webMentions.ts` keeps them. */
const KINDS = ["OTHER", "NEWS", "BLOG", "FORUM", "SHOP", "ORGANISATION"] as const;
const TONES = ["NEUTRAL", "WELL", "BADLY"] as const;
const KIND_FILTERS = ["NEWS", "BLOG", "FORUM", "SHOP", "ORGANISATION"] as const;
const TONE_FILTERS = ["WELL", "NEUTRAL", "BADLY"] as const;
const LINKS = ["linked", "unlinked"] as const;
const TONE_TONE = { WELL: "success", NEUTRAL: "neutral", BADLY: "danger" } as const;
const DAY_MS = 86_400_000;
const SORTS: SiteSortColumns<Row, "date" | "strength"> = {
  date: { value: (row) => row.day, first: "desc" },
  strength: { value: (row) => row.strength, first: "desc" },
};
const urlOf = (row: Row) => row.url;
const pathOf = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`;
  } catch {
    return url;
  }
};

/**
 * Discovery → Web mentions → All mentions (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, step 6, D13, D18, D20; drawn as "Web mentions · All
 * mentions"): the pages across the web naming the business, how they speak
 * of it and whether they link to it — pages about another of the name left
 * out by the AI check.
 */
export default function WebMentionsPage() {
  const t = useTranslations("sites.mentions");
  const { platformName } = useSystemSettings();
  const siteId = useSiteId();
  const site = useSite();
  const data = useQuery(api.siteWebMentions.webMentions, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [tone, setTone] = useSiteParam<(typeof TONE_FILTERS)[number] | "">("tone", "", TONE_FILTERS);
  const [kind, setKind] = useSiteParam<(typeof KIND_FILTERS)[number] | "">("kind", "", KIND_FILTERS);
  const [link, setLink] = useSiteParam<(typeof LINKS)[number] | "">("link", "", LINKS);

  const all = (data?.rows ?? []) as Row[];
  const matches = wordStartMatcher(term);
  const rows = data ? all.filter((row) => (!tone || TONES[row.tone] === tone) && (!kind || KINDS[row.kind] === kind) && (!link || (link === "linked") === (row.linked === 1)) && (!matches || matches(row.title, row.host))) : undefined;
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "date", name: urlOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });
  // The day the page opened: its last 30 days.
  const [now] = useState(() => Date.now());
  const since = (days: number) => new Date(now - days * DAY_MS).toISOString().slice(0, 10);
  const last = all.filter((row) => row.day >= since(30));
  const before = all.filter((row) => row.day >= since(60) && row.day < since(30));
  const well = last.filter((row) => row.tone === 1).length;
  const badly = last.filter((row) => row.tone === 2);
  const badlyKinds = [...new Set(badly.map((row) => KINDS[row.kind]))];
  const months = Array.from({ length: 12 }, (_, at) => {
    const date = new Date(now);
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - (11 - at));
    return date.toISOString().slice(0, 7);
  });
  const chartRows = months.map((month) => {
    const of = all.filter((row) => row.day.startsWith(month));
    return { label: formatMonth(month), well: of.filter((row) => row.tone === 1).length, neutral: of.filter((row) => row.tone === 0).length, badly: of.filter((row) => row.tone === 2).length };
  });
  const linkWords = (row: Row) => (row.linked ? t("link.linked") : row.strength >= WORTH_ASKING && row.tone !== 2 ? t("link.ask") : t("link.none"));
  const fileBase = `${site?.host ?? "site"}-web-mentions`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<AtSign className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />
      <SiteSees screen="mentions" seen={data?.seen} />

      {data ? (
        <FigureRow>
          <Figure label={t("figures.new")} emphasis value={last.length} detail={<><Change by={last.length - before.length} arrow={last.length >= before.length ? "up" : "down"} /> <span className="text-secondary">{t("figures.monthBefore")}</span></>} />
          <Figure label={t("figures.well")} value={last.length > 0 ? `${Math.round((well / last.length) * 100)}%` : "–"} detail={<span className="text-secondary">{t("figures.wellDetail", { count: well, of: last.length })}</span>} />
          <Figure label={t("figures.badly")} value={badly.length} detail={<span className="text-secondary">{badlyKinds.length === 1 ? t("figures.badlyOn", { kind: t(`kindsMany.${badlyKinds[0]}`) }) : t("figures.badlyDetail")}</span>} />
          <Figure label={t("figures.noLink")} value={last.filter((row) => row.linked === 0).length} detail={<span className="text-secondary">{t("figures.noLinkDetail")}</span>} />
        </FigureRow>
      ) : null}
      <Notice>{t("notice", { names: (data?.names ?? []).map((name) => `"${name}"`).join(t("and")), platformName })}</Notice>

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${fileBase}-a-month`}
        csv={() => toCsv([t("chartMonth"), t("tones.WELL"), t("tones.NEUTRAL"), t("tones.BADLY")], chartRows.map((row) => [row.label, row.well, row.neutral, row.badly]))}
        enoughData={all.length > 0}
      >
        <SiteBarChart
          stacked
          data={chartRows}
          series={[
            { key: "well", name: t("chartWell"), colour: SITE_SERIES_COLOURS[0] },
            { key: "neutral", name: t("chartNeutral"), colour: SITE_SERIES_COLOURS[1] },
            { key: "badly", name: t("chartBadly"), colour: SITE_SERIES_COLOURS[2] },
          ]}
        />
      </SiteChartCard>

      <DataTable
        rows={pager.pageRows}
        rowKey={urlOf}
        onRowClick={(row) => window.open(row.url, "_blank", "noopener,noreferrer")}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("toneFilter"), choice: tone ? t(`tones.${tone}`) : null }} value={tone} onChange={(value) => setTone(value as (typeof TONE_FILTERS)[number] | "")}>
              <option value="">{t("anyTone")}</option>
              {TONE_FILTERS.map((entry) => <option key={entry} value={entry}>{t(`tones.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: t("kindFilter"), choice: kind ? t(`kindsMany.${kind}`) : null }} value={kind} onChange={(value) => setKind(value as (typeof KIND_FILTERS)[number] | "")}>
              <option value="">{t("everyKind")}</option>
              {KIND_FILTERS.map((entry) => <option key={entry} value={entry}>{t(`kindsMany.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: t("linkFilter"), choice: link ? t(`links.${link}`) : null }} value={link} onChange={(value) => setLink(value as (typeof LINKS)[number] | "")}>
              <option value="">{t("linkedOrNot")}</option>
              {LINKS.map((entry) => <option key={entry} value={entry}>{t(`links.${entry}`)}</option>)}
            </Select>
          </>
        }
        cardHeader={<TableBar footer={pager.footer} noun="mentions" actions={<ListDownload fileName={fileBase} rows={sorted ?? []} columns={[{ header: t("columns.date"), value: (row) => row.day }, { header: t("columns.page"), value: (row) => row.title }, { header: t("columns.address"), value: (row) => row.url }, { header: t("columns.kind"), value: (row) => t(`kinds.${KINDS[row.kind]}`) }, { header: t("columns.tone"), value: (row) => t(`toneOne.${TONES[row.tone]}`) }, { header: t("columns.link"), value: linkWords }, { header: t("columns.strength"), value: (row) => row.strength }]} />}><span className="text-[13px] text-secondary">{t("inTwelveMonths")}</span></TableBar>}
        empty={{ icon: <AtSign className="h-8 w-8 text-muted/30" />, label: term || tone || kind || link ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "date", header: t("columns.date"), sortable: true, cell: (row) => <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-secondary">{formatDay(row.day)}</span> },
          {
            key: "page",
            header: t("columns.page"),
            cell: (row) => (
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] text-foreground">{row.title ?? pathOf(row.url)}</span>
                <ExternalUrlCell url={row.url} label={pathOf(row.url)} cut />
              </span>
            ),
          },
          { key: "kind", header: t("columns.kind"), cell: (row) => <TagLabel>{t(`kinds.${KINDS[row.kind]}`)}</TagLabel> },
          { key: "tone", header: t("columns.tone"), cell: (row) => <StatusLabel tone={TONE_TONE[TONES[row.tone]]}>{t(`toneOne.${TONES[row.tone]}`)}</StatusLabel> },
          { key: "link", header: t("columns.link"), cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{linkWords(row)}</span> },
          { key: "strength", header: t("columns.strength"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.strength} /> },
        ]}
      />
    </div>
  );
}
