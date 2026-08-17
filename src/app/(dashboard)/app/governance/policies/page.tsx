"use client";

import { useQuery } from "convex/react";
import { ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";

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
      <PageHeader
        icon={<ScrollText className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <DataTable
        rows={active}
        rowKey={(rule) => rule._id}
        minWidthClassName="min-w-[820px]"
        empty={{ icon: <ScrollText className="w-5 h-5" />, label: t("empty") }}
        columns={[
          {
            key: "name",
            header: t("table.name"),
            cell: (rule) => (
              <span className="text-[13px] font-medium text-foreground">
                {rule.name || t("table.unnamed")}
              </span>
            ),
          },
          {
            key: "applies",
            header: t("table.applies"),
            // Said in words rather than as a scope code, because the reader
            // here is not the person who set it up.
            cell: (rule) => (
              <span className="text-[13px] text-secondary">
                {rule.agentId
                  ? t("scope.agent")
                  : rule.companyId
                    ? t("scope.workspace")
                    : t("scope.everywhere")}
              </span>
            ),
          },
          {
            key: "priority",
            header: t("table.priority"),
            cell: (rule) => <span className="text-[13px] text-secondary">{rule.priority}</span>,
          },
          {
            key: "instruction",
            header: t("table.instruction"),
            className: "max-w-[380px]",
            cell: (rule) => (
              <span className="line-clamp-2 text-[13px] text-secondary">{rule.instruction}</span>
            ),
          },
        ]}
      />
    </div>
  );
}
