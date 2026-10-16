"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { Plug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";
import { useClaritySiteId, useClarityStatus } from "../../_components/useClarity";

/**
 * Clarity's Connection (docs/plans/active/insights-analyst-plan.md §7b, phase
 * 15, drawn as the ClarityConnection board): the three steps to connect a
 * website's Clarity project — its tracking code with Consent Mode, a Data
 * Export token, pasted here — tested with one ask and kept with the other
 * connections, never shown again. Connected, it says when Clarity was last
 * read and lets an admin disconnect.
 */
export default function ClarityConnectionPage() {
  const t = useTranslations("clarity.connection");
  const siteId = useClaritySiteId();
  const status = useClarityStatus();
  const connect = useAction(api.clarity.connectClarity);
  const disconnect = useMutation(api.clarity.disconnectClarity);
  const action = useAdminAction({ scope: "clarity-connection" });
  const [token, setToken] = useState("");
  const [problem, setProblem] = useState("");
  const connection = status?.connection;
  const connected = connection?.status === "CONNECTED";
  const onConnect = async () => {
    setProblem("");
    const outcome = await action.run(() => connect({ siteId, token }), { key: "connect", suppressErrorToast: true, fallbackMessage: t("failed") });
    if (!outcome.ok) setProblem(outcome.message);
    else if (!outcome.data.ok) setProblem(outcome.data.problem ?? t("failed"));
    else setToken("");
  };
  return (
    <>
      <PageHeader
        icon={<Plug className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description")}
      />
      {connected ? (
        <SettingsCard title={t("connectedTitle")}>
          <p className="text-[13px] text-secondary">{connection?.lastCollectedAt ? t("connectedRead", { when: formatDateTime(connection.lastCollectedAt) }) : t("connectedFirst")}</p>
          {/* Clarity's ten asks a day, said rather than hidden (agents-and-clarity-plan.md, CC3). */}
          <p className="text-[13px] text-secondary">{t("asksToday", { used: connection?.asksToday ?? 0 })}</p>
          {connection?.problem ? <Notice tone="warning">{connection.problem}</Notice> : null}
          <div className="flex justify-end border-t border-border-dim pt-4">
            <Button variant="quiet" onClick={() => void action.run(() => disconnect({ siteId }), { key: "disconnect", fallbackMessage: t("failed") })} disabled={action.isBusy()}>{t("disconnect")}</Button>
          </div>
        </SettingsCard>
      ) : (
        <SettingsCard title={t("connectTitle")}>
          {connection?.status === "NEEDS_RECONNECT" ? <Notice tone="warning">{connection.problem ?? t("refused")}</Notice> : null}
          <p className="max-w-2xl text-[13px] text-foreground">{t("stepOne")}</p>
          <p className="max-w-2xl text-[13px] text-foreground">{t("stepTwo")}</p>
          <Field label={t("stepThree")} hint={t("tokenHint")} type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" />
          <SaveError>{problem}</SaveError>
          <div className="flex justify-end border-t border-border-dim pt-4">
            <PagePrimaryAction variant="brand" onClick={onConnect} disabled={action.isBusy() || token.trim().length === 0}>{t("connect")}</PagePrimaryAction>
          </div>
        </SettingsCard>
      )}
      <Notice>{t("limits")}</Notice>
    </>
  );
}
