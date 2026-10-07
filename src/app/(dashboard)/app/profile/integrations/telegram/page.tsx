"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate } from "@/src/lib/dates";
import { Button } from "@/src/ui/components/screens/Button";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SettingRow } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";

/**
 * Telegram's own page (docs/plans/active/outbox-and-preferences-plan.md, C2;
 * board ProfileTelegram), opened from the profile's Integrations tab:
 * linking in one tap — Telegram opens the bot holding the person's code, and
 * Start links them — or by sending the code; once linked, who is linked and
 * since when, with Unlink, a yes-or-no (Anthony, 2026-10-07, built without a
 * drawing of its own). A code is made when the page opens, and again when it
 * runs out.
 */
export default function TelegramIntegrationPage() {
  const t = useTranslations("user.preferences.telegram");
  const tApps = useTranslations("user.preferences.integrations");
  const { platformName } = useSystemSettings();
  const telegram = useQuery(api.telegram.myTelegram);
  const newCode = useMutation(api.telegram.newTelegramCode);
  const unlink = useMutation(api.telegram.unlinkTelegram);
  const action = useAdminAction({ scope: "profile-telegram" });
  const unlinking = useAdminAction({ scope: "profile-telegram-unlink" });
  const [confirming, setConfirming] = useState(false);
  // A code shows only while it works: hidden the moment it runs out.
  const [expired, setExpired] = useState<number | null>(null);
  const asked = useRef(false);
  const expiresAt = telegram?.code?.expiresAt;
  useEffect(() => {
    if (expiresAt === undefined) return;
    const timer = setTimeout(() => setExpired(expiresAt), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);

  const code = telegram?.code && telegram.code.expiresAt !== expired ? telegram.code.code : null;
  const waitingForCode = Boolean(telegram?.bot && !telegram.linked && !code);
  // The first code, made once when the page opens for someone not linked yet.
  useEffect(() => {
    if (!waitingForCode || asked.current) return;
    asked.current = true;
    void action.run(() => newCode({}), { fallbackMessage: t("failed") });
  }, [waitingForCode, action, newCode, t]);

  const back = { label: t("back"), href: "/app/profile?tab=integrations" };
  const header = (pills?: React.ReactNode) => (
    <DetailHeader back={back} icon={<Send className="h-6 w-6 text-brand" />} title={t("title")} description={tApps("apps.telegram.what", { platformName })} pills={pills} />
  );

  if (telegram === undefined) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        {header()}
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" />
      </div>
    );
  }
  if (!telegram.bot) {
    return (
      <div className="flex flex-col gap-6">
        {header()}
        <p className="text-[13px] text-secondary">{t("notSetUp")}</p>
      </div>
    );
  }
  const bot = telegram.bot;

  if (telegram.linked) {
    const linked = telegram.linked;
    return (
      <div className="flex flex-col gap-6">
        {header(<StatusLabel tone="success">{t("linkedTitle")}</StatusLabel>)}
        <div className="flex flex-col gap-3">
          <div>
            <h4 className="text-[13px] font-medium text-foreground tracking-wide">{t("linkedTitle")}</h4>
            <p className="text-[13px] text-secondary mt-1">{t("linkedSince", { name: linked.telegramName ?? bot.name, date: formatDate(linked.linkedAt) })}</p>
            <p className="text-[11px] text-secondary mt-0.5">{t("linkedHint", { platformName })}</p>
          </div>
          <div>
            <Button variant="quiet" onClick={() => setConfirming(true)}>{t("unlink")}</Button>
          </div>
        </div>
        <ConfirmationModal
          isOpen={confirming}
          onClose={() => setConfirming(false)}
          title={t("unlinkAsk")}
          size="sm"
          cancelLabel={t("keep")}
          confirmLabel={t("unlink")}
          isSubmitting={unlinking.isBusy()}
          onConfirm={() => void unlinking.run(() => unlink({}), { fallbackMessage: t("failed") }).then((done) => { if (done.ok) setConfirming(false); })}
          error={unlinking.error}
        >
          <p className="text-[13px] text-secondary">{t("unlinkBody", { platformName })}</p>
        </ConfirmationModal>
      </div>
    );
  }

  // Telegram opens the bot holding the code; pressing Start sends it (`telegramActions.handleUpdateInternal`).
  const openTelegram = async () => {
    if (code) {
      window.open(`https://t.me/${bot.username}?start=${code}`, "_blank", "noopener");
      return;
    }
    const made = await action.run(() => newCode({}), { fallbackMessage: t("failed") });
    if (made.ok) window.location.href = `https://t.me/${bot.username}?start=${made.data.code}`;
  };

  return (
    <div className="flex flex-col gap-6">
      {header(<StatusLabel tone="neutral">{tApps("notLinked")}</StatusLabel>)}
      <div className="flex flex-col gap-1">
        <div>
          <h4 className="text-[13px] font-medium text-foreground tracking-wide">{t("linkIt")}</h4>
          <p className="text-[11px] text-secondary mt-0.5">{t("linkItHint")}</p>
        </div>
        <div className="divide-y divide-border-dim/40">
          <SettingRow label={t("openTitle", { bot: bot.name })} description={t("openHint")}>
            <Button variant="primary" onClick={() => void openTelegram()}>{t("open")}</Button>
          </SettingRow>
          <SettingRow label={t("codeTitle")} description={t("codeHint", { bot: bot.name })}>
            <span className="flex items-center gap-3">
              {code ? <span className="font-mono text-[15px] tracking-widest text-foreground">{`${code.slice(0, 3)} ${code.slice(3)}`}</span> : null}
              <Button variant="ghost" onClick={() => void action.run(() => newCode({}), { fallbackMessage: t("failed") })}>{t("newCode")}</Button>
            </span>
          </SettingRow>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <h4 className="text-[13px] font-medium text-foreground tracking-wide">{t("whatYouGet")}</h4>
        <ul className="list-disc pl-5 flex flex-col gap-1.5 text-[13px] text-secondary">
          <li>{t("get1")}</li>
          <li>{t("get2", { platformName })}</li>
          <li>{t("get3", { platformName })}</li>
        </ul>
      </div>
    </div>
  );
}
