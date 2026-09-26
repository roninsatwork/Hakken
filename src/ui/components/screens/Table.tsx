"use client";

import { createContext, useContext } from "react";
import type { KeyboardEventHandler, ReactNode, Ref } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { NAV_ACTIVE_PILL, NAV_ACTIVE_TEXT } from "@/src/ui/components/layout/navStyles";
import { Button } from "@/src/ui/components/screens/Button";
import { cn } from "@/src/ui/lib/utils";
import { useCanWriteHere } from "./AccessLevel";
import { pageSlots } from "./pagination";
import { Select } from "./Select";

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
  /** The order a sortable column's rows are in, for screen readers (`DataTable`'s `sort`). */
  ariaSort?: "ascending" | "descending" | "none";
};

export function TableHeaderCell({ children, align = "left", className = "", ariaSort }: AdminTableHeaderCellProps) {
  const variant = useContext(TableHeaderVariantContext);

  return (
    <th
      aria-sort={ariaSort}
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
  /**
   * Shown all the time instead of on hover. For a column whose whole job is
   * the action — "Track it" — where a hidden button reads as an empty cell.
   */
  alwaysVisible?: boolean;
};

export function RowActions({ children, alwaysVisible = false }: AdminRowActionsProps) {
  return (
    <div className={`flex items-center justify-end gap-2 ${alwaysVisible ? "" : "opacity-0 group-hover:opacity-100 transition-opacity"}`}>
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

  return (
    <Button
      variant="icon"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={tone === "danger" ? "hover:bg-red-500/10 hover:text-red-500" : undefined}
      title={label}
      aria-label={label}
    >
      {children}
    </Button>
  );
}

/**
 * The bar every footer sits in, and the sentence on its left.
 *
 * Both of these were written out twice, once per footer, and the count rule was
 * wrong in both: a list said "No entries found" for the moment before its rows
 * arrived, under a table that was showing a spinner at the time. A count of zero
 * before an answer is not the same as an answer of zero. Fixing that meant
 * editing two places that had to agree and had no way of knowing they disagreed,
 * which is the whole argument for it living here once.
 */
function FooterBar({
  children,
  variant = "bar",
}: {
  children: ReactNode;
  /**
   * "bar" sits under a full-width table, where a tinted strip separates the
   * rows from the controls. "quiet" sits under a narrow reading column — the
   * chat logs' conversation list — where that strip is wider than it is tall
   * and the words inside it wrap. Same parts, less furniture.
   */
  variant?: "bar" | "quiet";
}) {
  if (variant === "quiet") {
    return (
      <div className="w-full pt-3 pl-3 pr-1 flex items-center justify-between gap-3">
        {children}
      </div>
    );
  }

  return (
    <div className="w-full p-4 border-t border-border-dim/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-sidebar/40">
      {children}
    </div>
  );
}

/** Nothing while the query is still out; the spinner is already doing the talking. */
function FooterCount({
  isLoading,
  hasRows,
  showing,
  empty,
}: {
  isLoading: boolean;
  hasRows: boolean;
  showing: () => string;
  empty?: string;
}) {
  const t = useTranslations("ui.table");

  return (
    <div className="text-[12px] font-medium text-secondary">
      {isLoading ? null : hasRows ? (
        <span>{showing()}</span>
      ) : (
        <span>{empty ?? t("noEntries")}</span>
      )}
    </div>
  );
}

/**
 * A step-a-page button, so all three footers step alike — and each page
 * number in the numbered one, which is the same control pointed at a page.
 */
function FooterStepButton({
  onClick,
  disabled,
  children,
  label,
  current = false,
  className,
}: {
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
  /** What a screen reader calls a button that shows only an arrow or a number. */
  label?: string;
  /** The page being read: lit as a navigation list lights "you are here", never in brand orange. */
  current?: boolean;
  className?: string;
}) {
  return (
    // Raw on purpose: pagination chrome — borderless until hovered, dims to 30%
    // when it cannot page. No Button variant is this recipe.
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim",
        current && NAV_ACTIVE_PILL,
        current && NAV_ACTIVE_TEXT,
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A table's rows-per-page choice: what it offers, what is chosen, and where a new choice goes. */
export type RowsChoice = {
  choices: readonly number[];
  value: number;
  onChange: (rows: number) => void;
};

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
  /**
   * Numbered pages in place of "Page X of Y", with the count and the rows
   * choice on the right — the Sites tables (docs/plans/active/
   * sites-table-pages-plan.md §2). Every other table keeps Previous, Page X of
   * Y, Next, so nothing outside Sites changes by this existing.
   */
  numbered?: boolean;
  /** How many rows a page shows, chosen beside the count. Only with `numbered`. */
  rowsChoice?: RowsChoice;
};

export function PaginationFooter(props: AdminPaginationFooterProps) {
  if (props.numbered) return <NumberedPaginationFooter {...props} />;
  return <SteppedPaginationFooter {...props} />;
}

function SteppedPaginationFooter({
  page,
  totalPages,
  totalCount,
  pageSize,
  isLoading,
  onPageChange,
  labels,
}: AdminPaginationFooterProps) {
  const t = useTranslations("ui.table");
  const safeTotalPages = Math.max(totalPages, 1);
  const safePage = Math.min(Math.max(page, 1), safeTotalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalCount);

  return (
    <FooterBar>
      <FooterCount
        isLoading={isLoading}
        hasRows={totalCount > 0}
        showing={() => labels?.showing?.(start, end, totalCount) ?? t("showingRange", { start, end, total: totalCount })}
        empty={labels?.empty}
      />

      <div className="flex items-center gap-3">
        <FooterStepButton
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1 || isLoading}
        >
          <ChevronLeft className="w-4 h-4" />
          {labels?.previous ?? t("previous")}
        </FooterStepButton>

        <div className="flex items-center justify-center min-w-[100px] text-[12px] font-medium tracking-wide">
          {labels?.page?.(safePage, safeTotalPages) ?? t("pageOf", { page: safePage, totalPages: safeTotalPages })}
        </div>

        <FooterStepButton
          onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
          disabled={safePage >= safeTotalPages || isLoading}
        >
          {labels?.next ?? t("next")}
          <ChevronRight className="w-4 h-4" />
        </FooterStepButton>
      </div>
    </FooterBar>
  );
}

/**
 * The Ahrefs-style footer Anthony asked for on the Sites tables, 2026-09-25
 * ("I love the way Ahrefs do theirs"): `‹ 1 2 3 4 5 … 31 ›` on the left, any
 * page one click away, and on the right the count and how many rows a page
 * shows. The numbers appear only when there is more than one page, and the
 * rows choice only when there are more rows than its smallest choice — a
 * control that can change nothing is clutter.
 */
function NumberedPaginationFooter({
  page,
  totalPages,
  totalCount,
  pageSize,
  isLoading,
  onPageChange,
  labels,
  rowsChoice,
}: AdminPaginationFooterProps) {
  const t = useTranslations("ui.table");
  const safeTotalPages = Math.max(totalPages, 1);
  const safePage = Math.min(Math.max(page, 1), safeTotalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalCount);
  const showRows = rowsChoice !== undefined && totalCount > Math.min(...rowsChoice.choices);

  return (
    <FooterBar>
      {safeTotalPages > 1 && (
        <nav aria-label={t("pages")} className="flex items-center gap-1">
          <FooterStepButton
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage === 1 || isLoading}
            label={labels?.previous ?? t("previous")}
            className="px-1.5"
          >
            <ChevronLeft className="w-4 h-4" />
          </FooterStepButton>
          {pageSlots(safePage, safeTotalPages).map((slot, index) =>
            slot === "gap" ? (
              <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-[12px] text-muted">
                …
              </span>
            ) : (
              <FooterStepButton
                key={slot}
                onClick={() => onPageChange(slot)}
                disabled={isLoading && slot !== safePage}
                current={slot === safePage}
                label={t("goToPage", { page: slot })}
                className="min-w-[28px] justify-center px-1.5 tabular-nums"
              >
                {slot}
              </FooterStepButton>
            ),
          )}
          <FooterStepButton
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= safeTotalPages || isLoading}
            label={labels?.next ?? t("next")}
            className="px-1.5"
          >
            <ChevronRight className="w-4 h-4" />
          </FooterStepButton>
        </nav>
      )}

      <div className="flex items-center gap-3 sm:ml-auto">
        <FooterCount
          isLoading={isLoading}
          hasRows={totalCount > 0}
          showing={() => labels?.showing?.(start, end, totalCount) ?? t("showingRange", { start, end, total: totalCount })}
          empty={labels?.empty}
        />
        {showRows && (
          <Select
            aria-label={t("rowsPerPage")}
            value={rowsChoice.value}
            onChange={(value) => rowsChoice.onChange(Number(value))}
            selectClassName="h-[32px] text-[12px]"
          >
            {rowsChoice.choices.map((choice) => (
              <option key={choice} value={choice}>
                {t("rowsOption", { count: choice })}
              </option>
            ))}
          </Select>
        )}
      </div>
    </FooterBar>
  );
}

type AdminCursorFooterProps = {
  /** Which page this is. There is no last page to count towards. */
  page: number;
  visibleCount: number;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  onStep: (direction: "back" | "forward") => void;
  labels?: {
    previous?: string;
    next?: string;
    empty?: string;
    showing?: (count: number, page: number) => string;
  };
};

/**
 * Previous and Next over a list too big to count.
 *
 * The numbered footer needs a total, and a total means counting every row in the
 * table before drawing the first one. An agent's job history is the one list
 * where that is not worth doing, so it steps by cursor and says which page it is
 * on rather than how many there are. It had drawn its own footer for this, close
 * enough to the shared one to look deliberate and different enough to be wrong:
 * different button shape, different border, and a count that read "Loading jobs…"
 * where every other list shows nothing and lets the spinner speak.
 *
 * `CursorPaginationFooter` in `CursorPagination.tsx` is the older answer to the
 * same question and does not sit on this bar. Its two callers are out of the
 * current plan's scope; when they come in, they move here and it goes. Pair this
 * with `useCursorPagination` from that file for the cursor stack itself.
 */
export function CursorFooter({
  page,
  visibleCount,
  canGoBack,
  canGoForward,
  isLoading,
  onStep,
  labels,
}: AdminCursorFooterProps) {
  const t = useTranslations("ui.table");

  return (
    <FooterBar>
      <FooterCount
        isLoading={isLoading}
        hasRows={visibleCount > 0}
        showing={() => labels?.showing?.(visibleCount, page) ?? t("showingPage", { count: visibleCount, page })}
        empty={labels?.empty}
      />

      <div className="flex items-center gap-3">
        <FooterStepButton onClick={() => onStep("back")} disabled={!canGoBack || isLoading}>
          <ChevronLeft className="w-4 h-4" />
          {labels?.previous ?? t("previous")}
        </FooterStepButton>

        <FooterStepButton onClick={() => onStep("forward")} disabled={!canGoForward || isLoading}>
          {labels?.next ?? t("next")}
          <ChevronRight className="w-4 h-4" />
        </FooterStepButton>
      </div>
    </FooterBar>
  );
}

type AdminLoadMoreFooterProps = {
  visibleCount: number;
  canLoadMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  variant?: "bar" | "quiet";
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
  variant = "bar",
}: AdminLoadMoreFooterProps) {
  const t = useTranslations("ui.table");

  // A quiet footer sits directly under the column it counts, with no bar of its
  // own, so an empty one would simply repeat the column's own empty state two
  // lines below it. The barred footer keeps saying it: there, the strip is
  // drawn either way and an unlabelled strip reads as a fault.
  if (variant === "quiet" && visibleCount === 0 && !canLoadMore && !isLoading) {
    return null;
  }

  return (
    <FooterBar variant={variant}>
      <FooterCount
        isLoading={isLoading}
        hasRows={visibleCount > 0}
        showing={() => labels?.showing?.(visibleCount) ?? t("showingCount", { count: visibleCount })}
        empty={labels?.empty}
      />

      {canLoadMore && (
        // Raw on purpose: two footer-only recipes chosen by the table variant
        // (a bare text link, a bordered chip) — neither is a Button variant.
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoading}
          className={
            variant === "quiet"
              ? "flex items-center gap-2 text-[12px] text-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
              : "flex items-center gap-2 px-4 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none text-foreground border border-border-dim"
          }
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLoading ? labels?.loading ?? t("loading") : labels?.loadMore ?? t("loadMore")}
        </button>
      )}
    </FooterBar>
  );
}
