"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { GovernanceDashboard } from "@/src/ui/components/governance/GovernanceDashboard";
import { EvidencePackPanel } from "@/src/ui/components/governance/EvidencePackPanel";
import { PersonalDataPanel } from "@/src/ui/components/governance/PersonalDataPanel";

/**
 * The customer's own governance section.
 *
 * The same standing view as the platform one, reaching only this workspace.
 * That split is the product rather than duplication: the pitch is that
 * customers demonstrate *their* compliance, and a customer's compliance officer
 * is not a platform administrator and never will be.
 *
 * Approvals are deliberately absent here for now — the queue is a platform-wide
 * surface and giving a workspace its own needs a scoped query rather than a
 * scoped screen.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
export default function WorkspaceGovernancePage() {
  const t = useTranslations("admin.governance.overview");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<ShieldCheck className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("workspaceDescription")}
      />

      <GovernanceDashboard />

      <EvidencePackPanel />

      <PersonalDataPanel />
    </div>
  );
}
