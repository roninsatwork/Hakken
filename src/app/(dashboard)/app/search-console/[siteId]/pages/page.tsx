"use client";

import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { SiteTableBar } from "../../../sites/_components/SiteTableBar";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { formatPosition, formatRate } from "../../_components/searchConsoleFormat";
import { ResultKindSwitch, SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { pageLabel, useRecordHref } from "../../_components/searchConsoleRecords";
import { ClicksChange, SearchConsoleDownload, useSearchConsoleList } from "../../_components/SearchConsoleTables";

/**
 * Every page Google showed in its results in the dates chosen
 * (docs/plans/active/search-console-plan.md §5.3): the same figures as the
 * Searches table, the whole list searched, ordered by the heading pressed and
 * paged — each page opening its own screen, with the searches it was shown for.
 */
export default function SearchConsolePagesPage() {
  const t = useTranslations("searchConsole");
  const router = useRouter();
  const { siteId, status, range, search, setSearch, term, order, table, copy, ask } = useSearchConsoleList("page");
  const recordHref = useRecordHref(siteId);
  const host = status?.host ?? "";
  const headers = [t("table.page"), t("table.clicks"), t("table.change"), t("table.impressions"), `${t("table.ctr")} (%)`, t("table.position")];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<FileText className="h-5 w-5 text-brand" />} title={t("pages.title")} description={t("pages.description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          {copy.building ? <p className="text-[12px] text-muted">{t("table.preparing")}</p> : copy.behind ? <p className="text-[12px] text-muted">{t("table.behind")}</p> : null}
          <DataTable
            rows={table.pageRows}
            rowKey={(row) => row.key}
            onRowClick={(row) => router.push(recordHref("pages/page", row.key))}
            minWidthClassName="min-w-[760px]"
            search={{ value: search, onChange: setSearch, placeholder: t("pages.searchPlaceholder") }}
            cardHeader={
              <SiteTableBar
                footer={table.footer}
                noun="pages"
                actions={<SearchConsoleDownload ask={{ ...ask, ...(term ? { q: term } : {}), sort: order.key, direction: order.direction }} headers={headers} />}
              >
                <span className="text-[12px] text-secondary">{table.result?.comparable ? t("table.versus", { days: range.days }) : t("table.noVersus")}</span>
              </SiteTableBar>
            }
            sort={order.tableSort}
            empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: term ? t("table.noMatch") : t("table.empty") }}
            footer={table.footer}
            columns={[
              {
                key: "key",
                header: t("table.page"),
                sortable: true,
                className: CUT_COLUMN.first,
                cell: (row) => (
                  <RecordLinkCell cut href={recordHref("pages/page", row.key)} className="text-[13px] text-info">
                    {pageLabel(row.key, host)}
                  </RecordLinkCell>
                ),
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
