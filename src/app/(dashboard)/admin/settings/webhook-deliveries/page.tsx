"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RotateCcw, Send, XCircle } from "lucide-react";
import {
  AdminLoadMoreFooter,
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDateTime } from "@/src/lib/dates";

type DeliveryStatus = "PENDING" | "DELIVERING" | "SUCCESS" | "FAILED" | "RETRY_SCHEDULED" | "ABANDONED";

const STATUS_OPTIONS: Array<{ value: DeliveryStatus | ""; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "DELIVERING", label: "Delivering" },
  { value: "SUCCESS", label: "Success" },
  { value: "FAILED", label: "Failed" },
  { value: "RETRY_SCHEDULED", label: "Retry scheduled" },
  { value: "ABANDONED", label: "Abandoned" },
];

function getStatusTone(status: DeliveryStatus) {
  if (status === "SUCCESS") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (status === "FAILED" || status === "ABANDONED") return "text-red-400 bg-red-500/10 border-red-500/20";
  if (status === "RETRY_SCHEDULED") return "text-amber-300 bg-amber-500/10 border-amber-500/20";
  return "text-sky-300 bg-sky-500/10 border-sky-500/20";
}

function StatusIcon({ status }: { status: DeliveryStatus }) {
  if (status === "SUCCESS") return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (status === "FAILED" || status === "ABANDONED") return <XCircle className="w-3.5 h-3.5" />;
  if (status === "RETRY_SCHEDULED") return <RotateCcw className="w-3.5 h-3.5" />;
  return <Clock3 className="w-3.5 h-3.5" />;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function WebhookDeliveriesPage() {
  const companies = useQuery(api.companies.getCompanyOptions, { limit: 200 });
  const [selectedCompanyId, setSelectedCompanyId] = useState<Id<"companies"> | "">("");
  const [selectedStatus, setSelectedStatus] = useState<DeliveryStatus | "">("");

  const summary = useQuery(api.webhookDeliveries.getSummary, {
    ...(selectedCompanyId ? { companyId: selectedCompanyId } : {}),
    lookbackDays: 7,
  });
  const {
    results: deliveries,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.webhookDeliveries.list,
    {
      ...(selectedCompanyId ? { companyId: selectedCompanyId } : {}),
      ...(selectedStatus ? { status: selectedStatus } : {}),
    },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );

  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Send className="w-6 h-6 text-brand" />
            Webhook Deliveries
          </h1>
          <p className="text-[13px] text-secondary mt-1">
            Inspect tenant callback delivery attempts, retries, and terminal failures.
          </p>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-3 py-2 flex items-center gap-2 text-[12px] text-secondary">
          <AlertTriangle className="w-4 h-4 text-amber-300" />
          Payloads are stored as short previews only; raw callback bodies stay out of the log.
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-3">
          <div className="text-[11px] uppercase tracking-widest font-mono text-muted">7d deliveries</div>
          <div className="text-2xl font-semibold text-foreground mt-1">{summary?.total ?? "-"}</div>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-3">
          <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Success rate</div>
          <div className="text-2xl font-semibold text-emerald-300 mt-1">{summary ? formatPercent(summary.successRate) : "-"}</div>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-3">
          <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Retrying</div>
          <div className="text-2xl font-semibold text-amber-300 mt-1">{summary?.retrying ?? "-"}</div>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-3">
          <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Failed</div>
          <div className="text-2xl font-semibold text-red-300 mt-1">{summary?.failedOrAbandoned ?? "-"}</div>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-3 col-span-2 xl:col-span-1">
          <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Scope</div>
          <div className="text-[13px] font-semibold text-foreground mt-2 capitalize">{summary?.scope ?? "loading"}</div>
        </div>
      </div>

      {summary?.nextActions && (
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {summary.nextActions.map((action) => (
            <div key={action} className="text-[12px] text-secondary flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <span>{action}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="webhook-company" className="block text-[11px] uppercase tracking-widest font-mono text-muted mb-2">Company</label>
          <select
            id="webhook-company"
            value={selectedCompanyId}
            onChange={(event) => setSelectedCompanyId(event.target.value as Id<"companies"> | "")}
            className="h-10 w-full rounded-[8px] border border-border-dim bg-background px-3 text-[13px] text-foreground focus:outline-none focus:border-brand"
          >
            <option value="">All companies</option>
            {(companies ?? []).map((company) => (
              <option key={company._id} value={company._id}>{company.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="webhook-status" className="block text-[11px] uppercase tracking-widest font-mono text-muted mb-2">Status</label>
          <select
            id="webhook-status"
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value as DeliveryStatus | "")}
            className="h-10 w-full rounded-[8px] border border-border-dim bg-background px-3 text-[13px] text-foreground focus:outline-none focus:border-brand"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <AdminTableShell
        footer={
          <AdminLoadMoreFooter
            visibleCount={deliveries.length}
            canLoadMore={canLoadMore}
            isLoading={isLoadingMore}
            onLoadMore={() => loadMore(ADMIN_PAGE_SIZE)}
            labels={{
              empty: "No webhook deliveries logged",
              showing: (count) => `Showing ${count} webhook deliveries`,
              loadMore: "Load more webhook deliveries",
              loading: "Loading webhook deliveries...",
            }}
          />
        }
        minWidthClassName="min-w-[1120px]"
      >
        <thead>
          <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium">Event</th>
            <th className="px-4 py-3 font-medium">Company</th>
            <th className="px-4 py-3 font-medium">Destination</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Attempts</th>
            <th className="px-4 py-3 font-medium">Last outcome</th>
            <th className="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={7} />
          ) : deliveries.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={7}
              icon={<Send className="w-8 h-8 text-muted/30" />}
              label="No webhook deliveries logged"
            />
          ) : deliveries.map((delivery) => (
            <tr key={delivery._id} className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors align-top">
              <td className="px-4 py-3">
                <div className="text-[13px] font-semibold text-foreground">{delivery.eventType}</div>
                <div className="text-[11px] text-muted">
                  {delivery.sourceType ?? "manual"}{delivery.sourceId ? ` · ${delivery.sourceId}` : ""}
                </div>
              </td>
              <td className="px-4 py-3 text-[13px] text-secondary">{delivery.companyName}</td>
              <td className="px-4 py-3">
                <div className="max-w-[260px] truncate text-[12px] font-mono text-secondary" title={delivery.destinationUrl}>
                  {delivery.destinationUrl}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-mono ${getStatusTone(delivery.status)}`}>
                  <StatusIcon status={delivery.status} />
                  {delivery.status}
                </span>
              </td>
              <td className="px-4 py-3 text-[12px] text-secondary">
                <div>{delivery.attemptCount}/{delivery.maxAttempts}</div>
                {delivery.nextAttemptAt && <div className="text-muted">Next {formatDateTime(delivery.nextAttemptAt)}</div>}
              </td>
              <td className="px-4 py-3 text-[12px] text-secondary">
                <div>{delivery.lastStatusCode ? `HTTP ${delivery.lastStatusCode}` : "No response yet"}</div>
                {delivery.lastError && <div className="max-w-[260px] truncate text-red-300" title={delivery.lastError}>{delivery.lastError}</div>}
                {delivery.deliveredAt && <div className="text-muted">Delivered {formatDateTime(delivery.deliveredAt)}</div>}
              </td>
              <td className="px-4 py-3 text-[12px] text-secondary">{formatDateTime(delivery.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </AdminTableShell>
    </div>
  );
}
