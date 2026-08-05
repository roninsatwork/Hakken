"use client";

import Link from "next/link";
import { ClipboardList, History, ScrollText, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";

/**
 * The way in to everything in this section.
 *
 * A placeholder for the governance dashboard, which is deliberately the last
 * thing built rather than the first. The dashboard is the part that demos well,
 * and a dashboard drawn over an empty register is a screenshot rather than a
 * product — so until the register is filling itself and risk ratings mean
 * something, this says what is here and sends the reader to it.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
const sections = [
  { key: "register", href: "/admin/governance/register", icon: ClipboardList },
  { key: "approvals", href: "/admin/governance/approvals", icon: ShieldCheck },
  { key: "auditTrail", href: "/admin/governance/audit-trail", icon: History },
  { key: "policies", href: "/admin/governance/policies", icon: ScrollText },
];

export default function GovernanceOverviewPage() {
  const t = useTranslations("admin.governance.overview");

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={<ShieldCheck className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

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
