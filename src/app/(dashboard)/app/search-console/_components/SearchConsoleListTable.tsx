"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FunctionArgs } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar, type TableNoun } from "@/src/ui/components/screens/TableBar";
import { ResultKindSwitch, SearchConsoleGate, canRetry, liveProblemKey } from "./SearchConsoleNotices";
import { SearchConsoleChips, SearchConsoleListDownload, type ChipId, type ListRow, type useSearchConsoleList } from "./SearchConsoleTables";

export type ExportField = FunctionArgs<typeof api.searchConsoleLists.exportSearchConsoleList>["fields"][number];

/** What a list's table is: its rows' columns, chips, noun and download, and where a row opens. */
export type ListTableSpec = {
  list: ReturnType<typeof useSearchConsoleList>;
  columns: DataTableColumn<ListRow>[];
  chips: readonly ChipId[];
  noun: TableNoun;
  searchPlaceholder: string;
  /** Where a row opens; none for a table whose rows open nothing. */
  rowHref?: (row: ListRow) => string;
  /** Beside the count: the tracked count. */
  beside?: ReactNode;
  /** The download's columns: each heading and the row's figure under it. */
  download: { header: string; field: ExportField }[];
  /** The empty table's picture. */
  emptyIcon: ReactNode;
  /** What the table says with nothing listed and nothing searched: the page's own words, or "Nothing in these dates." */
  emptyLabel?: string;
  /** False for a list of only tracked rows (Tracked keywords, Tracked pages), where marking each one tracked says nothing. */
  markTracked?: boolean;
};

/** What a list says under its table when Google could not answer, and the way to ask again. */
export function useListProblem(list: ReturnType<typeof useSearchConsoleList>): string | null {
  const t = useTranslations("searchConsole");
  const problem = list.table.problem;
  return problem ? t(liveProblemKey(problem)) : null;
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
            search={{ value: list.search, onChange: list.setSearch, placeholder: table.searchPlaceholder }}
            filters={table.chips.length > 0 ? <SearchConsoleChips chips={table.chips} /> : undefined}
            cardHeader={
              <TableBar
                footer={list.table.footer}
                noun={table.noun}
                actions={<SearchConsoleListDownload list={list} download={table.download} />}
              >
                {table.beside}
                {list.live ? <span className="text-[12px] text-secondary">{t("table.asked")}</span> : null}
              </TableBar>
            }
            sort={list.order.tableSort}
            rowClassName={(row) => (row.tracked && table.markTracked !== false ? "bg-brand/5" : "")}
            empty={{ icon: table.emptyIcon, label: problem ?? (list.filtered ? t("table.noMatch") : (table.emptyLabel ?? t("table.empty"))) }}
            footer={list.table.footer}
            columns={table.columns}
          />
          {canRetry(list.table.problem) ? (
            <div>
              <Button variant="quiet" onClick={list.retry}>{t("record.tryAgain")}</Button>
            </div>
          ) : null}
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
