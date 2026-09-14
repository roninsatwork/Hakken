"use client";

import type { ReactNode } from "react";
import { ChartNoAxesCombined, Settings, CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { DetailLayout } from "@/src/ui/components/screens/DetailLayout";
import { BillingOperatorGate } from "@/src/ui/components/billing/BillingOperatorGate";

export default function BillingLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("billingAdmin");
  return <BillingOperatorGate><DetailLayout title={t("title")} description={t("description")}
    leading={<CreditCard className="h-6 w-6 text-brand" />} rootHref="/admin/settings/billing"
    tabs={[
      { href: "/admin/settings/billing", label: t("overview"), icon: ChartNoAxesCombined },
      { href: "/admin/settings/billing/setup", label: t("setup"), icon: Settings },
    ]}>{children}</DetailLayout></BillingOperatorGate>;
}
