"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePaginatedQuery } from "convex/react";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { OutboxStatus } from "@/convex/outboxSchema";
import { formatDateTime } from "@/src/lib/dates";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { OUTBOX_STATUS_TONES } from "./outboxStatus";

const STATUSES: OutboxStatus[] = ["WAITING", "CLAIMED", "SENT", "FAILED", "SKIPPED"];

/**
 * Admin → Content → Outbox (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 7): every email queued — today the Weekly News Digest — newest first,
 * filtered by what became of it. Each opens on its own page, with the email
 * as its reader gets it and the runs that queued and sent it.
 */
export default function OutboxAdminPage() {
  const t = useTranslations("admin.outbox");
  const router = useRouter();
  const [status, setStatus] = useState<OutboxStatus | "">("");
  const rows = usePaginatedQuery(api.outboxAdmin.listOutboxForAdmin, status ? { status } : {}, { initialNumItems: TABLE_PAGE_SIZE });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader divider icon={<Mail className="h-6 w-6 text-brand" />} title={t("title")} description={t("subtitle")} />

      <DataTable
        rows={rows.status === "LoadingFirstPage" ? undefined : rows.results}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[860px]"
        onRowClick={(row) => router.push(`/admin/content/outbox/${row._id}`)}
        filters={
          <Select chip={{ label: t("statusFilter"), choice: status ? t(`statuses.${status}`) : null }} value={status} onChange={(value) => setStatus(value as OutboxStatus | "")}>
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((entry) => (
              <option key={entry} value={entry}>{t(`statuses.${entry}`)}</option>
            ))}
          </Select>
        }
        empty={{ icon: <Mail className="h-8 w-8 text-muted/30" />, label: status ? t("noMatch") : t("empty") }}
        footer={{
          mode: "loadMore",
          visibleCount: rows.results.length,
          canLoadMore: rows.status === "CanLoadMore",
          isLoading: rows.isLoading,
          onLoadMore: () => rows.loadMore(TABLE_PAGE_SIZE),
        }}
        columns={[
          {
            key: "to",
            header: t("columns.to"),
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{row.email}</span>
                <span className="text-[12px] text-secondary">{t(`types.${row.messageType}`)} · {row.language.toUpperCase()}</span>
              </span>
            ),
          },
          {
            key: "status",
            header: t("columns.status"),
            cell: (row) => <StatusLabel tone={OUTBOX_STATUS_TONES[row.status]}>{t(`statuses.${row.status}`)}</StatusLabel>,
          },
          { key: "tries", header: t("columns.tries"), cell: (row) => <span className="text-[12px] text-secondary">{row.attempts}</span> },
          { key: "queued", header: t("columns.queued"), cell: (row) => <span className="text-[12px] text-secondary">{formatDateTime(row.createdAt)}</span> },
          {
            key: "sent",
            header: t("columns.sent"),
            cell: (row) => (row.sentAt
              ? <span className="text-[12px] text-secondary">{formatDateTime(row.sentAt)}</span>
              : <span className="line-clamp-1 text-[12px] text-muted">{row.error ?? t("notYet")}</span>),
          },
        ]}
      />
    </div>
  );
}
