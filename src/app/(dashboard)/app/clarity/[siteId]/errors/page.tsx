"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { PageLink } from "../../../analytics/_components/AnalyticsCells";
import { SiteBarChart } from "../../../sites/_components/SiteCharts";
import { datedRow } from "../../../sites/_components/datedRows";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { formatDay, formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { Notice } from "@/src/ui/components/screens/Notice";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { Judged, Moved, wayOf, WatchLink, mono, percent, quiet, tooFew, useBeforeWords, useCountedWords, useDeviceName, usePeriodWords, useWaitingWords } from "../../_components/ClarityParts";
import { useClarityArgs, useClarityPageHref, useClarityStatus } from "../../_components/useClarity";

type ErrorRow = FunctionReturnType<typeof api.clarityScreens.clarityErrors>["pages"][number];
type Sort = "page" | "visits" | "errors" | "share" | "clicks";
const SORTS: SiteSortColumns<ErrorRow, Sort> = {
  page: { value: (row) => row.line.page, first: "asc" },
  visits: { value: (row) => row.line.now.visits, first: "desc" },
  errors: { value: (row) => row.line.now.errors, first: "desc" },
  share: { value: (row) => row.line.now.shares.errors, first: "desc" },
  clicks: { value: (row) => row.line.now.errorClicks, first: "desc" },
};
const nameOf = (row: ErrorRow) => row.line.page;

/**
 * Clarity's Errors (docs/plans/active/agents-and-clarity-plan.md, Part 4,
 * CS6, drawn as the Errors board): where pages break for visitors —
 * JavaScript errors, and clicks on something that then failed. Four figures
 * against the same days before, the visits with an error day by day, errors
 * by browser as a share of each browser's visits, and the pages with errors,
 * each with the browser and device it mostly happens on and a recording of it
 * to watch in Clarity.
 */
export default function ClarityErrorsPage() {
  const t = useTranslations("clarity.errors");
  const tp = useTranslations("common.periods");
  const tc = useTranslations("clarity.common");
  const router = useRouter();
  const status = useClarityStatus();
  const args = useClarityArgs();
  const pageHref = useClarityPageHref();
  const deviceName = useDeviceName();
  const periodWords = usePeriodWords();
  const countedWords = useCountedWords();
  const beforeWords = useBeforeWords();
  const waitingWords = useWaitingWords();
  const data = useQuery(api.clarityScreens.clarityErrors, args);
  const [search, setSearch, settled] = useSiteSearch();
  const [browser, setBrowser] = useSiteParam<string>("browser", "");
  const matches = settled ? wordStartMatcher(settled.toLowerCase()) : null;
  const listed = data?.pages.filter((row) => (!matches || matches(row.line.page)) && (!browser || row.mostly?.browser === browser));
  const { rows, tableSort } = useSiteSortedList(listed, SORTS, { opening: "errors", name: nameOf });
  const pager = useSitePager(rows, { isLoading: data === undefined });
  const header = <PageHeader icon={<Bug className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;

  const { now, before, period } = data;
  const chosen = args.period;
  // Errors are counted from the first day they were read: the days kept before hold none.
  const span = countedWords(period, chosen, data.byDay);
  const against = beforeWords(period, chosen);
  const waiting = waitingWords(period, chosen);
  const where = (mostly: ErrorRow["mostly"]) => (mostly ? tc("browserOn", { browser: mostly.browser, device: deviceName(mostly.device).toLowerCase() }) : null);
  const errorDays = data.byDay.filter((day) => (day.errors ?? 0) > 0).length;
  const top = data.pages[0];
  const judgedBrowsers = (data.browsers?.rows ?? []).filter((row) => !tooFew(row.now.visits) && row.now.errors > 0);
  const worstBrowser = [...judgedBrowsers].sort((a, b) => (b.now.shares.errors ?? 0) - (a.now.shares.errors ?? 0))[0];
  const says = now.errors + now.errorClicks === 0
    ? [t("sees.none", { span })]
    : [
      t("sees.count", { count: now.errors, span, change: before ? t("sees.change", { count: Math.abs(now.errors - before.errors), way: now.errors >= before.errors ? "more" : "fewer", than: tp(`than.${chosen}`) }) : "" }),
      ...(top ? [t(top.mostly ? "sees.topOn" : "sees.top", { page: top.line.page, count: top.line.now.errors, where: where(top.mostly) ?? "", clicks: top.line.now.errorClicks })] : []),
      ...(worstBrowser ? [t("sees.browser", { browser: worstBrowser.name, errors: worstBrowser.now.errors, visits: worstBrowser.now.visits })] : []),
    ];
  const steps: HakkenSeesStep[] = top
    ? [{
      words: t(top.line.now.errorClicks > 0 ? "do.fixClicks" : "do.fix", { page: top.line.page, where: where(top.mostly) ?? tc("everywhere") }),
      link: top.recording ? tc("watchIt") : t("do.seePage"),
      href: top.recording ?? pageHref(top.line.page),
      external: Boolean(top.recording),
    }]
    : [];
  const errorsByDay = data.byDay.map((day) => datedRow({ day: day.day }, { errors: day.errors }));
  const browserRows = (data.browsers?.rows ?? []).map((row) => ({ label: row.name, share: row.now.shares.errors ?? 0, visits: row.now.visits, errors: row.now.errors }));
  const browsers = [...new Set(data.pages.flatMap((row) => (row.mostly ? [row.mostly.browser] : [])))].sort();

  return (
    <>
      {header}
      {waiting ? <Notice>{waiting}</Notice> : null}
      {period.countedFrom ? <Notice>{tc("countedFrom", { day: formatDay(period.countedFrom) })}</Notice> : null}
      <HakkenSees says={says} steps={steps} />
      <FigureRow columns={4}>
        <Figure label={t("figures.visits")} value={formatNumber(now.errors)} detail={<span className="flex flex-col">{before ? <Moved by={now.errors - before.errors} neutral>{tc("plainOn", { way: wayOf(now.errors - before.errors), value: Math.abs(now.errors - before.errors), against })}</Moved> : <span className="text-muted">{against}</span>}<span className="text-secondary">{t("figures.ofVisits", { share: percent(now.shares.errors ?? 0) })}</span></span>} />
        <Figure label={t("figures.clicks")} value={formatNumber(now.errorClicks)} detail={<span className="flex flex-col">{before ? <Moved by={now.errorClicks - before.errorClicks} neutral>{tc("plainOn", { way: wayOf(now.errorClicks - before.errorClicks), value: Math.abs(now.errorClicks - before.errorClicks), against })}</Moved> : null}<span className="text-secondary">{t("figures.clicksDetail")}</span></span>} />
        <Figure label={t("figures.pages")} value={formatNumber(data.pages.length)} detail={<span className="text-secondary">{t("figures.pagesDetail", { count: data.pagesWithVisits })}</span>} />
        <Figure label={t("figures.days")} value={formatNumber(errorDays)} detail={<span className="text-secondary">{t("figures.daysDetail", { count: data.byDay.filter((day) => day.errors !== null && day.visits > 0).length })}</span>} />
      </FigureRow>

      <ChartCard
        title={t("dayChart.title")}
        hint={t("dayChart.hint", { span })}
        exportName={`${status?.host ?? "site"}-clarity-errors-by-day`}
        csv={() => toCsv(["day", t("figures.visits")], data.byDay.map((day) => [day.day, day.errors]))}
        enoughData={errorsByDay.length > 0}
        emptyText={t("dayChart.empty")}
      >
        <SiteBarChart data={errorsByDay} series={[{ key: "errors", name: t("figures.visits"), colour: CHART_SERIES_ORANGE }]} labels={(value) => (value > 0 ? String(value) : null)} updateKey={false} />
      </ChartCard>

      <ChartCard
        title={t("browserChart.title")}
        hint={data.browsers ? t("browserChart.hint", { span: periodWords({ ...period, now: period.now ? { ...period.now, days: data.browsers.days } : null }, chosen) }) : t("browserChart.hintPlain")}
        exportName={`${status?.host ?? "site"}-clarity-errors-by-browser`}
        csv={() => toCsv([tc("columns.browser"), tc("columns.visits"), t("figures.visits"), tc("columns.ofItsVisits")], browserRows.map((row) => [row.label, row.visits, row.errors, row.share]))}
        enoughData={browserRows.length > 0}
        emptyText={data.browsers ? t("browserChart.empty") : t("browserChart.coming")}
      >
        <SiteBarChart
          horizontal
          data={browserRows}
          series={[{ key: "share", name: t("figures.visits"), colour: CHART_SERIES_ORANGE }]}
          faded={(row) => tooFew(Number(row.visits))}
          labels={(value, _key, row) => tc("shareOf", { share: value.toFixed(1), errors: Number(row.errors), visits: Number(row.visits) })}
          formatScale={(value) => `${value}%`}
          updateKey={false}
        />
      </ChartCard>

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.line.page}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <Select chip={{ label: tc("columns.browser"), choice: browser || null }} value={browser} onChange={setBrowser} aria-label={tc("columns.browser")}>
            <option value="">{t("everyBrowser")}</option>
            {browsers.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        }
        cardHeader={
          <TableBar
            footer={pager.footer}
            noun="pages"
            actions={
              <ListDownload
                label={tc("downloadCsv")}
                fileName={`${status?.host ?? "site"}-clarity-errors`}
                rows={rows}
                columns={[
                  { header: tc("columns.page"), value: (row) => row.line.page },
                  { header: tc("columns.visits"), value: (row) => row.line.now.visits },
                  { header: tc("columns.withError"), value: (row) => row.line.now.errors },
                  { header: tc("columns.ofItsVisits"), value: (row) => row.line.now.shares.errors },
                  { header: tc("columns.clicksFailed"), value: (row) => row.line.now.errorClicks },
                  { header: tc("columns.mostlyOn"), value: (row) => where(row.mostly) ?? "" },
                ]}
              />
            }
          >
            {data.browsers && data.browsers.cutDays > 0 ? <span className="text-[12px] text-secondary">{tc("cutBrowsers", { count: data.browsers.cutDays })}</span> : null}
          </TableBar>
        }
        empty={{ icon: <Bug className="h-8 w-8 text-muted/30" />, label: settled || browser ? t("noMatch") : t("empty", { span }) }}
        footer={pager.footer}
        sort={tableSort}
        onRowClick={(row) => router.push(pageHref(row.line.page))}
        columns={[
          { key: "page", header: tc("columns.page"), sortable: true, className: "w-[36%] max-w-0", cell: (row) => <PageLink address={row.line.page} href={pageHref(row.line.page)} title={row.line.title ?? undefined} /> },
          { key: "visits", header: tc("columns.visits"), sortable: true, align: "right", cell: (row) => mono(formatNumber(row.line.now.visits)) },
          { key: "errors", header: tc("columns.withError"), sortable: true, align: "right", cell: (row) => mono(formatNumber(row.line.now.errors)) },
          { key: "share", header: tc("columns.ofItsVisits"), sortable: true, align: "right", cell: (row) => <Judged text={percent(row.line.now.shares.errors)} visits={row.line.now.visits} /> },
          { key: "clicks", header: tc("columns.clicksFailed"), sortable: true, align: "right", cell: (row) => mono(formatNumber(row.line.now.errorClicks), "text-secondary") },
          { key: "mostly", header: tc("columns.mostlyOn"), cell: (row) => (row.mostly ? quiet(where(row.mostly)) : <NoFigure />) },
          { key: "watch", header: "", align: "right", cell: (row) => (row.recording ? <WatchLink href={row.recording} /> : <NoFigure />) },
        ]}
      />
    </>
  );
}
