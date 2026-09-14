"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";

export function CompanyBillingCard({ companyId }: { companyId: Id<"companies"> }) {
  const billing = useQuery(api.billingAdmin.getCompany, { companyId });
  const t = useTranslations("billingAdmin");
  const state = useTranslations("billing.states");
  const locale = useLocale();
  return <SettingsCard title={t("companySubscription")}>
    {billing === undefined ? <p role="status">{t("loading")}</p> : !billing ? <p>{t("empty")}</p> : <>
      <p className="text-lg font-semibold text-foreground">{billing.planName || t("noPlan")}</p>
      <p>{state.has(billing.status) ? state(billing.status) : billing.status}</p>
      {billing.paidThrough > 0 && <p>{t("paidUntil", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(billing.paidThrough) })}</p>}
      {billing.cancelAtPeriodEnd && <p className="text-warning">{t("atPeriodEnd")}</p>}
      {billing.managed && <p className="text-sm text-secondary">{t("stripeManaged")}</p>}
      {billing.stripeUrl && <a href={billing.stripeUrl} target="_blank" rel="noopener noreferrer" className="self-start text-sm text-secondary underline underline-offset-4">{t("openStripe")}</a>}
    </>}
  </SettingsCard>;
}
