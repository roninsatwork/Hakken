"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit2, Power, Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { STATUS_TONE_CLASSES, toneForStatus, type StatusTone } from "@/src/ui/components/screens/statusTone";

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
    <DataTable
      rows={isLoading ? undefined : rules}
      rowKey={(rule) => rule._id}
      onRowClick={(rule) => router.push(getRowHref(rule))}
      empty={{ icon: emptyIcon, label: emptyLabel }}
      footer={{
        mode: "paged",
        page,
        totalPages,
        totalCount,
        pageSize,
        isLoading,
        onPageChange,
      }}
      columns={[
        {
          key: "priority",
          header: labels.priority,
          className: "w-[120px]",
          cell: (rule) => (
            <div className={`w-max px-2 py-0.5 rounded-[4px] text-[10px] font-bold tracking-[0.1em] uppercase border flex-shrink-0 ${STATUS_TONE_CLASSES[priorityTone(rule.priority)]}`}>
              {rule.priority}
            </div>
          ),
        },
        {
          key: "rule",
          header: labels.rule,
          className: "w-[250px]",
          cell: (rule) => (
            <h3 className="text-[13px] font-bold text-foreground group-hover:text-brand transition-colors line-clamp-1">
              {rule.name || `"${rule.trigger}"`}
            </h3>
          ),
        },
        {
          key: "status",
          header: labels.status,
          align: "right",
          className: "w-[100px]",
          cell: (rule) => (
            <RowIconButton
              label={rule.isActive ? labels.deactivate : labels.activate}
              onClick={() => onToggleActive(rule)}
            >
              <Power className={`w-4 h-4 ${rule.isActive ? "text-warning" : "opacity-40"}`} />
            </RowIconButton>
          ),
        },
        {
          key: "actions",
          header: "",
          align: "right",
          className: "w-[100px]",
          cell: (rule) => (
            <RowActions>
              <Link
                href={getEditHref(rule)}
                onClick={(event) => event.stopPropagation()}
                aria-label={labels.edit}
                className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </Link>
              <RowIconButton label={labels.delete} tone="danger" onClick={() => onDelete(rule)}>
                <Trash2 className="w-4 h-4" />
              </RowIconButton>
            </RowActions>
          ),
        },
      ]}
    />
  );
}
