"use client";

import { useQuery } from "convex/react";
import { History } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { AuditLogsTable } from "@/src/app/(dashboard)/admin/settings/_components/AuditLogsTable";

/**
 * Everything anyone changed, and when.
 *
 * The record itself is old and thorough — around 130 places in the backend
 * write to it. What it never had was a way in: it lived as a block inside
 * System Settings, under a tab, with no entry in the navigation. The single
 * most compliance-relevant screen on the platform was the hardest one to find,
 * which is why it now sits in Governance beside the register and the approvals.
 *
 * The table is the same component the settings screen used, so the two cannot
 * drift into showing different things.
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
