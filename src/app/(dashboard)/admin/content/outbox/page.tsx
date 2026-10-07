"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { OutboxStatus } from "@/convex/outboxSchema";
import { COMMUNICATIONS, type Communication } from "@/convex/utils/communications";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import useDebounce from "@/src/hooks/useDebounce";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { formatDateTime, formatTime } from "@/src/lib/dates";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { OUTBOX_STATUS_TONES } from "./outboxStatus";

const STATUSES: OutboxStatus[] = ["WAITING", "CLAIMED", "SENT", "FAILED", "SKIPPED"];

/**
 * Admin → Content → Outbox (docs/plans/active/outbox-and-preferences-plan.md,
 * C1; board OutboxList): every email waiting to go out and what became of
 * it, newest first — its type of communication, found by its address, by
 * type and by status. A note says when the Outbox Queue Processing Agent next
 * runs and the one address it sends from. Each opens on its own page.
 */
export default function OutboxAdminPage() {
  const t = useTranslations("admin.outbox");
  const tKinds = useTranslations("communications");
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const [status, setStatus] = useState<OutboxStatus | "">("");
  const [communication, setCommunication] = useState<Communication | "">("");
  const [search, setSearch] = useState("");
  const term = useDebounce(search, 250).trim();
  const summary = useQuery(api.outboxAdmin.getOutboxSummaryForAdmin, {});
  const rows = useServerPagedTable(
    api.outboxAdmin.listOutboxForAdmin,
    { ...(status ? { status } : {}), ...(communication ? { communication } : {}), ...(term ? { search: term } : {}) },
    TABLE_PAGE_SIZE,
    { fill: true },
  );
  const kindName = (kind: Communication) => tKinds(`${kind}.name`, { platformName });
  const nextRun = summary?.nextRunAt ? formatTime(summary.nextRunAt, { options: { hour: "2-digit", minute: "2-digit" } }) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader divider icon={<Mail className="h-6 w-6 text-brand" />} title={t("title")} description={t("subtitle")} />

      {summary ? (
        <Notice tone={summary.sentFrom && nextRun ? "info" : "warning"}>
          {!summary.sentFrom
            ? t("noticeNoAddress")
            : nextRun
              ? t("notice", { time: nextRun, count: summary.waiting, address: summary.sentFrom })
              : t("noticeNoRun", { count: summary.waiting })}
        </Notice>
      ) : null}

      <DataTable
        rows={rows.isLoading ? undefined : rows.rows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(`/admin/content/outbox/${row._id}`)}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <>
            <Select chip={{ label: t("typeFilter"), choice: communication ? kindName(communication) : null }} value={communication} onChange={(value) => setCommunication(value as Communication | "")}>
              <option value="">{t("allTypes")}</option>
              {COMMUNICATIONS.map((entry) => (
                <option key={entry} value={entry}>{kindName(entry)}</option>
              ))}
            </Select>
            <Select chip={{ label: t("statusFilter"), choice: status ? t(`statuses.${status}`) : null }} value={status} onChange={(value) => setStatus(value as OutboxStatus | "")}>
              <option value="">{t("allStatuses")}</option>
              {STATUSES.map((entry) => (
                <option key={entry} value={entry}>{t(`statuses.${entry}`)}</option>
              ))}
            </Select>
          </>
        }
        empty={{ icon: <Mail className="h-8 w-8 text-muted/30" />, label: status || communication || term ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: rows.page,
          totalPages: rows.totalPages,
          totalCount: rows.loadedCount,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: rows.isBusy,
          onPageChange: rows.goToPage,
        }}
        columns={[
          {
            key: "to",
            header: t("columns.to"),
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{row.email}</span>
                <span className="text-[12px] text-secondary">{row.language.toUpperCase()}</span>
              </span>
            ),
          },
          { key: "type", header: t("columns.type"), cell: (row) => <TagLabel>{kindName(row.communication)}</TagLabel> },
          {
            key: "status",
            header: t("columns.status"),
            cell: (row) => <StatusLabel tone={OUTBOX_STATUS_TONES[row.status]}>{t(`statuses.${row.status}`)}</StatusLabel>,
          },
          { key: "tries", header: t("columns.tries"), align: "right", cell: (row) => <span className="font-mono text-[12px] tabular-nums text-secondary">{row.attempts}</span> },
          { key: "queued", header: t("columns.queued"), cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDateTime(row.createdAt)}</span> },
          {
            key: "sent",
            header: t("columns.sent"),
            cell: (row) => (row.sentAt
              ? <span className="whitespace-nowrap text-[12px] text-secondary">{formatDateTime(row.sentAt)}</span>
              : <span className="line-clamp-1 text-[12px] text-muted">{row.error ?? (row.status === "WAITING" && nextRun ? t("atNextRun", { time: nextRun }) : t("notYet"))}</span>),
          },
        ]}
      />
    </div>
  );
}
