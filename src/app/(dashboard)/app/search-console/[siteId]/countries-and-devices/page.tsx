"use client";

import { useQuery } from "convex/react";
import { MapPin, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Meter } from "@/src/ui/components/screens/Meter";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { countryName } from "../../_components/countries";
import { formatPosition, formatRate, readerLanguage } from "../../_components/searchConsoleFormat";
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

/** A share of the site's clicks, as the kit's bar beside its number: the bar only repeats the number. */
function ShareCell({ share }: { share: number }) {
  return (
    <span className="flex items-center gap-2">
      <Meter value={share} colour={CHART_SERIES_ORANGE} />
      <span className="font-mono text-[12px] text-secondary">{formatRate(share)}</span>
    </span>
  );
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
 * follow the choice (search-console-plan.md §16). Each table sorts and pages
 * apart from the other.
 */
export default function SearchConsolePlacesPage() {
  const t = useTranslations("searchConsole");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [country] = useSearchConsoleCountry();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
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
  const countryOrder = useSiteSortedList(countries, SORTS, { opening: "clicks", name: nameOf });
  const deviceOrder = useSiteSortedList(devices, SORTS, { opening: "clicks", name: nameOf, table: "devices" });
  const countryPages = useSitePager(countryOrder.rows, { isLoading: countries === undefined });
  const devicePages = useSitePager(deviceOrder.rows, { isLoading: devices === undefined, table: "devices" });
  const nothing = countryList && !countryList.preparing && countryList.rows.length === 0 && deviceList && !deviceList.preparing && deviceList.rows.length === 0;

  const columns = (first: string) => [
    { key: "name", header: first, sortable: true, cell: (row: Split) => <span className="text-foreground">{row.name}</span> },
    { key: "clicks", header: t("table.clicks"), align: "right" as const, sortable: true, cell: (row: Split) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
    { key: "share", header: t("table.share"), sortable: true, cell: (row: Split) => <ShareCell share={row.share} /> },
    { key: "impressions", header: t("table.impressions"), align: "right" as const, sortable: true, cell: (row: Split) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> },
    { key: "ctr", header: t("table.ctr"), align: "right" as const, sortable: true, cell: (row: Split) => <span className="font-mono text-[12px] text-secondary">{formatRate(row.ctr)}</span> },
    { key: "position", header: t("table.position"), align: "right" as const, sortable: true, cell: (row: Split) => <span className="font-mono text-[12px] text-secondary">{formatPosition(row.position)}</span> },
  ];

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
                cardHeader={<TableBar footer={countryPages.footer} noun="countries" title={t("places.countries")} />}
                sort={countryOrder.tableSort}
                empty={{ icon: <MapPin className="h-8 w-8 text-muted/30" />, label: t("table.empty") }}
                footer={countryPages.footer}
                columns={columns(t("table.country"))}
              />
              <DataTable
                rows={devicePages.pageRows}
                rowKey={(row) => row.key}
                minWidthClassName="min-w-[700px]"
                cardHeader={<TableBar footer={devicePages.footer} noun="devices" title={t("places.devices")} />}
                sort={deviceOrder.tableSort}
                empty={{ icon: <Monitor className="h-8 w-8 text-muted/30" />, label: t("table.empty") }}
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
