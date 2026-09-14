"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { CreditCard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";
import { Select } from "@/src/ui/components/screens/Select";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { SaveError } from "@/src/ui/components/screens/SaveControls";

const statuses = ["manual", "pending", "incomplete", "incomplete_expired", "trialing", "active", "past_due", "unpaid", "canceled", "paused", "unsupported"];

export default function BillingPage() {
  const t = useTranslations("billing");
  const locale = useLocale();
  const status = useQuery(api.billing.getStatus, {});
  const checkout = useAction(api.billingActions.createCheckout);
  const portal = useAction(api.billingActions.createPortal);
  const refresh = useAction(api.billingActions.refresh);
  const action = useAdminAction({ scope: "company-billing" });
  const [selected, setSelected] = useState("");
  const offerKey = status?.offers.some(o => o.key === selected) ? selected : status?.offers[0]?.key ?? "";
  const redirect = async (perform: () => Promise<string>) => {
    const result = await action.run(perform, { fallbackMessage: t("failed"), suppressErrorToast: true });
    if (result.ok) window.location.assign(result.data);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader divider icon={<CreditCard className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />
      {status === undefined ? <p role="status">{t("loading")}</p> : !status ? <p>{t("restricted")}</p> : !status.enabled ? <p>{t("disabled")}</p> : <>
        <SettingsCard title={t("subscription")}>
          {status.planName && <p className="text-xl font-semibold text-foreground">{status.planName}</p>}
          <p className="text-foreground" role="status">{t(`states.${statuses.includes(status.status) ? status.status : "unsupported"}`)}</p>
          {status.managed && <p className="text-sm text-secondary">{status.accessAllowed ? t("accessActive") : t("accessPaused")}</p>}
          {status.paidThrough > 0 && <p className="text-sm text-secondary">{t("paidThrough", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(status.paidThrough) })}</p>}
          {status.cancelAtPeriodEnd && <p className="text-sm text-secondary">{t("cancelScheduled")}</p>}
          <p className="text-sm text-muted">{t("confirmation")}</p>
          <div className="flex flex-wrap gap-3">
            {status.hasCustomer && <Button variant="quiet" disabled={action.isBusy()} onClick={() => void redirect(async () => await portal({}))}>{t("portal")}</Button>}
            {status.managed && <Button variant="quiet" disabled={action.isBusy()} onClick={() => void action.run(() => refresh({}), { fallbackMessage: t("failed"), suppressErrorToast: true })}>{t("refresh")}</Button>}
          </div>
        </SettingsCard>
        {status.canCheckout && <SettingsCard title={t("choosePlan")}>
          <p className="text-sm text-secondary">{t("enrollment")}</p>
          {status.offers.length ? <>
            <label htmlFor="billing-offer" className="text-sm text-secondary">{t("plan")}</label>
            <Select id="billing-offer" value={offerKey} onChange={setSelected} disabled={action.isBusy()}>
              {status.offers.map(offer => <option key={offer.key} value={offer.key}>{t("monthlyPrice", { name: offer.name, price: new Intl.NumberFormat(locale, { style: "currency", currency: offer.currency }).format(offer.amountMinor / 100) })}</option>)}
            </Select>
            <Button variant="brand" className="self-start" disabled={action.isBusy() || !offerKey} onClick={() => void redirect(async () => await checkout({ offerKey }))}>
              {action.isBusy() ? t("working") : t("checkout")}
            </Button>
          </> : <p>{t("noOffers")}</p>}
        </SettingsCard>}
        {!status.managed && !status.canCheckout && <p>{t("manualPlan")}</p>}
        <SaveError>{action.error}</SaveError>
      </>}
    </div>
  );
}
