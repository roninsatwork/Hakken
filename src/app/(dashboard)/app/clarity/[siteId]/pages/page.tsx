"use client";

import { useConvex } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CLARITY_FEW_VISITS } from "@/convex/utils/clarityRows";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { PageLink } from "../../../analytics/_components/AnalyticsCells";
import { usePageKinds } from "../../../_components/usePageKinds";
import { SiteBarChart } from "../../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { useSiteListPage } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSort } from "../../../sites/_components/useSiteSort";
import { HeatmapLink, Judged, Points, duration, mono, percent, tooFew, useDeviceName, usePeriodWords, useWaitingWords } from "../../_components/ClarityParts";
import { useClarityArgs, useClarityDevice, useClarityPageHref, useClaritySiteId, useClarityStatus, useClarityChosen } from "../../_components/useClarity";

type Sort = "page" | "visits" | "scroll" | "change" | "time" | "quickBack" | "errors";
const FIRSTS: Readonly<Record<Sort, "asc" | "desc">> = { page: "asc", visits: "desc", scroll: "asc", change: "asc", time: "asc", quickBack: "desc", errors: "desc" };
const SCROLLED = ["", "LOW"] as const;

/**
 * Clarity's Pages (docs/plans/active/agents-and-clarity-plan.md, Part 4, CS4,
 * drawn as the Pages board): how far down the ten busiest pages are
 * scrolled, as bars — under a quarter in orange, too few visits faint — then
 * every page in the standard table: its search row with Page group and
 * Scrolled, its bar and download, and each page's visits, how far down it is
 * scrolled and its change, time engaged, went straight back, errors and its
 * heatmap in Clarity. A row opens the page's own screen. Sorted by its
 * headings over the whole list on the server; titled for the rows shown.
 */
export default function ClarityPagesPage() {
  const t = useTranslations("clarity.pages");
  const tc = useTranslations("clarity.common");
  const router = useRouter();
  const convex = useConvex();
  const siteId = useClaritySiteId();
  const status = useClarityStatus();
  const args = useClarityArgs();
  const device = useClarityDevice();
  const deviceName = useDeviceName();
  const pageHref = useClarityPageHref();
  const periodWords = usePeriodWords();
  const waitingWords = useWaitingWords();
  const kinds = usePageKinds(siteId);
  const [search, setSearch, settled] = useSiteSearch();
  const [group, setGroup] = useSiteParam<string>("group", "");
  const [scrolled, setScrolled] = useSiteParam<(typeof SCROLLED)[number]>("scrolled", "", SCROLLED);
  const order = useSiteSort(FIRSTS, "visits");
  const filters = { ...args, ...(settled ? { q: settled } : {}), ...(group ? { group } : {}), ...(scrolled ? { scrolled } : {}), sort: order.key, direction: order.direction };
  const list = useSiteListPage(api.clarityScreens.clarityPagesList, status?.connection?.newestDay ? filters : "skip");
  const answer = list.result;
  const { run, isBusy } = useAdminAction({ scope: "clarity-pages-download" });
  const chosen = useClarityChosen();
  const span = periodWords(answer?.period, chosen, "pages");
  const waiting = waitingWords(answer?.period, chosen);

  const says = !answer
    ? [t("sees.loading")]
    : answer.count === 0
      ? [t("sees.none")]
      : [
        t("sees.count", { count: answer.count, span }),
        answer.low > 0 ? t("sees.low", { count: answer.low, pages: answer.lowest.join(", ") }) : t("sees.noneLow"),
        ...(answer.furthest ? [t("sees.furthest", { page: answer.furthest.page, scroll: percent(answer.furthest.now.scroll) })] : []),
        ...(answer.few > 0 ? [t("sees.few", { count: answer.few, few: CLARITY_FEW_VISITS })] : []),
      ];
  const worst = answer?.worst ?? null;
  const steps = worst
    ? [{
      words: worst.scrollBefore !== null && worst.now.scroll !== null
        ? t("do.startWithChange", { page: worst.page, visits: worst.now.visits, scroll: percent(worst.now.scroll), points: Math.abs(worst.now.scroll - worst.scrollBefore).toFixed(1), way: worst.now.scroll < worst.scrollBefore ? "less" : "more" })
        : t("do.startWith", { page: worst.page, visits: worst.now.visits, scroll: percent(worst.now.scroll) }),
      link: t("do.seePage"),
      href: pageHref(worst.page),
    }]
    : [];

  const busiest = answer?.busiest ?? [];
  const groupOptions = kinds.options;
  return (
    <>
      <PageHeader icon={<FileText className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {waiting ? <Notice>{waiting}</Notice> : null}
      <HakkenSees says={says} steps={steps} page={{ screen: "clarity.pages", siteId, data: answer }} />
      <ChartCard
        title={t("chart.title")}
        hint={t("chart.hint", { few: CLARITY_FEW_VISITS, website: percent(answer?.website.scroll ?? null) })}
        exportName={`${status?.host ?? "site"}-clarity-pages-scrolled`}
        csv={() => toCsv([tc("columns.page"), tc("columns.visits"), tc("columns.scrolled")], busiest.map((line) => [line.page, line.now.visits, line.now.scroll]))}
        enoughData={busiest.length > 0}
        emptyText={t("chart.empty")}
      >
        <SiteBarChart
          horizontal
          data={busiest.map((line) => ({ label: line.page, scroll: line.now.scroll ?? 0, visits: line.now.visits }))}
          series={[{ key: "scroll", name: tc("columns.scrolledAverage"), colour: CHART_SERIES_BLUE }]}
          highlight={{ colour: CHART_SERIES_ORANGE, rows: (row) => Number(row.scroll) < 25 }}
          faded={(row) => tooFew(Number(row.visits))}
          labels={(value) => `${value.toFixed(1)}%`}
          formatScale={(value) => `${value}%`}
          updateKey={false}
        />
      </ChartCard>
      <DataTable
        rows={list.pageRows}
        rowKey={(row) => row.page}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <>
            <Select chip={{ label: t("groupFilter"), choice: group ? kinds.label(group) : null }} value={group} onChange={setGroup} aria-label={t("groupFilter")}>
              <option value="">{t("everyGroup")}</option>
              {groupOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <Select chip={{ label: t("scrolledFilter"), choice: scrolled ? t("scrolledLow") : null }} value={scrolled} onChange={(next) => setScrolled(next as (typeof SCROLLED)[number])} aria-label={t("scrolledFilter")}>
              <option value="">{t("scrolledAny")}</option>
              <option value="LOW">{t("scrolledLow")}</option>
            </Select>
          </>
        }
        cardHeader={
          <TableBar
            footer={list.footer}
            noun="pages"
            actions={
              <DownloadButton
                label={tc("downloadCsv")}
                busyLabel={tc("downloading")}
                busy={isBusy()}
                onClick={async () => {
                  const outcome = await run(() => convex.query(api.clarityScreens.clarityPagesAll, filters), { fallbackMessage: tc("downloadFailed") });
                  if (!outcome.ok) return;
                  const headers = [tc("columns.page"), tc("columns.group"), tc("columns.visits"), tc("columns.scrolled"), tc("columns.scrolledBefore"), tc("columns.engagedSeconds"), tc("columns.wentBack"), tc("columns.errors")];
                  const rows = outcome.data.rows.map((line) => [line.page, line.kindName ?? kinds.label(line.kind), line.now.visits, line.now.scroll, line.scrollBefore, line.now.activeSeconds, line.now.shares.quickBack, line.now.shares.errors]);
                  saveTextFile(toCsv(headers, rows), `${status?.host ?? "site"}-clarity-pages.csv`);
                }}
              />
            }
          >
            <span className="text-[12px] text-secondary">
              {t("tableNote", { span, device: device ? deviceName(device).toLowerCase() : tc("everyDevice"), few: CLARITY_FEW_VISITS })}
              {answer && answer.period.cutDays > 0 ? ` · ${tc("cut", { count: answer.period.cutDays })}` : ""}
            </span>
          </TableBar>
        }
        empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: settled || group || scrolled ? t("noMatch") : device ? t("emptyDevice", { device: deviceName(device).toLowerCase(), span }) : t("empty") }}
        footer={list.footer}
        sort={order.tableSort}
        onRowClick={(row) => router.push(pageHref(row.page))}
        columns={[
          { key: "page", header: tc("columns.page"), sortable: true, className: "w-[36%] max-w-0", cell: (row) => <PageLink address={row.page} href={pageHref(row.page)} title={row.title ?? undefined} /> },
          { key: "visits", header: tc("columns.visits"), sortable: true, align: "right", cell: (row) => mono(formatNumber(row.now.visits)) },
          { key: "scroll", header: tc("columns.scrolled"), sortable: true, align: "right", cell: (row) => <Judged text={percent(row.now.scroll)} visits={row.now.visits} tone={(row.now.scroll ?? 100) < 25 ? "text-foreground" : "text-secondary"} /> },
          { key: "change", header: tc("columns.change"), sortable: true, align: "right", cell: (row) => <Points now={row.now.scroll} before={row.scrollBefore} visits={row.now.visits} /> },
          { key: "time", header: tc("columns.engaged"), sortable: true, align: "right", cell: (row) => <Judged text={duration(row.now.activeSeconds)} visits={row.now.visits} /> },
          { key: "quickBack", header: tc("columns.wentBack"), sortable: true, align: "right", cell: (row) => (row.now.quickBack > 0 ? <Judged text={percent(row.now.shares.quickBack)} visits={row.now.visits} /> : <NoFigure />) },
          { key: "errors", header: tc("columns.errors"), sortable: true, align: "right", cell: (row) => (row.now.errors > 0 ? <Judged text={percent(row.now.shares.errors)} visits={row.now.visits} /> : <NoFigure />) },
          { key: "map", header: "", align: "right", cell: (row) => <HeatmapLink page={row.page} /> },
        ]}
      />
    </>
  );
}
