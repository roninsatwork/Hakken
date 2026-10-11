"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Gauge } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { fastEnough, missingStructuredData, slowestPart, type Speed } from "@/convex/utils/moneyPageChecks";
import { formatDay, formatNumber } from "../../_components/siteFormat";
import { ListDownload } from "../../_components/SiteDownloads";
import { useSitePager } from "../../_components/useSitePagedTable";
import { useSiteSearch } from "../../_components/useSiteParam";

/**
 * The money pages in the site audit, for the audit page to draw (docs/plans/active/insights-analyst-plan.md
 * §4.4, phase 8, drawn as the VisAudit board): how fast each page that brings
 * enquiries is for real visitors — Google's own Chrome figures on phones,
 * against its three thresholds — the structured data it carries against what
 * its kind should, and the pages no other page links to. From the weekly
 * money page checks; Insights' Technical SEO specialist reads the same.
 */
export function useMoneyPagesAudit(siteId: Id<"companyWebsites">, host: string) {
  const t = useTranslations("sites.audit.money");
  const data = useQuery(api.moneyPageChecks.siteMoneyPages, { siteId });
  const [search, setSearch, term] = useSiteSearch("pq", "money");
  const matches = wordStartMatcher(term.toLowerCase());
  const rows = data?.pages.filter((row) => !matches || matches(row.page));
  const pages = useSitePager(data ? rows : undefined, { isLoading: data === undefined, table: "money" });
  const timed = data?.pages.filter((row) => fastEnough(row.speed) !== null) ?? [];
  const fast = timed.filter((row) => fastEnough(row.speed) === true);
  const slowest = [...timed].sort((a, b) => (b.speed?.lcpMs ?? 0) - (a.speed?.lcpMs ?? 0))[0];
  const read = data?.pages.filter((row) => row.structured !== null) ?? [];
  const complete = read.filter((row) => missingStructuredData(row.kind, row.structured ?? []).length === 0);
  const seconds = (ms: number | null | undefined) => (ms === null || ms === undefined ? "–" : t("seconds", { value: (Math.round(ms / 100) / 10).toFixed(1) }));
  const speedWord = (speed: Speed | null) => {
    const fine = fastEnough(speed);
    if (fine === null) return <StatusLabel tone="neutral">{t("speed.none")}</StatusLabel>;
    if (fine) return <StatusLabel tone="success">{t("speed.fast")}</StatusLabel>;
    return <StatusLabel tone="warning">{t(`speed.${slowestPart(speed) ?? "MAIN_CONTENT"}`)}</StatusLabel>;
  };
  const markup = (row: { kind: string | null; structured: string[] | null }) => {
    if (row.structured === null) return t("markup.unread");
    const missing = missingStructuredData(row.kind, row.structured);
    if (missing.length > 0) return t("markup.missing", { kinds: missing.map((kind) => t(`markup.kinds.${kind}`)).join(", ") });
    return row.structured.length > 0 ? t("markup.has", { count: row.structured.length }) : t("markup.none");
  };

  // The figures and notices above the table; the page draws the table itself, under its own header.
  const figures = data === null ? null : (
    <>
      {data && data.pages.length === 0 ? <Notice>{t("notYet")}</Notice> : null}
      {data && data.pages.length > 0 && timed.length === 0 ? <Notice>{t("noSpeed")}</Notice> : null}
      <FigureRow>
        <Figure label={t("figures.fast")} value={timed.length > 0 ? t("of", { a: fast.length, b: timed.length }) : "–"} detail={<span className="text-secondary">{t("figures.fastDetail")}</span>} />
        <Figure label={t("figures.slowest")} value={slowest ? seconds(slowest.speed?.lcpMs) : "–"} detail={<span className="text-secondary">{slowest ? t("figures.slowestDetail", { page: slowest.page }) : t("figures.waiting")}</span>} />
        <Figure label={t("figures.markup")} value={read.length > 0 ? t("of", { a: complete.length, b: read.length }) : "–"} detail={<span className="text-secondary">{t("figures.markupDetail")}</span>} />
        <Figure label={t("figures.orphans")} value={data?.orphans === null || data?.orphans === undefined ? "–" : formatNumber(data.orphans)} detail={<span className="text-secondary">{data?.orphanPages[0] ? t("figures.orphansDetail", { page: data.orphanPages[0] }) : t("figures.orphansNone")}</span>} />
      </FigureRow>
    </>
  );
  const link = data === null ? null : <Link href="/app/insights/findings" className="w-fit text-[13px] text-secondary hover:text-foreground">{t("seeInsights")}</Link>;
  return {
    shown: data !== null,
    figures,
    link,
    pager: pages,
    search: { value: search, onChange: setSearch, placeholder: t("search") },
    title: t("tableTitle", { count: rows?.length ?? 0, day: data?.checkedAt ? formatDay(new Date(data.checkedAt).toISOString().slice(0, 10)) : "–" }),
    download: <ListDownload label={t("download")} fileName={`${host}-money-pages`} rows={rows} columns={[{ header: t("columns.page"), value: (row) => row.page }, { header: t("columns.mainContent"), value: (row) => row.speed?.lcpMs ?? "" }, { header: t("columns.tap"), value: (row) => row.speed?.inpMs ?? "" }, { header: t("columns.shifts"), value: (row) => row.speed?.cls ?? "" }, { header: t("columns.markup"), value: markup }]} />,
    empty: { icon: <Gauge className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("notYet") },
    columns: [
      // A page by its title over its address (I41).
      { key: "page", header: t("columns.page"), cell: (row: MoneyRow) => <span className="flex min-w-0 flex-col">{row.title ? <span className="truncate text-[13px] text-foreground">{row.title.split("|")[0].trim()}</span> : null}<span className="truncate text-[12px] text-secondary">{row.page}</span></span> },
      { key: "mainContent", header: t("columns.mainContent"), align: "right" as const, cell: (row: MoneyRow) => <span className="font-mono text-[12px] text-foreground">{seconds(row.speed?.lcpMs)}</span> },
      { key: "tap", header: t("columns.tap"), align: "right" as const, cell: (row: MoneyRow) => <span className="font-mono text-[12px] text-secondary">{row.speed?.inpMs === null || row.speed?.inpMs === undefined ? "–" : t("ms", { value: formatNumber(row.speed.inpMs) })}</span> },
      { key: "shifts", header: t("columns.shifts"), align: "right" as const, cell: (row: MoneyRow) => <span className="font-mono text-[12px] text-secondary">{row.speed?.cls === null || row.speed?.cls === undefined ? "–" : row.speed.cls.toFixed(2)}</span> },
      { key: "markup", header: t("columns.markup"), cell: (row: MoneyRow) => <span className="text-[12px] text-secondary">{markup(row)}</span> },
      { key: "speed", header: t("columns.speed"), cell: (row: MoneyRow) => speedWord(row.speed) },
    ],
  };
}

type MoneyRow = { page: string; title?: string | null; kind: string | null; speed: Speed | null; structured: string[] | null };
