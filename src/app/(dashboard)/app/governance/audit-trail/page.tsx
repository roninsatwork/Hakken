"use client";

import { useQuery } from "convex/react";
import { History } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { AuditLogsTable } from "@/src/app/(dashboard)/admin/settings/_components/AuditLogsTable";

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
      <AdminPageHeader
        icon={<History className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <AuditLogsTable logs={logs} />
    </div>
  );
}
