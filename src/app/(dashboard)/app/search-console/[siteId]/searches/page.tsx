"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { SiteTableBar } from "../../../sites/_components/SiteTableBar";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { formatPosition, formatRate } from "../../_components/searchConsoleFormat";
import { ResultKindSwitch, SearchConsoleGate, hasFigures } from "../../_components/SearchConsoleNotices";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { ClicksChange, SearchConsoleDownload, useSearchConsoleList } from "../../_components/SearchConsoleTables";

/**
 * Every search Google showed a website for in the dates chosen
 * (docs/plans/active/search-console-plan.md §5.2): clicks, the change on the
 * days before, impressions, click-through rate and position, the whole list
 * searched, ordered by the heading pressed and paged — each opening its own
 * screen. The searches Google hides for privacy are in the site's totals and
 * never here, and the page says how many clicks they were.
 */
export default function SearchConsoleSearchesPage() {
  const t = useTranslations("searchConsole");
  const router = useRouter();
  const { siteId, status, kind, range, search, setSearch, term, order, table, copy, ask } = useSearchConsoleList("query");
  const recordHref = useRecordHref(siteId);
  const performance = useQuery(
    api.searchConsoleReads.searchConsolePerformance,
    status && hasFigures(status) ? { siteId, searchType: kind, from: range.from, to: range.to } : "skip",
  );
  const named = table.result?.named ?? null;
  const total = performance?.totals?.clicks ?? null;
  const headers = [t("table.search"), t("table.clicks"), t("table.change"), t("table.impressions"), `${t("table.ctr")} (%)`, t("table.position")];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Search className="h-5 w-5 text-brand" />} title={t("searches.title")} description={t("searches.description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          {named !== null && total !== null && total > 0 ? (
            <p className="text-[12px] leading-relaxed text-secondary">
              {t("named", { named: formatNumber(named), total: formatNumber(total), hidden: formatNumber(Math.max(0, total - named)) })}
            </p>
          ) : null}
          {copy.building ? <p className="text-[12px] text-muted">{t("table.preparing")}</p> : copy.behind ? <p className="text-[12px] text-muted">{t("table.behind")}</p> : null}
          <DataTable
            rows={table.pageRows}
            rowKey={(row) => row.key}
            onRowClick={(row) => router.push(recordHref("searches/search", row.key))}
            minWidthClassName="min-w-[760px]"
            search={{ value: search, onChange: setSearch, placeholder: t("searches.searchPlaceholder") }}
            cardHeader={
              <SiteTableBar
                footer={table.footer}
                noun="searches"
                actions={<SearchConsoleDownload ask={{ ...ask, ...(term ? { q: term } : {}), sort: order.key, direction: order.direction }} headers={headers} />}
              >
                <span className="text-[12px] text-secondary">{table.result?.comparable ? t("table.versus", { days: range.days }) : t("table.noVersus")}</span>
              </SiteTableBar>
            }
            sort={order.tableSort}
            empty={{ icon: <Search className="h-8 w-8 text-muted/30" />, label: term ? t("table.noMatch") : t("table.empty") }}
            footer={table.footer}
            columns={[
              {
                key: "key",
                header: t("table.search"),
                sortable: true,
                className: CUT_COLUMN.first,
                cell: (row) => <RecordLinkCell cut href={recordHref("searches/search", row.key)}>{row.key}</RecordLinkCell>,
              },
              { key: "clicks", header: t("table.clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
              { key: "change", header: t("table.change"), align: "right", sortable: true, cell: (row) => <ClicksChange change={row.change} previousClicks={row.previousClicks} clicks={row.clicks} /> },
              { key: "impressions", header: t("table.impressions"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> },
              { key: "ctr", header: t("table.ctr"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatRate(row.ctr)}</span> },
              { key: "position", header: t("table.position"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatPosition(row.position)}</span> },
            ]}
          />
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
