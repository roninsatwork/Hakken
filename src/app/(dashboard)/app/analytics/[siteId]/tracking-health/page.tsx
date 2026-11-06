"use client";

import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { ListTable } from "@/src/ui/components/screens/ListTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { formatLongDate } from "@/src/lib/dates";
import { inCheckOrder } from "@/convex/utils/sees/analytics";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { formatDay, formatNumber } from "../../../sites/_components/siteFormat";
import { AnalyticsGate } from "../../_components/AnalyticsNotices";
import { formatPercent } from "../../_components/analyticsFormat";
import { HEALTH_AREAS, healthArea, healthResult, useHealthWords, type HealthArea, type HealthCheckRow, type HealthResult } from "../../_components/useHealthWords";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, type AnalyticsStatus } from "../../_components/useAnalytics";

type Check = HealthCheckRow;
type Row = Check & { name: string; found: string; affects: string; result: HealthResult; area: HealthArea; rank: number };
const RESULTS: readonly HealthResult[] = ["off", "none", "good"];
const RESULT_TONE = { off: "warning", none: "neutral", good: "success" } as const;

/**
 * Tracking health (overview-new-page-plan-2026-11-06.md, step 14; his Way 1):
 * whether the figures can be trusted, and which ones are a bit out. A line says
 * how things stand; four boxes say it for each kind of figure, and pressing one
 * filters the table; then every check, one line each, those not right first. A
 * check opens its own screen, with why it matters and how it gets fixed. Only
 * the checks the weekly run keeps on the connection are read: nothing is asked
 * of Google.
 */
export default function AnalyticsTrackingHealthPage() {
  const t = useTranslations("googleAnalytics.health");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  const checkedAt = status?.connection?.health?.checkedAt;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Activity className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={checkedAt ? t("description", { when: formatLongDate(checkedAt) }) : t("descriptionNotYet")}
      />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <HealthBody status={status} />
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

const SORTS: SiteSortColumns<Row, "check" | "result" | "affects"> = {
  check: { value: (row) => row.name, first: "asc" },
  // Those not right first, each part the costliest first (`inCheckOrder`).
  result: { value: (row) => row.rank, first: "asc" },
  affects: { value: (row) => row.affects, first: "asc" },
};

function HealthBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.health");
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const words = useHealthWords(status);
  const [area, setArea] = useSiteParam<HealthArea | "all">("figure", "all", ["all", ...HEALTH_AREAS]);
  const [result, setResult] = useSiteParam<HealthResult | "all">("result", "all", ["all", ...RESULTS]);
  const [text, setText, term] = useSiteSearch();
  const checks = status.connection?.health?.checks;
  const order = inCheckOrder(checks ?? []).map((check) => check.check);
  const rows: Row[] | undefined = checks?.map((check) => {
    const said = words(check);
    const shown = healthResult(check);
    return {
      ...check,
      name: said.name,
      found: said.found,
      affects: said.affects,
      result: shown,
      area: healthArea(check.check),
      rank: RESULTS.indexOf(shown) * order.length + order.indexOf(check.check),
    };
  });
  const search = term.toLowerCase();
  const chosen = rows?.filter((row) => (area === "all" || row.area === area) && (result === "all" || row.result === result)
    && (!search || `${row.name} ${row.found} ${row.affects}`.toLowerCase().includes(search)));
  const { rows: sorted, tableSort } = useSiteSortedList(chosen, SORTS, { opening: "result", name: (row) => row.name });
  const pager = useSitePager(sorted, { isLoading: false });
  if (!checks) return <Notice>{t("notYet")}</Notice>;

  return (
    <div className="flex flex-col gap-6">
      <HealthNotice checks={checks} />
      <HealthBoxes checks={checks} status={status} area={area} hrefFor={(chosenArea) => hrefFor("tracking-health", chosenArea === area ? { figure: "all" } : { figure: chosenArea })} />
      <ListTable<Row>
        noun="checks"
        rows={pager.pageRows}
        rowKey={(row) => row.check}
        onRowClick={(row) => router.push(hrefFor("tracking-health/check", { key: row.check }))}
        actions={sorted ? (
          <ListDownload
            label={t("table.download")}
            fileName={`${status.host}-tracking-health`}
            rows={sorted}
            columns={[
              { header: t("table.check"), value: (row) => row.name },
              { header: t("table.result"), value: (row) => t(`results.${row.result}`) },
              { header: t("table.found"), value: (row) => row.found },
              { header: t("table.affects"), value: (row) => row.affects },
            ]}
          />
        ) : undefined}
        search={{ value: text, onChange: setText, placeholder: t("table.search") }}
        filters={(
          <>
            <Select aria-label={t("table.resultChip")} value={result} onChange={(next) => setResult(next as HealthResult | "all")} chip={{ label: t("table.resultChip"), choice: result === "all" ? null : t(`results.${result}`) }}>
              <option value="all">{t("table.everyResult")}</option>
              {RESULTS.map((one) => <option key={one} value={one}>{t(`results.${one}`)}</option>)}
            </Select>
            <Select aria-label={t("table.areaChip")} value={area} onChange={(next) => setArea(next as HealthArea | "all")} chip={{ label: t("table.areaChip"), choice: area === "all" ? null : t(`areas.${area}`) }}>
              <option value="all">{t("table.everyArea")}</option>
              {HEALTH_AREAS.map((one) => <option key={one} value={one}>{t(`areas.${one}`)}</option>)}
            </Select>
          </>
        )}
        sort={tableSort}
        empty={{ icon: <Activity className="h-8 w-8 text-muted/30" />, label: t("table.empty") }}
        footer={pager.footer}
        columns={[
          { key: "check", header: t("table.check"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[13px] text-foreground">{row.name}</span> },
          { key: "result", header: t("table.result"), sortable: true, cell: (row) => <StatusLabel tone={RESULT_TONE[row.result]}>{t(`results.${row.result}`)}</StatusLabel> },
          { key: "found", header: t("table.found"), cell: (row) => <span className="text-[12.5px] text-secondary">{row.found}</span> },
          { key: "affects", header: t("table.affects"), sortable: true, cell: (row) => <TagLabel>{row.affects}</TagLabel> },
        ]}
      />
    </div>
  );
}

/** How things stand, in one line: a day with no visits first, as it stops every figure. */
function HealthNotice({ checks }: { checks: readonly Check[] }) {
  const t = useTranslations("googleAnalytics.health.notice");
  const stopped = checks.find((check) => check.check === "TRACKING_STOPPED" && !check.passing);
  if (stopped?.names?.[0]) return <Notice tone="warning">{t("stopped", { day: formatDay(stopped.names[0]) })}</Notice>;
  const off = checks.filter((check) => healthResult(check) === "off").length;
  return <Notice>{off > 0 ? t("bitOut", { count: off }) : t("allGood", { total: checks.length })}</Notice>;
}

/** One box for each kind of figure, saying how far it can be trusted. Pressing one filters the table to its checks. */
function HealthBoxes({ checks, status, area, hrefFor }: { checks: readonly Check[]; status: AnalyticsStatus; area: HealthArea | "all"; hrefFor: (area: HealthArea) => string }) {
  const t = useTranslations("googleAnalytics.health");
  const find = (id: string) => checks.find((check) => check.check === id);
  const good = (words: string) => <StatusLabel tone="success" wrap>{words}</StatusLabel>;
  const off = (words: string) => <StatusLabel tone="warning" wrap>{words}</StatusLabel>;

  const stopped = find("TRACKING_STOPPED");
  const fell = find("SUDDEN_FALL");
  const visits = stopped && !stopped.passing
    ? { value: t("boxes.stopped"), detail: off(t("boxes.stoppedDetail", { day: stopped.names?.[0] ? formatDay(stopped.names[0]) : "" })) }
    : fell && !fell.passing
      ? { value: t("boxes.dropped"), detail: off(t("boxes.droppedDetail", { share: formatPercent(fell.share ?? 0) })) }
      : { value: t("boxes.good"), detail: good(t("boxes.countedEveryDay")) };

  const unknown = find("TOO_MUCH_UNKNOWN");
  const known = 100 - Math.round((unknown?.share ?? 0) * 100);
  const came = { value: t("boxes.cameValue", { known }), detail: unknown && !unknown.passing ? off(t("boxes.cameRest")) : good(t("boxes.cameAll")) };

  const total = (status.connection?.events ?? []).filter((event) => event.counted).length;
  const never = find("NEVER_HAPPENS");
  const silent = never && !never.passing ? (never.names ?? []).length : 0;
  const events = total === 0
    ? { value: t("boxes.eventsNone"), detail: off(t("boxes.eventsNoneDetail")) }
    : { value: t("boxes.eventsValue", { happened: total - silent, total }), detail: silent > 0 ? off(t("boxes.eventsRest", { count: silent })) : good(t("boxes.eventsAll")) };

  const again = find("COUNTED_AGAIN");
  const pages = again && !again.passing
    ? { value: formatNumber(again.count ?? 0), detail: off(t("boxes.pagesOff")) }
    : { value: t("boxes.good"), detail: good(t("boxes.pagesGood")) };

  const boxes = { visits, came, events, pages };
  return (
    <FigureRow columns={4}>
      {HEALTH_AREAS.map((one) => <Figure key={one} label={t(`areas.${one}`)} value={boxes[one].value} detail={boxes[one].detail} href={hrefFor(one)} emphasis={area === one} />)}
    </FigureRow>
  );
}
