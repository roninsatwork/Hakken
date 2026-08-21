"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import {
  CursorFooter,
  LoadMoreFooter,
  PaginationFooter,
  SearchBar,
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "./Table";

/**
 * One table, so there is nothing left to assemble differently.
 *
 * The kit already had every piece of this — shell, header row, header cell,
 * loading row, empty row, search box, both footers — and 64 screens each put
 * them together by hand. That is not sharing; it is sixty-four assemblies of the
 * same parts, and they drifted exactly as you would expect. Counted on
 * 2026-08-16: 66 hand-written header blocks for 64 tables, 86 footers, 61 search
 * boxes.
 *
 * The drift was invisible from the code. A screen could import every shared part
 * and still not match: one put its search box inside a second bordered box,
 * another only drew its footer when there was more to load, so a short list had
 * no footer at all. Both were faithful ports of what was there before, both
 * passed the build check that looks for hand-written markup, and both were spotted
 * in seconds by looking at the screen next to another one.
 *
 * So this owns the whole arrangement and a screen says only what is different
 * about it: its columns, its rows, what its empty state says, and which of the
 * two data modes it is in. There is no third way to arrange it, because there is
 * no arranging left to do.
 *
 * **It changes no behaviour.** A screen that pages keeps paging and a screen that
 * loads more keeps loading more — that is what `footer` selects. The three
 * footers stay three because they follow three behaviours; they are one bar,
 * always present, in one style.
 */

export type DataTableColumn<Row> = {
  /** Stable identity, and the React key for the header and body cells. */
  key: string;
  /**
   * Omit for a column that should not show a heading — a row's buttons, most
   * often. The column still gets a name for screen readers (`hiddenHeader`,
   * "Actions" unless said otherwise): a `<th>` with nothing in it names a
   * column of buttons nothing, which is the one axe finding every list screen
   * shared. Screens that spell the omission `""` or `" "` mean the same thing
   * and are treated the same way.
   */
  header?: ReactNode;
  /** What a screen reader calls a column whose heading is not shown. */
  hiddenHeader?: string;
  align?: "left" | "right";
  /** Width or wrapping the column needs, applied to header and body alike. */
  className?: string;
  cell: (row: Row) => ReactNode;
};

type LoadMoreFooterSpec = {
  mode: "loadMore";
  visibleCount: number;
  canLoadMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  labels?: {
    empty?: string;
    showing?: (count: number) => string;
    loadMore?: string;
    loading?: string;
  };
};

/** Previous and Next over a list too big to count. See `CursorFooter`. */
type CursorFooterSpec = {
  mode: "cursor";
  page: number;
  visibleCount: number;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  onStep: (direction: "back" | "forward") => void;
  labels?: {
    empty?: string;
    showing?: (count: number, page: number) => string;
    previous?: string;
    next?: string;
  };
};

type PagedFooterSpec = {
  mode: "paged";
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  labels?: {
    empty?: string;
    showing?: (start: number, end: number, total: number) => string;
    page?: (page: number, totalPages: number) => string;
    previous?: string;
    next?: string;
  };
};

type DataTableProps<Row> = {
  /** `undefined` means the query has not answered yet, and draws the loading row. */
  rows: Row[] | undefined;
  columns: DataTableColumn<Row>[];
  rowKey: (row: Row) => string;

  /** Shown in place of the rows when there are none. */
  empty: { icon: ReactNode; label: ReactNode; action?: ReactNode };

  /** Omit for a table with no footer — rare, and worth a second thought. */
  footer?: LoadMoreFooterSpec | PagedFooterSpec | CursorFooterSpec;

  /** The house search box, above the table. Omit for a table nobody searches. */
  search?: { value: string; onChange: (next: string) => void; placeholder: string };
  /** Filter chips or dropdowns, beside the search box on the same row. */
  filters?: ReactNode;

  onRowClick?: (row: Row) => void;
  /**
   * Whether this particular row can be clicked, when only some can.
   *
   * Several directories list pending invitations alongside people: the person
   * opens, the invitation does not. Without this the invitation row would take
   * the pointer cursor and the hover, and then do nothing when clicked — which
   * reads as a broken screen rather than a deliberate one.
   */
  rowClickable?: (row: Row) => boolean;
  /** Tinting for a row that is not an ordinary one — a pending invitation, say. */
  rowClassName?: (row: Row) => string;

  variant?: "default" | "panel" | "bare";
  headerVariant?: "default" | "strip";
  minWidthClassName?: string;
  /** Layout the surrounding page needs from the whole block. */
  className?: string;
  /** A bar inside the card, above the header row — a title, usually. */
  cardHeader?: ReactNode;
};

/**
 * The gap between the search row and the table.
 *
 * Owned here rather than left to the page, because it is one of the things that
 * drifted. `gap-5` is the rhythm the admin list screens already use at their
 * root; the evals screen's `gap-6` was the outlier.
 */
const CONTROLS_GAP = "gap-5";

/** Both reference screens agree on these, character for character. */
const ROW_CLASSES = "border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors";
const CELL_CLASSES = "px-4 py-3";

export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  empty,
  footer,
  search,
  filters,
  onRowClick,
  rowClickable,
  rowClassName,
  variant = "default",
  headerVariant = "default",
  minWidthClassName,
  className = "",
  cardHeader,
}: DataTableProps<Row>) {
  const t = useTranslations("ui.table");
  const isLoading = rows === undefined;
  const hasControls = Boolean(search || filters);

  return (
    <div className={`flex flex-col ${CONTROLS_GAP} w-full ${className}`.trim()}>
      {hasControls && (
        <div className="flex items-center gap-3 flex-wrap">
          {search && (
            <div className="flex-1 min-w-[240px]">
              <SearchBar
                value={search.value}
                onChange={search.onChange}
                placeholder={search.placeholder}
              />
            </div>
          )}
          {filters}
        </div>
      )}

      <TableShell
        variant={variant}
        header={cardHeader}
        footer={footer ? renderFooter(footer) : undefined}
        {...(minWidthClassName === undefined ? {} : { minWidthClassName })}
      >
        <thead>
          <TableHeaderRow variant={headerVariant}>
            {columns.map((column) => (
              <TableHeaderCell
                key={column.key}
                align={column.align}
                className={column.className}
              >
                {visibleHeader(column) ?? (
                  <span className="sr-only">{column.hiddenHeader ?? t("actionsColumn")}</span>
                )}
              </TableHeaderCell>
            ))}
          </TableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <TableLoadingRow colSpan={columns.length} />
          ) : rows.length === 0 ? (
            <TableEmptyRow
              colSpan={columns.length}
              icon={empty.icon}
              label={empty.label}
              action={empty.action}
            />
          ) : (
            rows.map((row) => {
              const clickable = Boolean(onRowClick) && rowClickable?.(row) !== false;

              return (
              <tr
                key={rowKey(row)}
                onClick={clickable && onRowClick ? () => onRowClick(row) : undefined}
                className={[
                  ROW_CLASSES,
                  "group",
                  clickable ? "cursor-pointer" : "",
                  rowClassName?.(row) ?? "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      CELL_CLASSES,
                      column.align === "right" ? "text-right" : "",
                      column.className ?? "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
              );
            })
          )}
        </tbody>
      </TableShell>
    </div>
  );
}

/** The heading as written, or null where it is missing or only spacing. */
function visibleHeader<Row>(column: DataTableColumn<Row>) {
  const { header } = column;
  if (header === undefined || header === null) return null;
  if (typeof header === "string" && header.replace(/\u00a0/g, " ").trim() === "") return null;
  return header;
}

function renderFooter(footer: LoadMoreFooterSpec | PagedFooterSpec | CursorFooterSpec) {
  if (footer.mode === "loadMore") {
    return (
      <LoadMoreFooter
        visibleCount={footer.visibleCount}
        canLoadMore={footer.canLoadMore}
        isLoading={footer.isLoading}
        onLoadMore={footer.onLoadMore}
        labels={footer.labels}
      />
    );
  }

  if (footer.mode === "cursor") {
    return (
      <CursorFooter
        page={footer.page}
        visibleCount={footer.visibleCount}
        canGoBack={footer.canGoBack}
        canGoForward={footer.canGoForward}
        isLoading={footer.isLoading}
        onStep={footer.onStep}
        labels={footer.labels}
      />
    );
  }

  return (
    <PaginationFooter
      page={footer.page}
      totalPages={footer.totalPages}
      totalCount={footer.totalCount}
      pageSize={footer.pageSize}
      isLoading={footer.isLoading}
      onPageChange={footer.onPageChange}
      labels={footer.labels}
    />
  );
}
