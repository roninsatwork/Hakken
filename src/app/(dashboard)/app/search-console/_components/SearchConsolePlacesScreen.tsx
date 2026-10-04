"use client";

import { useSearchParams } from "next/navigation";
import { Globe2, MonitorSmartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { tableKey, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../sites/_components/useSiteSort";
import { countryName } from "./countries";
import { ResultKindSwitch, SearchConsoleGate, hasFigures, canRetry, liveProblemKey } from "./SearchConsoleNotices";
import { filePercent, formatRate, readerLanguage } from "./searchConsoleFormat";
import { pageLabel, useLiveAsk, useRecordBack } from "./searchConsoleRecords";
import { countryArg, useResultKind, useSearchConsoleCountry, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "./useSearchConsole";

type Place = { key: string; name: string; clicks: number; impressions: number; share: number };

const SORTS: SiteSortColumns<Place, "name" | "clicks" | "impressions" | "share"> = {
  name: { value: (row) => row.name, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  share: { value: (row) => row.share, first: "desc" },
};
const nameOf = (row: Place) => row.name;

/** The rows whose name — a country's or a device's — has a word starting with what was searched. */
function matching(rows: Place[], term: string): Place[] {
  const matches = wordStartMatcher(term.toLowerCase());
  return matches ? rows.filter((row) => matches(row.name)) : rows;
}

/**
 * Every country and every device behind one keyword's or one page's clicks,
 * opened from "Show all countries" beside its chart (Anthony, 2026-10-03:
 * "maybe with a show all on another page"): the same ask of Google as the
 * panel, whole, each table searched, sorted by its headings, paged as Sites'
 * are and downloaded as it lists (§13.1).
 * Every country, whatever the country chosen; the devices follow the choice,
 * as on Countries and devices (search-console-plan.md §16). A screen of its
 * own with the way back, never a panel.
 */
export function SearchConsolePlacesScreen({ dimension }: { dimension: "query" | "page" }) {
  const t = useTranslations("searchConsole");
  const tp = useTranslations("searchConsole.places");
  const params = useSearchParams();
  const key = params.get("key") ?? "";
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [country] = useSearchConsoleCountry();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const [countrySearch, setCountrySearch, countryTerm] = useSiteSearch(tableKey("q", "countries"), "countries");
  const [deviceSearch, setDeviceSearch, deviceTerm] = useSiteSearch(tableKey("q", "devices"), "devices");
  const host = status?.host ?? "";
  const back = useRecordBack(siteId, dimension === "query" ? "keywords" : "pages", host);
  const ready = Boolean(status && hasFigures(status) && key);
  // The country chosen narrows the devices only: Google is asked for every country whatever it is.
  const splits = useLiveAsk(
    api.searchConsoleLists.searchConsoleKeySplits,
    ready ? { siteId, searchType: kind, dimension, key, from: range.from, to: range.to, ...countryArg(country) } : null,
  );
  const language = readerLanguage();
  const answer = splits.answer?.ok ? splits.answer : null;
  const countries = answer?.countries.map((row) => ({ ...row, name: countryName(row.key, language) ?? tp("unknownCountry") }));
  const devices = answer?.devices.map((row) => ({ ...row, name: tp(`deviceNames.${row.key}`) }));
  const loading = splits.answer === undefined;
  const countryOrder = useSiteSortedList(loading ? undefined : matching(countries ?? [], countryTerm), SORTS, { opening: "clicks", name: nameOf, table: "countries" });
  const countryPages = useSitePager(countryOrder.rows, { isLoading: loading, table: "countries" });
  const deviceOrder = useSiteSortedList(loading ? undefined : matching(devices ?? [], deviceTerm), SORTS, { opening: "clicks", name: nameOf, table: "devices" });
  const devicePages = useSitePager(deviceOrder.rows, { isLoading: loading, table: "devices" });
  const problem = splits.answer && !splits.answer.ok ? t(liveProblemKey(splits.answer.problem)) : null;
  const name = dimension === "query" ? key : pageLabel(key, host);
  const columns = (heading: string) => [
    { key: "name", header: heading, sortable: true, cell: (row: Place) => <span className="text-[13px] text-foreground">{row.name}</span> },
    { key: "clicks", header: t("table.clicks"), align: "right" as const, sortable: true, cell: (row: Place) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
    { key: "impressions", header: t("table.impressions"), align: "right" as const, sortable: true, cell: (row: Place) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> },
    { key: "share", header: t("record.share"), align: "right" as const, sortable: true, cell: (row: Place) => <span className="font-mono text-[12px] text-secondary">{formatRate(row.share)}</span> },
  ];
  // A table's download: the rows it lists, in its order, under its headings.
  const download = (heading: string, rows: Place[] | undefined, name: string) => (
    <ListDownload
      label={t("table.download")}
      fileName={`${host}-search-console-${dimension === "query" ? "keyword" : "page"}-${name}`}
      rows={rows}
      columns={[
        { header: heading, value: (row) => row.name },
        { header: t("table.clicks"), value: (row) => row.clicks },
        { header: t("table.impressions"), value: (row) => row.impressions },
        { header: `${t("record.share")} (%)`, value: (row) => filePercent(row.share) },
      ]}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={<Globe2 className="h-5 w-5 text-brand" />}
        title={t("record.cameFrom")}
        description={t("record.placesDescription", { name })}
      />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          <DataTable
            rows={countryPages.pageRows}
            rowKey={(row) => row.key}
            minWidthClassName="min-w-[560px]"
            search={{ value: countrySearch, onChange: setCountrySearch, placeholder: tp("searchCountries") }}
            cardHeader={<TableBar footer={countryPages.footer} noun="countries" actions={download(t("table.country"), countryOrder.rows, "countries")} />}
            sort={countryOrder.tableSort}
            empty={{ icon: <Globe2 className="h-8 w-8 text-muted/30" />, label: problem ?? (countryTerm ? t("table.noMatch") : t("record.noClicks")) }}
            footer={countryPages.footer}
            columns={columns(t("table.country"))}
          />
          <DataTable
            rows={devicePages.pageRows}
            rowKey={(row) => row.key}
            minWidthClassName="min-w-[560px]"
            search={{ value: deviceSearch, onChange: setDeviceSearch, placeholder: tp("searchDevices") }}
            cardHeader={<TableBar footer={devicePages.footer} noun="devices" actions={download(t("table.device"), deviceOrder.rows, "devices")} />}
            sort={deviceOrder.tableSort}
            empty={{ icon: <MonitorSmartphone className="h-8 w-8 text-muted/30" />, label: problem ?? (deviceTerm ? t("table.noMatch") : t("record.noClicks")) }}
            footer={devicePages.footer}
            columns={columns(t("table.device"))}
          />
          {splits.answer && !splits.answer.ok && canRetry(splits.answer.problem) ? (
            <div>
              <Button variant="quiet" onClick={splits.retry}>{t("record.tryAgain")}</Button>
            </div>
          ) : null}
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
