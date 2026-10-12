"use client";

import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { Split } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { placeName } from "@/convex/utils/placeNames";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { SiteBarChart } from "../../../sites/_components/SiteCharts";
import { formatDay, formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useInsightsHref, useInsightsSite } from "../../_components/useInsights";

/**
 * One group of competing pages (insights-intelligence-plan.md phase 3): the
 * searches its pages share and how Google splits the clicks, which page brings
 * the enquiries, the page that should own each search and why — the place it
 * names, the kind of page, its words, Google's own choice (Anthony, 12 October
 * 2026: "location, keyword volume and other factors all make this up") — what
 * to do with every page, and which searches would bring more with a top-three
 * place, weighed by how often people search them. Its finding, when the week
 * wrote one, says what Hakken checks and when.
 */
export default function InsightsCompetingGroupPage() {
  const t = usePlatformTranslations("insights.cannibalisation");
  const href = useInsightsHref();
  const site = useInsightsSite();
  const key = useSearchParams().get("key") ?? "";
  const data = useQuery(api.insightCompeting.insightsCompetingGroup, { key, ...(site ? { siteId: site } : {}) });
  const [pageSearch, setPageSearch, pageTerm] = useSiteSearch("pq", "pages");
  const [searchSearch, setSearchSearch, searchTerm] = useSiteSearch("q", "searches");
  const group = data?.kept?.group;
  const pageMatches = wordStartMatcher(pageTerm.toLowerCase());
  const searchMatches = wordStartMatcher(searchTerm.toLowerCase());
  const pages = group?.pages.filter((row) => !pageMatches || pageMatches(row.path) || pageMatches(row.kind ?? ""));
  const searches = group?.searches.filter((row) => !searchMatches || searchMatches(row.search));
  const pagePager = useSitePager(data === undefined ? undefined : pages ?? [], { isLoading: data === undefined, table: "pages" });
  const searchPager = useSitePager(data === undefined ? undefined : searches ?? [], { isLoading: data === undefined, table: "searches" });
  const back = { href: href("cannibalisation"), label: t("back") };
  if (data === undefined) return <><DetailHeader back={back} icon={<Split className="h-5 w-5 text-brand" />} title={t("title")} /><div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (!data?.kept || !group) return <><DetailHeader back={back} icon={<Split className="h-5 w-5 text-brand" />} title={t("title")} /><HakkenEmptyState icon={Split} title={t("group.emptyTitle")} description={t("group.emptyDescription")} /></>;

  const kept = data.kept;
  const span = { from: formatDay(kept.from), to: formatDay(kept.to) };
  const owner = group.pages.find((page) => page.path === group.owner);
  const others = group.pages.filter((page) => page.path !== group.owner);
  // A group kept before each search had its own owner (12 October 2026) says what it said then, until the next week's read.
  const bySearch = group.searches.some((search) => search.owner !== undefined);
  const findingHref = kept.findingId ? href(`findings/${kept.findingId}`) : null;
  const pageHref = (path: string) => `${href("page-reviews/page")}${href("").includes("?") ? "&" : "?"}page=${encodeURIComponent(path)}`;
  const ownerSays = !bySearch
    ? [owner && owner.enquiries > 0 ? t("group.sees.owner", { owner: group.owner, enquiries: formatNumber(owner.enquiries) }) : t("group.sees.ownerClicks", { owner: group.owner })]
    : [
      group.decidedBy === "AGENT" && group.decidedWeek ? t("group.sees.agent", { day: formatDay(group.decidedWeek) }) : t("group.sees.ruleOnly"),
      t("group.sees.rule"),
      owner?.ownsVolume ? t("group.sees.leadVolume", { owner: group.owner, count: owner.owns ?? 0, volume: formatNumber(owner.ownsVolume) }) : t("group.sees.lead", { owner: group.owner, count: owner?.owns ?? 0 }),
    ];
  const says = [
    t("group.sees.split", { pages: group.pages.length, shared: formatNumber(group.shared), split: formatNumber(group.split), shown: formatNumber(group.shown), clicks: formatNumber(group.clicks), ...span }),
    ...ownerSays,
    ...(group.gainClicks !== null && group.gainClicks >= 1 ? [t(group.gainEnquiries !== null && group.gainEnquiries >= 0.5 ? "group.sees.gain" : "group.sees.gainClicks", { clicks: formatNumber(Math.round(group.gainClicks)), enquiries: formatNumber(Math.round(group.gainEnquiries ?? 0)) })] : []),
  ];
  const steps = [
    ...(bySearch ? group.pages : others).map((page) => ({
      words: page.decision === "OWNER" && bySearch ? t("group.do.KEEP", { page: page.path, count: page.owns ?? 0 }) : t(`group.do.${page.decision}`, { page: page.path, owner: page.into ?? group.owner }),
      link: t("group.seePage"),
      href: pageHref(page.path),
    })),
    ...(findingHref ? [{ words: data.finding?.checkOn ? t("group.checked", { day: formatDay(data.finding.checkOn) }) : t("group.finding"), link: t("group.seeFinding"), href: findingHref }] : []),
  ];
  const clickBars = group.pages.map((page) => ({ label: page.path, clicks: page.clicks }));
  const shownBars = group.pages.map((page) => ({ label: page.path, shown: page.shown }));
  const gainBars = group.searches.filter((search) => search.split && search.gain !== null && search.gain >= 0.5).sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0)).slice(0, 10).map((search) => ({ label: search.search, gain: Math.round((search.gain ?? 0) * 10) / 10 }));
  const decisionOf = (row: (typeof group.pages)[number]) => t(`decisions.${row.decision}`, { into: row.into ?? group.owner });
  // The specialist's own sentence where it chose another page; else each step of the rule that chose it.
  const whyOf = (row: (typeof group.searches)[number]) => row.reason || (row.why ?? []).map((why) => t(`why.${why}`, { place: row.place ? placeName(row.place) : "" })).join(" · ");
  const mono = (value: number | null, digits = 0) => <span className="font-mono text-[12px] text-foreground">{value === null ? "–" : digits > 0 ? value.toFixed(digits) : formatNumber(Math.round(value))}</span>;

  return (
    <>
      <DetailHeader back={back} icon={<Split className="h-5 w-5 text-brand" />} title={group.name} description={t("group.description", { count: group.pages.length, ...span })} pills={<StatusLabel tone={group.sure === "LIKELY" ? "info" : "neutral"}>{t(`sure.${group.sure}`)}</StatusLabel>} />
      <HakkenSees says={says} steps={steps} />
      <FigureRow>
        <Figure label={t("figures.split")} value={formatNumber(group.split)} detail={<span className="text-secondary">{t("figures.shared", { count: formatNumber(group.shared) })}</span>} />
        <Figure label={t("figures.shown")} value={formatNumber(group.shown)} detail={<span className="text-secondary">{t("figures.span", span)}</span>} />
        <Figure label={t("figures.clicks")} value={formatNumber(group.clicks)} detail={<span className="text-secondary">{t("figures.span", span)}</span>} />
        <Figure label={t("figures.enquiries")} value={formatNumber(group.enquiries)} detail={<span className="text-secondary">{group.recentBefore === null ? t("figures.recent", { count: group.recent }) : t("figures.recentAgainst", { count: group.recent, before: group.recentBefore })}</span>} />
      </FigureRow>
      <ChartCard title={t("group.charts.clicks")} hint={t("group.charts.clicksHint", span)} exportName={`${data.host}-group-clicks`} csv={() => toCsv([t("columns.page"), t("columns.clicks")], clickBars.map((row) => [row.label, row.clicks]))} enoughData={clickBars.length > 0}>
        <SiteBarChart horizontal data={clickBars} series={[{ key: "clicks", name: t("columns.clicks"), colour: CHART_SERIES_ORANGE }]} labels={(value) => formatNumber(value)} />
      </ChartCard>
      <ChartCard title={t("group.charts.shown")} hint={t("group.charts.shownHint", span)} exportName={`${data.host}-group-shown`} csv={() => toCsv([t("columns.page"), t("columns.shown")], shownBars.map((row) => [row.label, row.shown]))} enoughData={shownBars.length > 0}>
        <SiteBarChart horizontal data={shownBars} series={[{ key: "shown", name: t("columns.shown"), colour: CHART_SERIES_SLATE }]} labels={(value) => formatNumber(value)} />
      </ChartCard>
      <ChartCard title={t("group.charts.gain")} hint={t("group.charts.gainHint")} exportName={`${data.host}-group-gain`} csv={() => toCsv([t("columns.search"), t("columns.gain")], gainBars.map((row) => [row.label, row.gain]))} enoughData={gainBars.length > 0} emptyText={t("group.charts.gainEmpty")}>
        <SiteBarChart horizontal data={gainBars} series={[{ key: "gain", name: t("columns.gain"), colour: CHART_SERIES_ORANGE }]} labels={(value) => formatNumber(value)} />
      </ChartCard>
      <DataTable
        rows={pagePager.pageRows}
        rowKey={(row) => row.path}
        search={{ value: pageSearch, onChange: setPageSearch, placeholder: t("group.pageSearch") }}
        cardHeader={<TableBar footer={pagePager.footer} noun="results" title={t("group.pagesTitle")} actions={<ListDownload label={t("download")} fileName={`${data.host}-group-pages`} rows={pages} columns={[
          { header: t("columns.page"), value: (row) => row.path },
          { header: t("columns.kind"), value: (row) => row.kind ?? "" },
          { header: t("columns.decision"), value: decisionOf },
          { header: t("columns.why"), value: (row) => row.reason ?? "" },
          { header: t("columns.owns"), value: (row) => row.owns ?? "" },
          { header: t("columns.shown"), value: (row) => row.shown },
          { header: t("columns.clicks"), value: (row) => row.clicks },
          { header: t("columns.visits"), value: (row) => row.visits },
          { header: t("columns.enquiries"), value: (row) => row.enquiries },
        ]} />} />}
        empty={{ icon: <Split className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
        footer={pagePager.footer}
        columns={[
          { key: "page", header: t("columns.page"), cell: (row) => <span className="text-[13px] text-info">{row.path}</span> },
          { key: "kind", header: t("columns.kind"), cell: (row) => <TagLabel>{row.kind ?? t("notSorted")}</TagLabel> },
          { key: "decision", header: t("columns.decision"), cell: (row) => <span className="flex flex-col"><span className="text-[13px] text-foreground">{decisionOf(row)}</span>{row.reason ? <span className="text-[12px] text-secondary">{row.reason}</span> : null}</span> },
          { key: "owns", header: t("columns.owns"), align: "right", cell: (row) => mono(row.owns ?? null) },
          { key: "shown", header: t("columns.shown"), align: "right", cell: (row) => mono(row.shown) },
          { key: "clicks", header: t("columns.clicks"), align: "right", cell: (row) => mono(row.clicks) },
          { key: "searches", header: t("columns.searches"), align: "right", cell: (row) => mono(row.searches) },
          { key: "visits", header: t("columns.visits"), align: "right", cell: (row) => mono(row.visits) },
          { key: "enquiries", header: t("columns.enquiries"), align: "right", cell: (row) => mono(row.enquiries) },
        ]}
      />
      <DataTable
        rows={searchPager.pageRows}
        rowKey={(row) => row.search}
        search={{ value: searchSearch, onChange: setSearchSearch, placeholder: t("group.searchSearch") }}
        cardHeader={<TableBar footer={searchPager.footer} noun="results" title={t("group.searchesTitle")} actions={<ListDownload label={t("download")} fileName={`${data.host}-group-searches`} rows={searches} columns={[
          { header: t("columns.search"), value: (row) => row.search },
          { header: t("columns.volume"), value: (row) => row.volume ?? "" },
          { header: t("columns.place"), value: (row) => (row.position === null ? "" : row.position.toFixed(1)) },
          { header: t("columns.shown"), value: (row) => row.shown },
          { header: t("columns.clicks"), value: (row) => row.clicks },
          { header: t("columns.pagesShown"), value: (row) => row.pages.length },
          { header: t("columns.top"), value: (row) => row.top },
          { header: t("columns.searchOwner"), value: (row) => row.owner ?? "" },
          { header: t("columns.why"), value: whyOf },
          { header: t("columns.gain"), value: (row) => (row.gain === null ? "" : Math.round(row.gain * 10) / 10) },
        ]} />} />}
        empty={{ icon: <Split className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
        footer={searchPager.footer}
        columns={[
          { key: "search", header: t("columns.search"), cell: (row) => <span className="text-[13px] text-foreground">{row.search}</span> },
          { key: "volume", header: t("columns.volume"), align: "right", cell: (row) => mono(row.volume) },
          { key: "place", header: t("columns.place"), align: "right", cell: (row) => mono(row.position, 1) },
          { key: "shown", header: t("columns.shown"), align: "right", cell: (row) => mono(row.shown) },
          { key: "clicks", header: t("columns.clicks"), align: "right", cell: (row) => mono(row.clicks) },
          { key: "pagesShown", header: t("columns.pagesShown"), align: "right", cell: (row) => mono(row.pages.length) },
          { key: "top", header: t("columns.top"), cell: (row) => <span className="text-[13px] text-info">{row.top}</span> },
          { key: "owner", header: t("columns.searchOwner"), cell: (row) => <span className="flex flex-col"><span className="text-[13px] text-info">{row.owner ?? "–"}</span><span className="text-[12px] text-secondary">{whyOf(row)}</span></span> },
          { key: "gain", header: t("columns.gain"), align: "right", cell: (row) => mono(row.gain, 1) },
        ]}
      />
    </>
  );
}
