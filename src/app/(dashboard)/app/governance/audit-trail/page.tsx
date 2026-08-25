"use client";

import { useQuery } from "convex/react";
import { History, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";

const loadAuditLogsTable = () =>
  import("@/src/ui/components/governance/AuditLogsTable");

function AuditTrailLoading() {
  return (
    <div className="p-8 flex justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-brand" />
    </div>
  );
}

const AuditLogsTable = dynamic(
  () => loadAuditLogsTable().then((module) => module.AuditLogsTable),
  { loading: AuditTrailLoading },
);

/**
 * The customer's own view of audit trail.
 *
 * The same screen as the platform one, reaching only this workspace. That
 * split is the product: the pitch is that customers demonstrate *their*
 * compliance, and a customer's compliance officer is not a platform
 * administrator and never will be. Scoping happens in the query, so this
 * cannot show another tenant's records by forgetting a filter here.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
export default function AuditTrailPage() {
  const t = useTranslations("admin.governance.auditTrail");
  const logs = useQuery(api.auditLogs.getRecentLogs);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<History className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      {logs === undefined ? <AuditTrailLoading /> : <AuditLogsTable logs={logs} />}
    </div>
  );
}
