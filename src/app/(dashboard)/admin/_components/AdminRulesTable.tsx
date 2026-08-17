"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit2, Power, Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  PaginationFooter,
  TableEmptyRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { STATUS_TONE_CLASSES, toneForStatus, type StatusTone } from "@/src/ui/atoms/statusTone";

export type AdminRuleTableRow = {
  _id: Id<"aiRules">;
  priority: string;
  name?: string;
  trigger?: string;
  isActive: boolean;
};

type AdminRulesTableProps = {
  rules: AdminRuleTableRow[];
  isLoading: boolean;
  emptyIcon: ReactNode;
  emptyLabel: ReactNode;
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  getRowHref: (rule: AdminRuleTableRow) => string;
  getEditHref: (rule: AdminRuleTableRow) => string;
  onToggleActive: (rule: AdminRuleTableRow) => void;
  onDelete: (rule: AdminRuleTableRow) => void;
  labels: {
    priority: string;
    rule: string;
    status: string;
    activate: string;
    deactivate: string;
    edit: string;
    delete: string;
  };
};

/**
 * Rule priorities are a four-step scale (LOW/NORMAL/HIGH/CRITICAL), so NORMAL
 * reads as info and HIGH as warning — only CRITICAL is danger. toneForStatus
 * covers anything else that ends up in the priority column.
 */
const PRIORITY_TONES: Record<string, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "warning",
  NORMAL: "info",
  LOW: "neutral",
};

function priorityTone(priority: string): StatusTone {
  return PRIORITY_TONES[priority] ?? toneForStatus(priority);
}

export function AdminRulesTable({
  rules,
  isLoading,
  emptyIcon,
  emptyLabel,
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  getRowHref,
  getEditHref,
  onToggleActive,
  onDelete,
  labels,
}: AdminRulesTableProps) {
  const router = useRouter();

  return (
    <TableShell
      footer={
        <PaginationFooter
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          isLoading={isLoading}
          onPageChange={onPageChange}
        />
      }
    >
      <thead>
        <tr className="border-b border-border-dim/50 bg-sidebar/40">
          <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[120px]">
            {labels.priority}
          </th>
          <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[250px]">
            {labels.rule}
          </th>
          <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[100px] text-right">
            {labels.status}
          </th>
          <th className="w-[100px] px-5 py-3.5"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/5">
        {isLoading ? (
          <TableLoadingRow colSpan={4} />
        ) : rules.length === 0 ? (
          <TableEmptyRow colSpan={4} icon={emptyIcon} label={emptyLabel} />
        ) : (
          rules.map((rule) => (
            <tr
              key={rule._id}
              onClick={() => router.push(getRowHref(rule))}
              className="group hover:bg-white/[0.02] transition-colors items-center cursor-pointer"
            >
              <td className="px-5 py-4 align-middle">
                <div className={`w-max px-2 py-0.5 rounded-[4px] text-[10px] font-bold tracking-[0.1em] uppercase border flex-shrink-0 ${STATUS_TONE_CLASSES[priorityTone(rule.priority)]}`}>
                  {rule.priority}
                </div>
              </td>
              <td className="px-5 py-4 align-middle">
                <h3 className="text-[13px] font-bold text-foreground group-hover:text-brand transition-colors line-clamp-1">
                  {rule.name || `"${rule.trigger}"`}
                </h3>
              </td>
              <td className="px-5 py-4 align-middle text-right border-r border-white/5">
                <button
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleActive(rule);
                  }}
                  className="hover:text-foreground transition-colors p-1 flex justify-end w-full"
                  title={rule.isActive ? labels.deactivate : labels.activate}
                >
                  <Power className={`w-4 h-4 ${rule.isActive ? "text-warning" : "opacity-40"}`} />
                </button>
              </td>
              <td className="px-5 py-4 align-middle text-right">
                <div className="flex items-center justify-end gap-3 text-secondary">
                  <Link
                    href={getEditHref(rule)}
                    onClick={(event) => event.stopPropagation()}
                    className="hover:text-foreground transition-colors p-1"
                    title={labels.edit}
                  >
                    <Edit2 className="w-4 h-4 opacity-70 hover:opacity-100" />
                  </Link>
                  <button
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDelete(rule);
                    }}
                    className="transition-colors group/trash p-1"
                    title={labels.delete}
                  >
                    <Trash2 className="w-4 h-4 text-destructive/60 group-hover/trash:text-destructive" />
                  </button>
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </TableShell>
  );
}
