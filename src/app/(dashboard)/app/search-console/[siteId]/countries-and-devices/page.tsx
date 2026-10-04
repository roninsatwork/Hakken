"use client";

import { useQuery } from "convex/react";
import { MapPin, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { tableKey, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { countryName } from "../../_components/countries";
import { filePercent, filePosition, formatPosition, formatRate, readerLanguage } from "../../_components/searchConsoleFormat";
import { NothingOfKind, ResultKindSwitch, SearchConsoleGate, hasFigures } from "../../_components/SearchConsoleNotices";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveAsk } from "../../_components/searchConsoleRecords";
import {
  countryArg,
  useResultKind,
  useSearchConsoleCountry,
  useSearchConsoleRange,
  useSearchConsoleSiteId,
  useSearchConsoleStatus,
  type ResultKind,
} from "../../_components/useSearchConsole";

type Split = { key: string; name: string; clicks: number; impressions: number; ctr: number; position: number; share: number };

const SORTS: SiteSortColumns<Split, "name" | "clicks" | "share" | "impressions" | "ctr" | "position"> = {
  name: { value: (row) => row.name, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  share: { value: (row) => row.share, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  ctr: { value: (row) => row.ctr, first: "desc" },
  position: { value: (row) => row.position, first: "asc" },
};
const nameOf = (row: Split) => row.name;

/** The rows whose name — a country's or a device's — has a word starting with what was searched. */
function matching(rows: Split[] | undefined, term: string): Split[] | undefined {
  const matches = wordStartMatcher(term.toLowerCase());
  return matches ? rows?.filter((row) => matches(row.name)) : rows;
}

/**
 * A short list for the dates chosen: the ready-made period's, or — for other
 * dates, or a country the website does not keep ready — asked of Google
 * (search-console-plan.md §14.3, item 4; §16).
 */
function useSplitList(ask: { siteId: Id<"companyWebsites">; searchType: ResultKind; from: string; to: string; dimension: "country" | "device"; country?: string } | null) {
  const server = useQuery(api.searchConsoleLists.searchConsoleSplitList, ask ?? "skip");
  const live = useLiveAsk(api.searchConsoleLists.searchConsoleLiveList, server?.live && ask ? ask : null);
  if (!server?.live) return server;
  if (live.answer === undefined) return undefined;
  return { rows: live.answer.ok ? live.answer.rows.flat() : [], preparing: false };
}

/**
 * Where a website's clicks came from, and on what (docs/plans/active/
 * search-console-plan.md §5.4): a table of countries and one of devices, each
 * with its share of the clicks, for the dates and kind of result chosen. The
 * countries are every country whatever the country chosen; the devices
 * follow the choice (search-console-plan.md §16). Each table searches, sorts
 * and pages apart from the other, and downloads what it lists; numbers and
 * words only in its rows (§13.1).
 */
export default function SearchConsolePlacesPage() {
  const t = useTranslations("searchConsole");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [country] = useSearchConsoleCountry();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const [countrySearch, setCountrySearch, countryTerm] = useSiteSearch();
  const [deviceSearch, setDeviceSearch, deviceTerm] = useSiteSearch(tableKey("q", "devices"), "devices");
  const held = Boolean(status && hasFigures(status));
  const base = { siteId, searchType: kind, from: range.from, to: range.to };
  // Every country, always; the devices in the country chosen.
  const countryList = useSplitList(held ? { ...base, dimension: "country" } : null);
  const deviceList = useSplitList(held ? { ...base, dimension: "device", ...countryArg(country) } : null);
  const countryCopy = { building: Boolean(countryList?.preparing || deviceList?.preparing), behind: false };
  const language = readerLanguage();
  const countries = countryList?.preparing ? undefined : countryList?.rows.map((row) => ({
    ...row,
    name: countryName(row.key, language) ?? t("places.unknownCountry"),
  }));
  const devices = deviceList?.preparing ? undefined : deviceList?.rows.map((row) => ({
    ...row,
    name: ["DESKTOP", "MOBILE", "TABLET"].includes(row.key) ? t(`places.deviceNames.${row.key}`) : row.key,
  }));
  const countryOrder = useSiteSortedList(matching(countries, countryTerm), SORTS, { opening: "clicks", name: nameOf });
  const deviceOrder = useSiteSortedList(matching(devices, deviceTerm), SORTS, { opening: "clicks", name: nameOf, table: "devices" });
  const countryPages = useSitePager(countryOrder.rows, { isLoading: countries === undefined });
  const devicePages = useSitePager(deviceOrder.rows, { isLoading: devices === undefined, table: "devices" });
  const nothing = countryList && !countryList.preparing && countryList.rows.length === 0 && deviceList && !deviceList.preparing && deviceList.rows.length === 0;

  const columns = (first: string) => [
    { key: "name", header: first, sortable: true, cell: (row: Split) => <span className="text-[13px] text-foreground">{row.name}</span> },
    { key: "clicks", header: t("table.clicks"), align: "right" as const, sortable: true, cell: (row: Split) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
    { key: "share", header: t("table.share"), align: "right" as const, sortable: true, cell: (row: Split) => <span className="font-mono text-[12px] text-secondary">{formatRate(row.share)}</span> },
    { key: "impressions", header: t("table.impressions"), align: "right" as const, sortable: true, cell: (row: Split) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> },
    { key: "ctr", header: t("table.ctr"), align: "right" as const, sortable: true, cell: (row: Split) => <span className="font-mono text-[12px] text-secondary">{formatRate(row.ctr)}</span> },
    { key: "position", header: t("table.position"), align: "right" as const, sortable: true, cell: (row: Split) => <span className="font-mono text-[12px] text-secondary">{formatPosition(row.position)}</span> },
  ];
  const host = status?.host ?? "";
  // A table's download: the rows it lists, in its order, under its headings.
  const download = (first: string, rows: Split[] | undefined, name: string) => (
    <ListDownload
      label={t("table.download")}
      fileName={`${host}-search-console-${name}`}
      rows={rows}
      columns={[
        { header: first, value: (row) => row.name },
        { header: t("table.clicks"), value: (row) => row.clicks },
        { header: `${t("table.share")} (%)`, value: (row) => filePercent(row.share) },
        { header: t("table.impressions"), value: (row) => row.impressions },
        { header: `${t("table.ctr")} (%)`, value: (row) => filePercent(row.ctr) },
        { header: t("table.position"), value: (row) => filePosition(row.position) },
      ]}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<MapPin className="h-5 w-5 text-brand" />} title={t("places.title")} description={t("places.description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          {countryCopy.building ? <p className="text-[12px] text-muted">{t("table.preparing")}</p> : countryCopy.behind ? <p className="text-[12px] text-muted">{t("table.behind")}</p> : null}
          {nothing ? (
            <NothingOfKind from={range.from} to={range.to} />
          ) : (
            <>
              <DataTable
                rows={countryPages.pageRows}
                rowKey={(row) => row.key}
                minWidthClassName="min-w-[700px]"
                search={{ value: countrySearch, onChange: setCountrySearch, placeholder: t("places.searchCountries") }}
                cardHeader={<TableBar footer={countryPages.footer} noun="countries" title={t("places.countries")} actions={download(t("table.country"), countryOrder.rows, "countries")} />}
                sort={countryOrder.tableSort}
                empty={{ icon: <MapPin className="h-8 w-8 text-muted/30" />, label: countryTerm ? t("table.noMatch") : t("table.empty") }}
                footer={countryPages.footer}
                columns={columns(t("table.country"))}
              />
              <DataTable
                rows={devicePages.pageRows}
                rowKey={(row) => row.key}
                minWidthClassName="min-w-[700px]"
                search={{ value: deviceSearch, onChange: setDeviceSearch, placeholder: t("places.searchDevices") }}
                cardHeader={<TableBar footer={devicePages.footer} noun="devices" title={t("places.devices")} actions={download(t("table.device"), deviceOrder.rows, "devices")} />}
                sort={deviceOrder.tableSort}
                empty={{ icon: <Monitor className="h-8 w-8 text-muted/30" />, label: deviceTerm ? t("table.noMatch") : t("table.empty") }}
                footer={devicePages.footer}
                columns={columns(t("table.device"))}
              />
            </>
          )}
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
