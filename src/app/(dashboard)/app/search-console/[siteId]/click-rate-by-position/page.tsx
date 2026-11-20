"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Percent } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { ctrCurve, type CurvePoint } from "@/convex/utils/searchConsoleViews";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CUT_COLUMN } from "../../../sites/_components/SiteCells";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { CurveBoxes, CurveDevicesCard } from "../../_components/CurveParts";
import { usePerformanceDates } from "../../_components/PerformanceParts";
import { ResultKindSwitch, SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { filePercent, formatFineRate } from "../../_components/searchConsoleFormat";
import { useLiveAsk } from "../../_components/searchConsoleRecords";
import {
  countryArg,
  isReadyMade,
  useResultKind,
  useSearchConsoleCountry,
  useSearchConsoleRange,
  useSearchConsoleSiteId,
  useSearchConsoleStatus,
} from "../../_components/useSearchConsole";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { curveSees } from "@/convex/utils/sees/searchConsoleScreens";
import { useSearchConsolePeriodWords } from "../../_components/useSearchConsole";

/** A row a position: the whole website's figures there, and its click-through rate on mobile and on desktop where they're in. */
type Point = CurvePoint & { key: string; mobile: number | null; desktop: number | null };
const SORTS: SiteSortColumns<Point, "position" | "keywords" | "impressions" | "clicks" | "mobile" | "desktop"> = {
  position: { value: (row) => row.position, first: "asc" },
  keywords: { value: (row) => row.keywords, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  mobile: { value: (row) => row.mobile, first: "desc" },
  desktop: { value: (row) => row.desktop, first: "desc" },
};
const nameOf = (row: Point) => row.key;

/**
 * Click rate by position (search-console-plan.md §13.3, drawn as "15 · Click
 * rate by position"): how often people click the website at each of
 * Google's positions, 1 to 20 — clicks for each time it was shown, from its
 * keywords. Shown but not clicked uses it as the website's own yardstick.
 * In the country chosen: from its ready-made periods when the website keeps
 * it ready, otherwise worked out from Google's answer (search-console-plan.md
 * §16).
 *
 * Redone as Way 3 on 20 November 2026 (search-console-breakdowns-plan-2026-11-20.md): three boxes for the groups of
 * positions against the period before, mobile against desktop at each position, and a table whose columns are the devices.
 * The devices are kept as the periods are built; other dates or a country not kept ready ask Google, two small asks.
 */
export default function SearchConsoleCtrCurvePage() {
  const t = useTranslations("searchConsole");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const periodWords = useSearchConsolePeriodWords(range.period);
  const [search, setSearch, term] = useSiteSearch();
  const [country] = useSearchConsoleCountry();
  const held = Boolean(status?.connection?.newestDay);
  const ask = { siteId, searchType: kind, from: range.from, to: range.to, ...countryArg(country) };
  // Other dates are asked of Google; so is a country the website does not keep ready, the server says.
  const asksGoogle = !isReadyMade(range, status?.connection?.newestDay);
  const server = useQuery(api.searchConsoleChanges.searchConsoleCurve, held && !asksGoogle ? ask : "skip");
  const fromLive = asksGoogle || server?.live === true;
  const live = useLiveAsk(api.searchConsoleLists.searchConsoleLiveList, held && fromLive ? { ...ask, dimension: "query" as const } : null);
  // Mobile and desktop: kept with the ready-made periods, else asked of Google, each position's figures alone.
  const keptDevices = fromLive ? null : server?.devices;
  const liveDevices = useLiveAsk(api.searchConsoleBreakdowns.searchConsoleLiveDeviceCurve, held && (fromLive || (server !== undefined && !server.preparing && !server.devices)) ? ask : null);
  const devices = keptDevices ?? (liveDevices.answer === undefined ? undefined : liveDevices.answer.ok ? liveDevices.answer.devices : null);
  const devicesFailed = !keptDevices && liveDevices.answer !== undefined && !liveDevices.answer.ok;
  const answer = live.answer;
  const curvePositions = status?.limits.curvePositions;
  const heldPoints = server?.points;
  const points = useMemo<CurvePoint[] | undefined>(() => (fromLive
    ? (answer === undefined ? undefined : answer.ok && curvePositions !== undefined ? ctrCurve(answer.rows.flat(), curvePositions) : [])
    : heldPoints), [fromLive, answer, curvePositions, heldPoints]);
  const deviceRate = (list: readonly CurvePoint[] | undefined, position: number) => {
    const found = list?.find((one) => one.position === position);
    return found && found.impressions > 0 ? found.ctr : null;
  };
  const rows: Point[] | undefined = points?.map((point) => ({ ...point, key: String(point.position), mobile: deviceRate(devices?.mobile, point.position), desktop: deviceRate(devices?.desktop, point.position) }));
  const dates = usePerformanceDates();
  // The eye's figures: each place named as the reader says it, and the same curve over the span before where it is kept
  // (ask-hakken-every-chart-page-plan-2026-11-03.md, section 6: "the span before's curve").
  const tw = useTranslations("searchConsole.sees");
  const td = useTranslations("searchConsole.places.deviceNames");
  const before = fromLive ? null : (server?.before ?? null);
  const seesData = useMemo(() => {
    if (!points) return undefined;
    // Positions, never places, as the screen says them (Low click rate's rule, 20 November 2026).
    const placed = (list: CurvePoint[]) => list.map((point) => ({ ...point, name: t("ctrCurve.position", { position: point.position }) }));
    return {
      points: placed(points),
      before: before ? placed(before) : null,
      // Mobile and desktop at each position, as the chart sets them side by side (20 November 2026).
      devices: devices ? { mobile: placed(devices.mobile), desktop: placed(devices.desktop) } : null,
      names: { firstPage: tw("firstPage"), secondPage: tw("secondPage"), topThree: t("ctrCurve.boxes.top3"), fourToTen: t("ctrCurve.boxes.first"), mobile: td("MOBILE"), desktop: td("DESKTOP") },
    };
  }, [points, before, devices, t, tw, td]);
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((row) => !matches || matches(row.key));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "position", name: nameOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });
  const host = status?.host ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Percent className="h-5 w-5 text-brand" />} title={t("ctrCurve.title")} description={t("ctrCurve.description", { period: periodWords.period })} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <SearchConsoleSees screen="ctrCurve" seen={points ? curveSees(points) : null} data={seesData} />
          <ResultKindSwitch />
          {server?.preparing ? <p className="text-[12px] text-muted">{t("table.preparing")}</p> : null}
          <CurveBoxes points={points} before={before} against={dates.inBefore} />
          <CurveDevicesCard devices={devices} problem={devicesFailed} host={host} exportName={`${host}-search-console-click-rate-on-each-device`} />
          <DataTable
            rows={pager.pageRows}
            rowKey={(row) => row.key}
            search={{ value: search, onChange: setSearch, placeholder: t("ctrCurve.searchPlaceholder") }}
            cardHeader={
              <TableBar
                footer={pager.footer}
                noun="positions"
                actions={
                  <ListDownload
                    label={t("table.download")}
                    fileName={`${host}-search-console-click-rate-by-position`}
                    rows={sorted}
                    columns={[
                      { header: t("table.position"), value: (row) => row.position },
                      { header: t("table.keywords"), value: (row) => row.keywords },
                      { header: t("table.impressions"), value: (row) => row.impressions },
                      { header: t("table.clicks"), value: (row) => row.clicks },
                      { header: `${t("table.ctr")} (%)`, value: (row) => filePercent(row.ctr) },
                      { header: `${t("ctrCurve.table.mobileFile")} (%)`, value: (row) => (row.mobile === null ? null : filePercent(row.mobile)) },
                      { header: `${t("ctrCurve.table.desktopFile")} (%)`, value: (row) => (row.desktop === null ? null : filePercent(row.desktop)) },
                    ]}
                  />
                }
              />
            }
            sort={tableSort}
            empty={{ icon: <Percent className="h-8 w-8 text-muted/30" />, label: term ? t("table.noMatch") : t("table.empty") }}
            footer={pager.footer}
            columns={[
              // The lean table, as drawn (20 November 2026): the name cut to one line, and the devices as its last two columns.
              { key: "position", header: t("table.position"), sortable: true, className: `${CUT_COLUMN.first} min-w-[160px]`, cell: (row) => <span className="block truncate text-[13px] text-foreground">{row.position}</span> },
              { key: "keywords", header: t("table.keywords"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.keywords)}</span> },
              { key: "impressions", header: <span title={t("table.shownTitle")}>{t("table.shown")}</span>, align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> },
              { key: "clicks", header: t("table.clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
              { key: "mobile", header: <span title={t("ctrCurve.table.mobileTitle")}>{td("MOBILE")}</span>, align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatFineRate(row.mobile)}</span> },
              { key: "desktop", header: <span title={t("ctrCurve.table.desktopTitle")}>{td("DESKTOP")}</span>, align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatFineRate(row.desktop)}</span> },
            ]}
          />
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
