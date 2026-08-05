"use client";

import { useQuery } from "convex/react";
import { ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import {
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";

/**
 * The customer's own view of policies.
 *
 * The same screen as the platform one, reaching only this workspace. That
 * split is the product: the pitch is that customers demonstrate *their*
 * compliance, and a customer's compliance officer is not a platform
 * administrator and never will be. Scoping happens in the query, so this
 * cannot show another tenant's records by forgetting a filter here.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
export default function GovernancePoliciesPage() {
  const t = useTranslations("admin.governance.policies");
  const rules = useQuery(api.aiRules.getRules, {});

  const active = rules?.filter((rule) => rule.isActive);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={<ScrollText className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <AdminTableShell minWidthClassName="min-w-[820px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <AdminTableHeaderRow>
              <AdminTableHeaderCell>{t("table.name")}</AdminTableHeaderCell>
              <AdminTableHeaderCell>{t("table.applies")}</AdminTableHeaderCell>
              <AdminTableHeaderCell>{t("table.priority")}</AdminTableHeaderCell>
              <AdminTableHeaderCell>{t("table.instruction")}</AdminTableHeaderCell>
            </AdminTableHeaderRow>
          </thead>
          <tbody>
            {active === undefined ? (
              <AdminTableLoadingRow colSpan={4} />
            ) : active.length === 0 ? (
              <AdminTableEmptyRow colSpan={4} icon={<ScrollText className="w-5 h-5" />} label={t("empty")} />
            ) : (
              active.map((rule) => (
                <tr key={rule._id} className="border-b border-border-dim/50 last:border-0">
                  <td className="px-4 py-3 text-[13px] font-medium text-foreground">
                    {rule.name || t("table.unnamed")}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-secondary">
                    {/* Said in words rather than as a scope code, because the
                        reader here is not the person who set it up. */}
                    {rule.agentId
                      ? t("scope.agent")
                      : rule.companyId
                        ? t("scope.workspace")
                        : t("scope.everywhere")}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-secondary">{rule.priority}</td>
                  <td className="px-4 py-3 text-[13px] text-secondary max-w-[380px]">
                    <span className="line-clamp-2">{rule.instruction}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AdminTableShell>
    </div>
  );
}
