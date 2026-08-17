"use client";

import { useQuery } from "convex/react";
import { ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";

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

      {/* TableShell draws the table element itself, so what goes in is the
          head and body. Passing another table nested one inside the other and
          left the outer one empty. */}
      <TableShell minWidthClassName="min-w-[820px]">
          <thead>
            <TableHeaderRow>
              <TableHeaderCell>{t("table.name")}</TableHeaderCell>
              <TableHeaderCell>{t("table.applies")}</TableHeaderCell>
              <TableHeaderCell>{t("table.priority")}</TableHeaderCell>
              <TableHeaderCell>{t("table.instruction")}</TableHeaderCell>
            </TableHeaderRow>
          </thead>
          <tbody>
            {active === undefined ? (
              <TableLoadingRow colSpan={4} />
            ) : active.length === 0 ? (
              <TableEmptyRow colSpan={4} icon={<ScrollText className="w-5 h-5" />} label={t("empty")} />
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
      </TableShell>
    </div>
  );
}
