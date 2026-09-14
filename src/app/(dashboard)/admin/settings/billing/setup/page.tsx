"use client";

import Link from "next/link";
import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { Settings } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Field } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";
import { Button } from "@/src/ui/components/screens/Button";
import { SettingsCard, SettingSwitch } from "@/src/ui/components/screens/SettingsCard";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";

type SettingsData = FunctionReturnType<typeof api.billingAdmin.getSettings>;
export default function BillingSetupPage() {
  const settings = useQuery(api.billingAdmin.getSettings, {});
  const t = useTranslations("billingAdmin");
  return settings ? <SetupForm key={settings.revision} settings={settings} /> : <p role="status">{t("loading")}</p>;
}

function SetupForm({ settings }: { settings: SettingsData }) {
  const t = useTranslations("billingAdmin");
  const locale = useLocale();
  const save = useAction(api.billingAdminActions.saveSettings);
  const check = useAction(api.billingAdminActions.checkConnection);
  const action = useAdminAction({ scope: "platform-billing-setup" });
  const [enabled, setEnabled] = useState(settings.config.enabled);
  const [mode, setMode] = useState(settings.config.mode);
  const [origin, setOrigin] = useState(settings.config.appOrigin);
  const [graceDays, setGraceDays] = useState(settings.config.graceDays ?? 0);
  const [connection, setConnection] = useState<FunctionReturnType<typeof api.billingAdminActions.checkConnection> | null>(null);
  return <form className="flex flex-col gap-6 pb-12" onSubmit={event => {
    event.preventDefault();
    void action.run(() => save({ revision: settings.revision, enabled, mode, appOrigin: origin.trim(), graceDays }), { fallbackMessage: t("failed"), successMessage: t("saved"), suppressErrorToast: true });
  }}>
    <PageHeader icon={<Settings className="h-6 w-6 text-brand" />} title={t("setup")} description={t("setupDescription")} />
    <SettingsCard title={t("connection")}>
      <p className="text-sm text-secondary">{t("credentialsHelp")}</p>
      <div className="flex flex-wrap gap-3">
        <StatusPill tone={settings.secretKeyPresent && settings.secretKeyModeMatches ? "success" : "warning"}>{t(settings.secretKeyPresent && settings.secretKeyModeMatches ? "keyReady" : "keyMissing")}</StatusPill>
        <StatusPill tone={settings.webhookSecretPresent ? "success" : "warning"}>{t(settings.webhookSecretPresent ? "webhookKeyReady" : "webhookKeyMissing")}</StatusPill>
      </div>
      <p className="text-sm text-secondary">{t("webhookHelp")}</p>
      <Field label={t("webhookUrl")} readOnly value={settings.webhookUrl || t("urlUnavailable")} />
      <p className="text-sm text-secondary">{settings.lastWebhookAt ? t("lastWebhook", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(settings.lastWebhookAt) }) : t("noWebhook")}</p>
      <Button variant="quiet" className="self-start" disabled={action.isBusy()} onClick={() => void action.run(() => check({}), { fallbackMessage: t("failed"), suppressErrorToast: true }).then(result => { if (result.ok) setConnection(result.data); })}>{t("checkConnection")}</Button>
      {connection && <div role="status" className="flex flex-wrap gap-3">
        <StatusPill tone="success">{t("connected")}</StatusPill>
        <StatusPill tone={connection.portalReady ? "success" : "warning"}>{t(connection.portalReady ? "portalReady" : "portalMissing")}</StatusPill>
        <StatusPill tone={connection.recoveryReady ? "success" : "warning"}>{t(connection.recoveryReady ? "recoveryReady" : "recoveryMissing")}</StatusPill>
      </div>}
    </SettingsCard>
    <SettingsCard title={t("productSettings")}>
      <label htmlFor="stripe-mode" className="text-sm text-secondary">{t("mode")}</label>
      <Select id="stripe-mode" value={mode} disabled={settings.hasAccounts || action.isBusy()} onChange={value => setMode(value as "test" | "live")}>
        <option value="test">{t("test")}</option><option value="live">{t("live")}</option>
      </Select>
      {settings.hasAccounts && <p className="text-sm text-secondary">{t("modeLocked")}</p>}
      <Field label={t("appOrigin")} type="url" value={origin} onChange={e => setOrigin(e.target.value)} placeholder="https://your-product.example" />
      <Field label={t("graceDays")} type="number" min={0} max={30} step={1} value={graceDays} onChange={e => setGraceDays(Number(e.target.value))} hint={t("graceHelp")} />
      <p className="text-sm text-secondary">{t("mappedPlans", { count: settings.config.offers.length })}</p>
      <Link href="/admin/settings/plans" className="self-start text-sm text-secondary underline underline-offset-4">{t("managePrices")}</Link>
      <SettingSwitch label={t("enable")} description={t("enableHelp")} checked={enabled} onChange={setEnabled} />
      <p className="text-sm text-secondary">{t("portalHelp")}</p>
      {mode === "live" && enabled && <p className="text-sm text-warning">{t("liveHelp")}</p>}
    </SettingsCard>
    <SaveError>{action.error}</SaveError>
    <SaveAction type="submit" isSaving={action.isBusy()} label={t("save")} savingLabel={t("saving")} />
  </form>;
}
