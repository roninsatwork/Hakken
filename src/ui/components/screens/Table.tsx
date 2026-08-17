"use client";

import { createContext, useContext } from "react";
import type { KeyboardEventHandler, ReactNode, Ref } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { useCanWriteHere } from "./AccessLevel";

type AdminSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

export function SearchBar({ value, onChange, placeholder }: AdminSearchBarProps) {
  return (
    <div className="w-full flex items-center justify-between p-2 bg-card/40 backdrop-blur-xl border border-border-dim rounded-[16px] shadow-sm">
      <div className="flex items-center gap-2 px-3 flex-1">
        <Search className="w-4 h-4 text-muted" />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          /**
           * The magnifying glass is a picture and the placeholder disappears the
           * moment anyone types, so without this the search box on every screen
           * using this bar announced itself as nothing at all. Its sister in
           * `TableControls` has carried a label all along; this one had been
           * missed, which is the argument for fixing it here rather than on the
           * screens.
           */
          aria-label={placeholder}
          className="w-full bg-transparent border-none outline-none text-[13px] tracking-wide placeholder:text-muted/60 text-foreground"
        />
      </div>
    </div>
  );
}

type InlineSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  /**
   * Arrow keys and Enter, for a palette whose results are walked from the box.
   * The one behaviour these boxes genuinely differ on.
   */
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  /** For a palette that focuses its box the moment it opens. */
  inputRef?: Ref<HTMLInputElement>;
};

/**
 * A search box that sits inside something else's border.
 *
 * `SearchBar` draws its own card, which is right for a search box sitting above
 * a table and wrong everywhere else. Four screens needed the box without the
 * card — inside a command palette, inside a picker's dropdown, inside a panel
 * that already has a border — and each hand-wrote a borderless input with an
 * icon beside it, because putting `SearchBar` there would have drawn a box
 * inside a box.
 *
 * They were the last screens that could not move onto the kit at all, so the
 * frozen list could not reach zero while this was missing. That is the whole
 * reason it exists: not a new look, but the one arrangement the kit had no way
 * of saying.
 *
 * The magnifying glass is a picture and the placeholder disappears the moment
 * anyone types, so the name is not optional here either.
 */
export function InlineSearchInput({
  value,
  onChange,
  placeholder,
  disabled,
  onKeyDown,
  inputRef,
}: InlineSearchInputProps) {
  return (
    <div className="flex w-full items-center gap-2">
      <Search className="w-4 h-4 shrink-0 text-muted" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        className="w-full bg-transparent border-none outline-none text-[14px] text-foreground placeholder:text-muted disabled:opacity-50"
      />
    </div>
  );
}

/**
 * The three ways a table is framed in this app.
 *
 * `default` is the list-screen card. `panel` is the softer, tighter card the
 * detail pages use — a login history, a conversation list — and pairs with the
 * `strip` header. `bare` draws no card at all, for a table that already sits
 * inside somebody else's panel.
 *
 * `bare` is the one worth explaining. Five screens were left hand-writing their
 * table because wrapping them in the card would have put a card inside a card,
 * which is a worse outcome than the duplication. That was a real objection to a
 * missing option, not to the kit — so the option exists now, and they came on.
 */
type TableShellVariant = "default" | "panel" | "bare";

const SHELL_CLASSES: Record<TableShellVariant, string> = {
  default:
    "flex flex-col gap-0 border border-border-dim/80 bg-sidebar/20 rounded-[16px] overflow-hidden shadow-sm relative w-full",
  panel:
    "flex flex-col gap-0 bg-background/30 border border-border-dim/50 rounded-[12px] overflow-hidden w-full",
  bare: "flex flex-col gap-0 w-full",
};

type AdminTableShellProps = {
  children: ReactNode;
  /**
   * A bar above the table, inside the same border — a heading, usually.
   *
   * The mirror of `footer`, added when the sales-data import history moved onto
   * the kit: it carries "Import history" inside the card, and without a slot
   * for it the choice was to lift the heading outside the border (a visible
   * change) or keep hand-writing the shell (the thing this is replacing).
   */
  header?: ReactNode;
  footer?: ReactNode;
  minWidthClassName?: string;
  variant?: TableShellVariant;
  /** Layout the surrounding page needs — spacing, growing to fill a column. */
  className?: string;
};

export function TableShell({
  children,
  header,
  footer,
  minWidthClassName = "min-w-[1000px]",
  variant = "default",
  className = "",
}: AdminTableShellProps) {
  return (
    <div className={`${SHELL_CLASSES[variant]} ${className}`.trim()}>
      {header}
      <div className="w-full overflow-x-auto">
        <table className={`w-full text-left border-collapse ${minWidthClassName}`}>{children}</table>
      </div>
      {footer}
    </div>
  );
}

/**
 * The two header looks this app actually has.
 *
 * `default` is the plain rule-under-the-labels used by the list screens.
 * `strip` fills the header band and is what the detail pages use for a table
 * sitting inside a panel — a login history, a conversation list — where a bare
 * rule reads as part of the panel above it rather than as a table header.
 *
 * They were found by counting, not chosen: six tables were already drawing the
 * filled band by hand, in three slightly different fills. One of them is now
 * the fill, and the other two were drift.
 */
type TableHeaderVariant = "default" | "strip";

const HEADER_ROW_CLASSES: Record<TableHeaderVariant, string> = {
  default: "border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted",
  strip: "border-b border-border-dim/50 bg-sidebar/20",
};

const HEADER_CELL_CLASSES: Record<TableHeaderVariant, string> = {
  default: "px-4 py-3 font-medium",
  strip: "px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-widest",
};

/**
 * The row tells its cells which look to wear.
 *
 * Passing the variant to every cell would be five chances per table to get it
 * wrong, and a header whose cells disagree with their row is exactly the kind
 * of near-miss nobody spots in review.
 */
const TableHeaderVariantContext = createContext<TableHeaderVariant>("default");

type AdminTableHeaderRowProps = {
  children: ReactNode;
  variant?: TableHeaderVariant;
  className?: string;
};

export function TableHeaderRow({ children, variant = "default", className = "" }: AdminTableHeaderRowProps) {
  return (
    <TableHeaderVariantContext.Provider value={variant}>
      <tr className={`${HEADER_ROW_CLASSES[variant]} ${className}`.trim()}>{children}</tr>
    </TableHeaderVariantContext.Provider>
  );
}

type AdminTableHeaderCellProps = {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
};

export function TableHeaderCell({ children, align = "left", className = "" }: AdminTableHeaderCellProps) {
  const variant = useContext(TableHeaderVariantContext);

  return (
    <th
      className={`${HEADER_CELL_CLASSES[variant]} ${align === "right" ? "text-right" : ""} ${className}`}
    >
      {children}
    </th>
  );
}

type AdminTableLoadingRowProps = {
  colSpan: number;
  accentClassName?: string;
};

export function TableLoadingRow({ colSpan, accentClassName = "text-brand" }: AdminTableLoadingRowProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-16 text-center text-secondary">
        <Loader2 className={`w-6 h-6 animate-spin mx-auto opacity-80 ${accentClassName}`} />
      </td>
    </tr>
  );
}

type AdminTableEmptyRowProps = {
  colSpan: number;
  icon: ReactNode;
  label: ReactNode;
  action?: ReactNode;
};

export function TableEmptyRow({ colSpan, icon, label, action }: AdminTableEmptyRowProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-16 text-center">
        <div className="flex flex-col items-center justify-center gap-4 w-full">
          {icon}
          <span className="text-muted text-[13px] font-medium tracking-widest uppercase">{label}</span>
          {action}
        </div>
      </td>
    </tr>
  );
}

type AdminRowActionsProps = {
  children: ReactNode;
};

export function RowActions({ children }: AdminRowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
      {children}
    </div>
  );
}

type AdminRowIconButtonProps = {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  /**
   * This action only takes the reader somewhere — it opens a detail page or a
   * viewer and changes nothing.
   *
   * Row actions are hidden from accounts that cannot write, and most of them
   * edit or delete. A few navigate, and hiding those would leave a read-only
   * reader looking at a list they cannot open, which defeats the point of the
   * role. Opt in per action rather than by guessing from the label.
   */
  navigates?: boolean;
};

export function RowIconButton({
  children,
  label,
  onClick,
  tone = "default",
  navigates = false,
}: AdminRowIconButtonProps) {
  const canWriteHere = useCanWriteHere();

  if (!canWriteHere && !navigates) return null;

  const toneClass =
    tone === "danger"
      ? "hover:bg-red-500/10 text-secondary hover:text-red-500"
      : "hover:bg-foreground/5 text-secondary hover:text-foreground";

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`p-2 rounded-full transition-colors ${toneClass}`}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

type AdminPaginationFooterProps = {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  labels?: {
    previous?: string;
    next?: string;
    empty?: string;
    page?: (page: number, totalPages: number) => string;
    showing?: (start: number, end: number, total: number) => string;
  };
};

export function PaginationFooter({
  page,
  totalPages,
  totalCount,
  pageSize,
  isLoading,
  onPageChange,
  labels,
}: AdminPaginationFooterProps) {
  const safeTotalPages = Math.max(totalPages, 1);
  const safePage = Math.min(Math.max(page, 1), safeTotalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalCount);

  return (
    <div className="w-full p-4 border-t border-border-dim/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-sidebar/40">
      {/*
        Nothing at all while the query is still out. A count of zero before an
        answer is not the same as an answer of zero, and this slot used to say
        "No entries found" on every list screen for the moment before the rows
        arrived — under a table that was showing a spinner at the time. Saying
        nothing is honest; the spinner is already doing the talking.
      */}
      <div className="text-[12px] font-medium text-secondary">
        {isLoading ? null : totalCount > 0 ? (
          <span>{labels?.showing?.(start, end, totalCount) ?? `Showing ${start}-${end} of ${totalCount}`}</span>
        ) : (
          <span>{labels?.empty ?? "No entries found"}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1 || isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim"
        >
          <ChevronLeft className="w-4 h-4" />
          {labels?.previous ?? "Previous"}
        </button>

        <div className="flex items-center justify-center min-w-[100px] text-[12px] font-medium tracking-wide">
          {labels?.page?.(safePage, safeTotalPages) ?? `Page ${safePage} of ${safeTotalPages}`}
        </div>

        <button
          onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
          disabled={safePage >= safeTotalPages || isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim"
        >
          {labels?.next ?? "Next"}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

type AdminLoadMoreFooterProps = {
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

export function LoadMoreFooter({
  visibleCount,
  canLoadMore,
  isLoading,
  onLoadMore,
  labels,
}: AdminLoadMoreFooterProps) {
  return (
    <div className="w-full p-4 border-t border-border-dim/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-sidebar/40">
      {/* Nothing at all while the query is still out — same reason as the
          numbered footer above. */}
      <div className="text-[12px] font-medium text-secondary">
        {isLoading ? null : visibleCount > 0 ? (
          <span>{labels?.showing?.(visibleCount) ?? `Showing ${visibleCount}`}</span>
        ) : (
          <span>{labels?.empty ?? "No entries found"}</span>
        )}
      </div>

      {canLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none text-foreground border border-border-dim"
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLoading ? labels?.loading ?? "Loading..." : labels?.loadMore ?? "Load more"}
        </button>
      )}
    </div>
  );
}
