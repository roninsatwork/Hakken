"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { ChartNoAxesCombined } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { SearchBar } from "@/src/ui/components/screens/Table";
import { Select } from "@/src/ui/components/screens/Select";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";

type Overview = FunctionReturnType<typeof api.billingMetrics.overview>;
export default function BillingOverviewPage() {
  const t = useTranslations("billingAdmin");
  const state = useTranslations("billing.states");
  const locale = useLocale();
  const overview = useAction(api.billingMetrics.overview);
  const [report, setReport] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const [request, setRequest] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const companies = useServerPagedTable(api.billingAdmin.listCompanies, { searchTerm, ...(statusFilter ? { status: statusFilter } : {}) });
  useEffect(() => {
    let current = true;
    void overview({}).catch(() => { if (current) setFailed(true); return null; }).then(data => { if (current && data) setReport(data); });
    return () => { current = false; };
  }, [overview, request]);
  const money = (amount: number, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100);
  const date = (time: number) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(time);
  return <div className="flex flex-col gap-6 pb-12">
    <PageHeader icon={<ChartNoAxesCombined className="h-6 w-6 text-brand" />} title={t("overview")} description={t("overviewDescription")}
      action={<Button variant="quiet" disabled={!report && !failed} onClick={() => { setReport(null); setFailed(false); setRequest(n => n + 1); }}>{t("refresh")}</Button>} />
    <SaveError>{failed ? t("failed") : null}</SaveError>
    {!report && !failed && <p role="status">{t("calculating")}</p>}
    {report && <>
      <p className="text-sm text-secondary">{t("reportTime", { date: date(report.completedAt), mode: t(report.mode === "live" ? "live" : "test") })}</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(["paidCompanies", "paidUsers", "paymentIssues", "cancelling", "totalCompanies", "totalUsers", "pending", "canceled"] as const).map(key =>
          <SettingsCard key={key} title={t(key)}><p className="text-3xl font-semibold tabular-nums text-foreground">{report[key].toLocaleString(locale)}</p></SettingsCard>)}
      </div>
      <SettingsCard title={t("monthlyValue")}>
        <div className="flex flex-wrap gap-6">{report.monthlyValue.length ? report.monthlyValue.map(row => <p key={row.currency} className="text-2xl font-semibold text-foreground">{money(row.amountMinor, row.currency)}</p>) : <p>{t("noPaidSubscriptions")}</p>}</div>
        <p className="text-sm text-secondary">{t("metricDefinition")}</p>
        {report.staleAccounts > 0 && <p className="text-sm text-warning">{t("stale", { count: report.staleAccounts })}</p>}
      </SettingsCard>
    </>}
    <PageHeader icon={<ChartNoAxesCombined className="h-5 w-5 text-secondary" />} title={t("companies")} description={t("companiesDescription")} />
    <Select aria-label={t("filterStatus")} value={statusFilter} className="self-start" onChange={value => { setStatusFilter(value); setSearchTerm(""); }}>
      <option value="">{t("allCompanies")}</option>
      {["active", "past_due", "unpaid", "incomplete", "pending", "canceled", "unsupported"].map(status => <option key={status} value={status}>{state(status)}</option>)}
    </Select>
    {!statusFilter && <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder={t("search")} />}
    <DataTable rows={companies.isLoading ? undefined : companies.rows} rowKey={row => row.companyId} minWidthClassName="min-w-[900px]"
      empty={{ icon: <ChartNoAxesCombined className="h-8 w-8 text-muted" />, label: t("empty") }} footer={{ mode: "paged", page: companies.page, totalPages: companies.totalPages, totalCount: companies.loadedCount, pageSize: TABLE_PAGE_SIZE, isLoading: companies.isBusy, onPageChange: companies.goToPage }}
      columns={[
        { key: "company", header: t("company"), cell: row => <Link className="text-foreground underline underline-offset-4" href={`/admin/companies/${row.companyId}/overview`}>{row.companyName}</Link> },
        { key: "plan", header: t("plan"), cell: row => row.planName || t("noPlan") },
        { key: "status", header: t("status"), cell: row => state.has(row.status) ? state(row.status) : row.status },
        { key: "amount", header: t("monthlyValue"), cell: row => row.amountMinor !== null && row.currency ? money(row.amountMinor, row.currency) : "—" },
        { key: "paid", header: t("paidThrough"), cell: row => row.paidThrough ? date(row.paidThrough) : "—" },
        { key: "cancel", header: t("cancellation"), cell: row => row.cancelAtPeriodEnd ? t("atPeriodEnd") : "—" },
        { key: "sync", header: t("lastSync"), cell: row => row.syncedAt ? date(row.syncedAt) : t("never") },
        { key: "stripe", header: t("stripe"), cell: row => row.stripeUrl ? <a href={row.stripeUrl} target="_blank" rel="noopener noreferrer" className="text-secondary underline underline-offset-4">{t("openStripe")}</a> : "—" },
      ]} />
  </div>;
}
