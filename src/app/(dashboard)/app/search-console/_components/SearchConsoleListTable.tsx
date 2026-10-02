"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FunctionArgs } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SiteTableBar, type SiteTableNoun } from "../../sites/_components/SiteTableBar";
import { ResultKindSwitch, SearchConsoleGate } from "./SearchConsoleNotices";
import { SearchConsoleChips, SearchConsoleDownload, type ChipId, type ListRow, type useSearchConsoleList } from "./SearchConsoleTables";

export type ExportField = FunctionArgs<typeof api.searchConsoleLists.exportSearchConsoleList>["fields"][number];

/** What a list's table is: its rows' columns, chips, noun and download, and where a row opens. */
export type ListTableSpec = {
  list: ReturnType<typeof useSearchConsoleList>;
  columns: DataTableColumn<ListRow>[];
  chips: readonly ChipId[];
  noun: SiteTableNoun;
  searchPlaceholder: string;
  /** Where a row opens; none for a table whose rows open nothing. */
  rowHref?: (row: ListRow) => string;
  /** Beside the count: the tracked count. */
  beside?: ReactNode;
  /** The download's columns: each heading and the row's figure under it. */
  download: { header: string; field: ExportField }[];
  /** The empty table's picture. */
  emptyIcon: ReactNode;
};

/** What a list says under its table when Google could not answer, and the way to ask again. */
export function useListProblem(list: ReturnType<typeof useSearchConsoleList>): string | null {
  const t = useTranslations("searchConsole");
  const problem = list.table.problem;
  return problem ? t(problem === "NOT_CONNECTED" ? "record.notConnected" : problem === "GOOGLE_BUSY" ? "record.busy" : "record.refused") : null;
}

/**
 * A Search Console list screen as every page draws it (search-console-plan.md
 * §13.1): its header — title and description — then, inside the website's
 * gate, the kind of result, the page's hero boxes and any chart, then the
 * search box and the page's filter chips on one row, the table bar with its
 * count, the tracked count beside it and the download, headings that sort,
 * Sites' pager, every row opening its own screen.
 */
export function SearchConsoleListScreen({
  title,
  description,
  icon,
  heroes,
  children,
  table,
}: {
  title: string;
  description: ReactNode;
  icon: ReactNode;
  /** The hero boxes above the table. */
  heroes?: ReactNode;
  /** Between the hero boxes and the table: a chart. */
  children?: ReactNode;
  table: ListTableSpec;
}) {
  const t = useTranslations("searchConsole");
  const router = useRouter();
  const { list, rowHref } = table;
  const problem = useListProblem(list);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={icon} title={title} description={description} />
      {list.status ? (
        <SearchConsoleGate status={list.status} siteId={list.siteId}>
          <ResultKindSwitch />
          {heroes}
          {children}
          {list.preparing ? <p className="text-[12px] text-muted">{t("table.preparing")}</p> : null}
          <DataTable
            rows={list.table.pageRows}
            rowKey={(row) => row.key}
            onRowClick={rowHref ? (row) => router.push(rowHref(row)) : undefined}
            minWidthClassName="min-w-[760px]"
            search={{ value: list.search, onChange: list.setSearch, placeholder: table.searchPlaceholder }}
            filters={table.chips.length > 0 ? <SearchConsoleChips chips={table.chips} /> : undefined}
            cardHeader={
              <SiteTableBar
                footer={list.table.footer}
                noun={table.noun}
                actions={<SearchConsoleDownload ask={list.download} headers={table.download.map((entry) => entry.header)} fields={table.download.map((entry) => entry.field)} />}
              >
                {table.beside}
                {list.live ? <span className="text-[12px] text-secondary">{t("table.asked")}</span> : null}
              </SiteTableBar>
            }
            sort={list.order.tableSort}
            rowClassName={(row) => (row.tracked ? "bg-brand/5" : "")}
            empty={{ icon: table.emptyIcon, label: problem ?? (list.filtered ? t("table.noMatch") : t("table.empty")) }}
            footer={list.table.footer}
            columns={table.columns}
          />
          {list.table.problem === "GOOGLE_BUSY" ? (
            <div>
              <Button variant="quiet" onClick={list.retry}>{t("record.tryAgain")}</Button>
            </div>
          ) : null}
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
