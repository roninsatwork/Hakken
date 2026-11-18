"use client";

import { useMemo, type ReactNode } from "react";
import { MapPin, Monitor } from "lucide-react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { placesSees } from "@/convex/utils/sees/searchConsoleScreens";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TickActions, TickCount, tickColumn, type TableTicks } from "@/src/ui/components/screens/TableTicks";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { tableKey, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { countryInWords, countryName } from "../../_components/countries";
import { GoogleCutLine } from "../../_components/GoogleCutLine";
import { usePerformanceDates } from "../../_components/PerformanceParts";
import { PlacesBoxes } from "../../_components/PlacesParts";
import { placesFigures, placesPageData } from "../../_components/placesSees";
import { filePercent, filePosition, readerLanguage } from "../../_components/searchConsoleFormat";
import { NothingOfKind, ResultKindSwitch, SearchConsoleGate, canRetry, hasFigures, liveProblemKey, type LiveProblemKind } from "../../_components/SearchConsoleNotices";
import { figureColumns, nameColumn, type ListRow } from "../../_components/SearchConsoleTables";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { MOST_TICKED, TickedDaysCard, useTickedDays, useTickedRows } from "../../_components/TickedDays";
import { useSearchConsoleSplit } from "../../_components/useSearchConsoleSplit";
import {
  countryArg,
  periodArg,
  useResultKind,
  useSearchConsoleCountry,
  useSearchConsoleRange,
  useSearchConsoleSiteId,
  useSearchConsoleStatus,
} from "../../_components/useSearchConsole";

/** Countries ticked as the page opens: the three busiest after the one chosen, whose line would flatten the rest. */
const OPENING_TICKED = 3;
const DEVICES = ["DESKTOP", "MOBILE", "TABLET"];

/**
 * Countries and devices (search-console-plan.md §5.4), as Anthony chose it on 18 November 2026: the canvas's Way 1, once
 * every figure followed the country menu ("can we align this to the country scope", then "when we fix this way 1 is what
 * i want"; search-console-countries-and-devices-way-1-plan-2026-11-18.md). Four boxes about the country chosen, each
 * against the dates before; the countries ticked in the table drawn day by day, with the dates before under them,
 * opening on the three busiest after the one chosen; every country Google showed the website in, on one line each; and
 * the devices in the country chosen, under a title naming it. No sentence says how the figures are counted: each title
 * names what it counts (Anthony: "WTF is this", of "These figures count every country…").
 */
export default function SearchConsolePlacesPage() {
  const t = useTranslations("searchConsole");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [country] = useSearchConsoleCountry();
  const choices = useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId });
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const dates = usePerformanceDates();
  const language = readerLanguage();
  const host = status?.host ?? "";
  const held = Boolean(status && hasFigures(status));
  const base = { siteId, searchType: kind, from: range.from, to: range.to, ...periodArg(range) };
  // Every country, always; the devices in the country chosen.
  const countryList = useSearchConsoleSplit(held ? { ...base, dimension: "country" } : null);
  const deviceList = useSearchConsoleSplit(held ? { ...base, dimension: "device", ...countryArg(country) } : null);
  const chosen = country ?? choices?.main ?? null;
  const chosenName = chosen ? (countryName(chosen, language) ?? t("places.unknownCountry")) : "";
  const chosenWords = chosen ? (countryInWords(chosen, language) ?? t("places.unknownCountry")) : "";
  const countryRows = countryList && !countryList.preparing ? countryList.rows : undefined;
  const deviceRows = deviceList && !deviceList.preparing ? deviceList.rows : undefined;
  const countries = useMemo<PlaceListRow[] | undefined>(
    () => countryRows?.map((row) => ({ ...row, name: countryName(row.key, language) ?? t("places.unknownCountry") })),
    [countryRows, language, t],
  );
  const devices = useMemo<PlaceListRow[] | undefined>(
    () => deviceRows?.map((row) => ({ ...row, name: DEVICES.includes(row.key) ? t(`places.deviceNames.${row.key}`) : row.key })),
    [deviceRows, t],
  );
  const countrySummary = countryList?.summary ?? null;
  const countriesComparable = countryList?.comparable ?? false;
  const devicesComparable = deviceList?.comparable ?? false;
  const figures = countries && chosen ? placesFigures(countries, countrySummary, countriesComparable, chosen) : null;

  // The three busiest countries after the one chosen, ticked once as the page first shows them (Anthony chose it on the board).
  const opening = countries && chosen
    ? [...countries].filter((row) => row.key !== chosen && row.clicks > 0).sort((left, right) => right.clicks - left.clicks).slice(0, OPENING_TICKED).map((row) => row.key)
    : null;
  const ticks = useTickedRows(t("places.chart.tickLimit", { most: MOST_TICKED }), opening);
  const { rows: ticked, retry } = useTickedDays("country", ticks.keys);
  const nameOf = (key: string) => countryName(key, language) ?? key.toUpperCase();

  // What Hakken sees: the boxes, every country against the dates before, the devices in the country chosen, and the
  // countries ticked onto the chart, by the names the page says them by.
  const seesData = useMemo(() => {
    if (!countries || !devices || !chosen) return undefined;
    return placesPageData({
      chosen,
      countries,
      summary: countrySummary,
      comparable: countriesComparable,
      devices,
      devicesComparable,
      ticked: ticked.filter((row) => row.clicks !== null).map((row) => ({ name: countryName(row.key, language) ?? row.key, clicks: row.clicks ?? 0, previousClicks: row.previousClicks })),
      names: {
        chosen: chosenName,
        others: t("places.eye.others"),
        clicked: t("places.boxes.clicked"),
        devices: Object.fromEntries(devices.map((row) => [row.key, t("places.eye.deviceIn", { device: row.name, country: chosenWords })])),
      },
    });
  }, [countries, devices, chosen, countrySummary, countriesComparable, devicesComparable, ticked, language, chosenName, chosenWords, t]);
  // The fixed lines: the busiest country's share, and mobile's share of the country chosen's clicks when it is the busiest.
  const busiest = countries ? [...countries].sort((left, right) => right.clicks - left.clicks)[0] ?? null : null;
  const mobile = busiest && busiest.key === chosen ? devices?.find((row) => row.key === "MOBILE") ?? null : null;
  const deviceClicks = (devices ?? []).reduce((sum, row) => sum + row.clicks, 0);
  const placesSeen = countries && devices ? placesSees(busiest, figures ? figures.clicks + figures.others : 0, mobile ? mobile.clicks : null, deviceClicks) : null;
  const nothing = countryList && !countryList.preparing && !countryList.problem && countryList.rows.length === 0
    && deviceList && !deviceList.preparing && !deviceList.problem && deviceList.rows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<MapPin className="h-5 w-5 text-brand" />} title={t("places.title")} description={t("places.description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <SearchConsoleSees screen="places" seen={range.period === "custom" ? null : placesSeen} data={seesData} />
          <ResultKindSwitch />
          {countryList?.preparing || deviceList?.preparing ? <p className="text-[12px] text-muted">{t("table.preparing")}</p> : null}
          {nothing ? (
            <NothingOfKind from={range.from} to={range.to} />
          ) : (
            <>
              <PlacesBoxes figures={countryList?.problem ? null : figures} country={chosenWords} against={dates.inBefore} />
              {countries ? (
                <TickedDaysCard
                  words="searchConsole.places.chart"
                  ticked={ticked}
                  host={host}
                  heldFrom={status.connection?.daysFrom ?? null}
                  retry={retry}
                  exportName={`${host}-search-console-countries`}
                  nameOf={nameOf}
                  compare
                />
              ) : null}
              <PlacesTable
                rows={countries}
                noun="countries"
                first={t("table.country")}
                searchPlaceholder={t("places.searchCountries")}
                ticks={ticks}
                fileName="countries"
                host={host}
                against={dates.inBefore}
                emptyIcon={<MapPin className="h-8 w-8 text-muted/30" />}
                problem={countryList?.problem ?? null}
                cut={countryList?.cut ?? null}
                retry={countryList?.retry ?? (() => undefined)}
              />
              <PlacesTable
                rows={devices}
                noun="devices"
                first={t("table.device")}
                title={t("places.devicesIn", { country: chosenWords })}
                searchPlaceholder={t("places.searchDevices")}
                table="devices"
                fileName="devices"
                host={host}
                against={dates.inBefore}
                emptyIcon={<Monitor className="h-8 w-8 text-muted/30" />}
                problem={deviceList?.problem ?? null}
                cut={deviceList?.cut ?? null}
                retry={deviceList?.retry ?? (() => undefined)}
              />
            </>
          )}
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}

/** A country or a device as its table lists it: the list's row, named in the reader's words. */
export type PlaceListRow = ListRow & { name: string };

const SORTS: SiteSortColumns<PlaceListRow, "name" | "clicks" | "change" | "impressions" | "ctr" | "position"> = {
  name: { value: (row) => row.name, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  ctr: { value: (row) => row.ctr, first: "desc" },
  position: { value: (row) => (row.impressions > 0 ? row.position : null), first: "asc" },
};

/**
 * Countries' table and devices', lean (AGENTS.md "Tables are lean"): the name, Clicks, Up or down, Shown (Impressions
 * on hover), CTR and Position, one line a row, the most clicks first. Each searches, sorts and pages on its own (`table`
 * keeps the devices' apart in the address), and downloads what it lists. With `ticks`, the countries' tick boxes for the
 * chart come first, with how many are ticked beside the count, and Clear all and Select top 5 beside the download.
 */
export function PlacesTable({ rows, noun, first, title, searchPlaceholder, table, ticks, fileName, host, against, emptyIcon, problem, cut, retry }: {
  rows: readonly PlaceListRow[] | undefined;
  noun: "countries" | "devices";
  /** The name column's heading: Country, Device. */
  first: string;
  /** The devices' title, naming the country chosen. */
  title?: string;
  searchPlaceholder: string;
  table?: string;
  ticks?: TableTicks;
  fileName: string;
  host: string;
  /** The dates before, for the download's clicks then: "September". */
  against: string;
  emptyIcon: ReactNode;
  problem: LiveProblemKind | null;
  /** Asked of Google, the list stopped at Google's most an ask: said in the bar (`GoogleCutLine`). */
  cut?: number | null;
  retry: () => void;
}) {
  const t = useTranslations("searchConsole");
  const [search, setSearch, term] = useSiteSearch(table ? tableKey("q", table) : undefined, table);
  const matching = useMemo(() => {
    const matches = wordStartMatcher(term.toLowerCase());
    return rows && matches ? rows.filter((row) => matches(row.name)) : rows;
  }, [rows, term]);
  const order = useSiteSortedList(matching, SORTS, { opening: "clicks", name: (row) => row.name, ...(table ? { table } : {}) });
  const pages = useSitePager(order.rows, { isLoading: rows === undefined, ...(table ? { table } : {}) });
  const columns = [nameColumn<PlaceListRow>(first), ...figureColumns(t, ["clicks", "change", "impressions", "ctr", "position"], { same: true })];
  return (
    <div className="flex flex-col gap-2">
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.key}
        search={{ value: search, onChange: setSearch, placeholder: searchPlaceholder }}
        cardHeader={
          <TableBar
            footer={pages.footer}
            noun={noun}
            // A table with a title says Google's cut under it: the bar shows nothing beside a title's count.
            {...(title ? { title, ...(cut ? { description: <GoogleCutLine most={cut} noun={noun} /> } : {}) } : {})}
            actions={(
              <>
                {ticks ? <TickActions ticks={ticks} rows={pages.pageRows ?? []} rowKey={(row) => row.key} /> : null}
                <ListDownload
                  label={t("table.download")}
                  fileName={`${host}-search-console-${fileName}`}
                  rows={order.rows}
                  columns={[
                    { header: first, value: (row) => row.name },
                    { header: t("table.clicks"), value: (row) => row.clicks },
                    { header: t("places.clicksBefore", { before: against }), value: (row) => row.previousClicks ?? (row.change !== null ? 0 : null) },
                    { header: t("table.impressions"), value: (row) => row.impressions },
                    { header: `${t("table.ctr")} (%)`, value: (row) => filePercent(row.ctr) },
                    { header: t("table.position"), value: (row) => (row.impressions > 0 ? filePosition(row.position) : null) },
                  ]}
                />
              </>
            )}
          >
            {ticks ? <TickCount ticks={ticks} /> : null}
            {title ? null : <GoogleCutLine most={cut} noun={noun} />}
          </TableBar>
        }
        sort={order.tableSort}
        empty={{ icon: emptyIcon, label: problem ? t(liveProblemKey(problem)) : term ? t("table.noMatch") : t("table.empty") }}
        footer={pages.footer}
        columns={ticks
          ? [tickColumn<PlaceListRow>(ticks, { rowKey: (row) => row.key, label: (row) => t("places.chart.tickLabel", { name: row.name }), heading: t("places.chart.tickHeading") }), ...columns]
          : columns}
      />
      {canRetry(problem) ? (
        <div>
          <Button variant="quiet" onClick={retry}>{t("record.tryAgain")}</Button>
        </div>
      ) : null}
    </div>
  );
}
