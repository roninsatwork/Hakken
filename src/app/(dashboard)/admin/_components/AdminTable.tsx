"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

type AdminSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

export function AdminSearchBar({ value, onChange, placeholder }: AdminSearchBarProps) {
  return (
    <div className="w-full flex items-center justify-between p-2 bg-card/40 backdrop-blur-xl border border-border-dim rounded-[16px] shadow-sm">
      <div className="flex items-center gap-2 px-3 flex-1">
        <Search className="w-4 h-4 text-muted" />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent border-none outline-none text-[13px] tracking-wide placeholder:text-muted/60 text-foreground"
        />
      </div>
    </div>
  );
}

type AdminTableShellProps = {
  children: ReactNode;
  footer?: ReactNode;
  minWidthClassName?: string;
};

export function AdminTableShell({ children, footer, minWidthClassName = "min-w-[1000px]" }: AdminTableShellProps) {
  return (
    <div className="flex flex-col gap-0 border border-border-dim/80 bg-sidebar/20 rounded-[16px] overflow-hidden shadow-sm relative w-full">
      <div className="w-full overflow-x-auto">
        <table className={`w-full text-left border-collapse ${minWidthClassName}`}>{children}</table>
      </div>
      {footer}
    </div>
  );
}

type AdminTableLoadingRowProps = {
  colSpan: number;
  accentClassName?: string;
};

export function AdminTableLoadingRow({ colSpan, accentClassName = "text-brand" }: AdminTableLoadingRowProps) {
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

export function AdminTableEmptyRow({ colSpan, icon, label, action }: AdminTableEmptyRowProps) {
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

export function AdminPaginationFooter({
  page,
  totalPages,
  totalCount,
  pageSize,
  isLoading,
  onPageChange,
  labels,
}: AdminPaginationFooterProps) {
  const safeTotalPages = Math.max(totalPages, 1);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="w-full p-4 border-t border-border-dim/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-sidebar/40">
      <div className="text-[12px] font-medium text-secondary">
        {totalCount > 0 ? (
          <span>{labels?.showing?.(start, end, totalCount) ?? `Showing ${start}-${end} of ${totalCount}`}</span>
        ) : (
          <span>{labels?.empty ?? "No entries found"}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1 || isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim"
        >
          <ChevronLeft className="w-4 h-4" />
          {labels?.previous ?? "Previous"}
        </button>

        <div className="flex items-center justify-center min-w-[100px] text-[12px] font-medium tracking-wide">
          {labels?.page?.(page, safeTotalPages) ?? `Page ${page} of ${safeTotalPages}`}
        </div>

        <button
          onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
          disabled={page >= safeTotalPages || isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim"
        >
          {labels?.next ?? "Next"}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
