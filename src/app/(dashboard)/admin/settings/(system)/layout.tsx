"use client";

import { useTranslations } from "next-intl";
import {
  Building2,
  Database,
  Hourglass,
  Palette,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";

import { AdminDetailLayout } from "@/src/app/(dashboard)/admin/_components/AdminDetailLayout";

const SETTINGS_ROOT = "/admin/settings";

/**
 * The two-level menu for system settings.
 *
 * It lives in a `(system)` route group rather than at `settings/layout.tsx`
 * because Plans, API Keys, Analytics and Scripts are sibling routes under the
 * same path and must not inherit this header.
 *
 * Everything here used to be five flat tabs on one page, with eight unrelated
 * sections stacked under "System Options" and the agent approval window filed
 * under log retention. Grouping follows the Companies screens: a short top row
 * of subjects, each opening the screens that belong to it.
 *
 * A fourth group, White Label, was removed with the feature: six read-only
 * panels grading how far a rebrand had got, built to serve turning this repo
 * into packaged vertical products. That premise went when the template
 * machinery was deleted and the repo became something you clone whole.
 */
export default function SystemSettingsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin.settings");

  const tabs = [
    {
      label: t("nav.identity"),
      href: `${SETTINGS_ROOT}/identity`,
      icon: Building2,
      dropdownItems: [
        { label: t("nav.coreIdentity"), href: `${SETTINGS_ROOT}/identity`, icon: Building2 },
        { label: t("nav.aesthetics"), href: `${SETTINGS_ROOT}/identity/aesthetics`, icon: Palette },
      ],
    },
    {
      label: t("nav.security"),
      href: `${SETTINGS_ROOT}/security`,
      icon: ShieldCheck,
      dropdownItems: [
        { label: t("nav.systemSecurity"), href: `${SETTINGS_ROOT}/security`, icon: ShieldCheck },
        { label: t("nav.retention"), href: `${SETTINGS_ROOT}/security/retention`, icon: Database },
        { label: t("nav.purgeHistory"), href: `${SETTINGS_ROOT}/security/purge-history`, icon: Hourglass },
      ],
    },
    {
      label: t("nav.options"),
      href: `${SETTINGS_ROOT}/options`,
      icon: SettingsIcon,
      dropdownItems: [
        { label: t("nav.diagnostics"), href: `${SETTINGS_ROOT}/options`, icon: TerminalSquare },
        { label: t("nav.selfImprovement"), href: `${SETTINGS_ROOT}/options/self-improvement`, icon: Sparkles },
        { label: t("nav.approvals"), href: `${SETTINGS_ROOT}/options/approvals`, icon: Hourglass },
      ],
    },
  ];

  return (
    <AdminDetailLayout
      leading={<SettingsIcon className="w-6 h-6 text-brand shrink-0" />}
      title={t("title")}
      description={t("subtitle")}
      tabs={tabs}
      rootHref={SETTINGS_ROOT}
    >
      {children}
    </AdminDetailLayout>
  );
}
