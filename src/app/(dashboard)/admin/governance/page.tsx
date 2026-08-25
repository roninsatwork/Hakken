"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { GovernanceDashboard } from "@/src/ui/components/governance/GovernanceDashboard";
import { EvidencePackPanel } from "@/src/ui/components/governance/EvidencePackPanel";
import { PersonalDataPanel } from "@/src/ui/components/governance/PersonalDataPanel";

/**
 * The way in to everything in this section.
 *
 * The dashboard was deliberately the last thing built rather than the first.
 * It is the part that demos well, and a dashboard drawn over an empty register
 * is a screenshot rather than a product — so it waited until the register was
 * filling itself and the risk ratings restrained something real.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
export default function GovernanceOverviewPage() {
  const t = useTranslations("admin.governance.overview");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        divider
        icon={<ShieldCheck className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <GovernanceDashboard />

      <EvidencePackPanel />

      <PersonalDataPanel />
    </div>
  );
}
