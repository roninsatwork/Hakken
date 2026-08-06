"use client";

import Link from "next/link";
import { ClipboardList, History, ScrollText, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { EvidencePackPanel } from "@/src/app/(dashboard)/admin/_components/EvidencePackPanel";

/**
 * The customer's own governance section.
 *
 * The same four screens as the platform one, reaching only this workspace.
 * That split is the product rather than duplication: the pitch is that
 * customers demonstrate *their* compliance, and a customer's compliance
 * officer is not a platform administrator and never will be.
 *
 * Approvals are deliberately absent here for now — the queue is a
 * platform-wide surface and giving a workspace its own needs a scoped query
 * rather than a scoped screen. Listing it and sending someone to an empty page
 * would be worse than not listing it.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
const sections = [
  { key: "register", href: "/app/governance/register", icon: ClipboardList },
  { key: "auditTrail", href: "/app/governance/audit-trail", icon: History },
  { key: "policies", href: "/app/governance/policies", icon: ScrollText },
];

export default function WorkspaceGovernancePage() {
  const t = useTranslations("admin.governance.overview");

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={<ShieldCheck className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("workspaceDescription")}
      />

      <EvidencePackPanel />

      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map(({ key, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            className="flex flex-col gap-2 rounded-[16px] border border-border-dim bg-sidebar/40 p-5 transition-colors hover:border-foreground/30"
          >
            <span className="flex items-center gap-2 text-[14px] font-medium text-foreground">
              <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
              {t(`${key}.title`)}
            </span>
            <span className="text-[13px] leading-relaxed text-secondary">{t(`${key}.description`)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
