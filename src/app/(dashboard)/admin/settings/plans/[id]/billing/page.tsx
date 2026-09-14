"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { CreditCard } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BillingOperatorGate } from "@/src/ui/components/billing/BillingOperatorGate";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { Button } from "@/src/ui/components/screens/Button";
import { Select } from "@/src/ui/components/screens/Select";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";

type Price = FunctionReturnType<typeof api.billingAdminActions.listPrices>["prices"][number];
export default function PlanBillingPage() {
  const { id } = useParams<{ id: string }>();
  return <BillingOperatorGate><PricePicker planId={id as Id<"plans">} /></BillingOperatorGate>;
}

function PricePicker({ planId }: { planId: Id<"plans"> }) {
  const t = useTranslations("billingAdmin");
  const locale = useLocale();
  const plan = useQuery(api.billingAdmin.getPlan, { planId });
  const settings = useQuery(api.billingAdmin.getSettings, {});
  const list = useAction(api.billingAdminActions.listPrices);
  const link = useAction(api.billingAdminActions.linkPrice);
  const action = useAdminAction({ scope: "plan-stripe-price" });
  const [prices, setPrices] = useState<Price[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const current = settings?.config.offers.find(o => o.planId === planId);
  const selectedPrice = selected ?? current?.stripePriceId ?? "";
  const load = async () => {
    const result = await action.run(() => list(cursor ? { cursor } : {}), { fallbackMessage: t("failed"), suppressErrorToast: true });
    if (result.ok) { setPrices(old => [...new Map([...old, ...result.data.prices].map(p => [p.id, p])).values()]); setCursor(result.data.cursor); setLoaded(true); }
  };
  const priceLabel = (price: { amountMinor: number; currency: string }) => new Intl.NumberFormat(locale, { style: "currency", currency: price.currency }).format(price.amountMinor / 100);
  return <div className="flex flex-col gap-6 pb-12">
    <DetailHeader icon={<CreditCard className="h-6 w-6 text-brand" />} title={t("linkPrice")} description={plan?.name ?? t("loading")} back={{ href: "/admin/settings/plans", label: t("backPlans") }} />
    {plan === null ? <p>{t("noPlan")}</p> : !settings || !plan ? <p role="status">{t("loading")}</p> : <>
      <SettingsCard title={t("stripePrice")}>
        <p className="text-sm text-secondary">{t("priceHelp")}</p>
        {current && <p>{t("currentPrice", { price: priceLabel(current) })}</p>}
        <Select aria-label={t("stripePrice")} value={selectedPrice} onChange={setSelected} disabled={action.isBusy()}>
          <option value="">{t("notOffered")}</option>
          {current && !prices.some(p => p.id === current.stripePriceId) && <option value={current.stripePriceId}>{t("currentPrice", { price: priceLabel(current) })}</option>}
          {prices.map(price => <option key={price.id} value={price.id}>{price.name} — {priceLabel(price)}</option>)}
        </Select>
        {(!loaded || cursor) && <Button variant="quiet" className="self-start" disabled={action.isBusy()} onClick={() => void load()}>{t(loaded ? "morePrices" : "loadPrices")}</Button>}
        {loaded && !prices.length && <p>{t("noPrices")}</p>}
        {!plan.active && <p>{t("inactivePlan")}</p>}
      </SettingsCard>
      <SaveError>{action.error}</SaveError>
      <SaveAction isSaving={action.isBusy()} disabled={(!plan.active && !!selectedPrice) || selectedPrice === (current?.stripePriceId ?? "")} label={t("save")} savingLabel={t("saving")}
        onClick={() => void action.run(() => link({ planId, priceId: selectedPrice || null, revision: settings.revision }), { fallbackMessage: t("failed"), successMessage: t("saved"), suppressErrorToast: true })} />
    </>}
  </div>;
}
