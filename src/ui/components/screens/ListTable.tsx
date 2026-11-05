"use client";

import type { ComponentProps, ReactNode } from "react";
import { DataTable, type PagedFooterSpec } from "./DataTable";
import { TableBar, type TableNoun } from "./TableBar";

/**
 * A list as every redone screen draws it: its search row, then the table's bar with its count, a line beside it and its download, then
 * the table and its numbered pages (Anthony, 2026-11-05: "I only want reusable shared components"; docs/plans/active/campaigns-new-page-plan-2026-11-05.md,
 * step 7). Google Analytics' lists, Products' table and a page's Sources table each put these together themselves until then. It's given
 * its rows and columns and reads nothing, so each screen still reads its own list and keeps its own download.
 */
export function ListTable<Row>({ noun, title, description, summary, actions, ...table }: Omit<ComponentProps<typeof DataTable<Row>>, "cardHeader" | "footer"> & {
  footer: PagedFooterSpec;
  noun: TableNoun;
  /** A title and a line under it in the bar, for a table that sits among others on its page. */
  title?: string;
  description?: string;
  /** The words beside the count. */
  summary?: ReactNode;
  /** The bar's buttons: the download, and any that work on the rows. */
  actions?: ReactNode;
}) {
  return (
    <DataTable<Row>
      {...table}
      cardHeader={<TableBar footer={table.footer} noun={noun} title={title} description={description} actions={actions}>{summary}</TableBar>}
    />
  );
}
