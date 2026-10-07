"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

/**
 * The profile's Telegram section (docs/plans/active/hakken-tasks-plan.md,
 * item 6.1, board TelegramLink): the bot to search for and a ten-minute code
 * to send it, then who is linked, with Unlink. Shown once the platform's bot
 * is set up (docs/operator/telegram.md).
 */
export function TelegramSection() {
  const t = useTranslations("user.preferences.telegram");
  const { platformName } = useSystemSettings();
  const telegram = useQuery(api.telegram.myTelegram);
  const newCode = useMutation(api.telegram.newTelegramCode);
  const unlink = useMutation(api.telegram.unlinkTelegram);
  const action = useAdminAction({ scope: "profile-telegram" });
  // A code shows only while it works: hidden the moment it runs out.
  const [expired, setExpired] = useState<number | null>(null);
  const expiresAt = telegram?.code?.expiresAt;
  useEffect(() => {
    if (expiresAt === undefined) return;
    const timer = setTimeout(() => setExpired(expiresAt), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);

  if (!telegram?.bot) return null;
  const code = telegram.code && telegram.code.expiresAt !== expired ? telegram.code.code : null;
  const getCode = () => void action.run(() => newCode({}), { fallbackMessage: t("failed") });

  return (
    <>
      <div className="h-px bg-border-dim/30 my-2" />
      <div className="flex flex-col gap-1">
        <div>
          <h4 className="text-[13px] font-medium text-foreground tracking-wide flex items-center gap-2">
            <Send className="w-4 h-4 text-brand" />
            {t("title")}
          </h4>
          <p className="text-[11px] text-secondary mt-0.5">{t("description", { platformName })}</p>
        </div>
        {telegram.linked ? (
          <div className="max-w-[560px] flex flex-wrap items-center gap-3 mt-2 text-[13px] text-secondary">
            <span>
              {telegram.linked.telegramName
                ? t.rich("linkedAs", { name: telegram.linked.telegramName, strong: (chunks) => <span className="text-foreground font-medium">{chunks}</span> })
                : t("linked")}
            </span>
            <Button variant="quiet" onClick={() => void action.run(() => unlink({}), { fallbackMessage: t("failed") })}>
              {t("unlink")}
            </Button>
          </div>
        ) : (
          <div className="max-w-[560px] flex flex-col gap-3 mt-2">
            <ol className="list-decimal pl-5 flex flex-col gap-2 text-[13px] text-secondary">
              <li>{t.rich("search", { bot: telegram.bot.name, strong: (chunks) => <span className="text-foreground font-medium">{chunks}</span> })}</li>
              <li>
                {code ? (
                  <>
                    {t("sendCode")}{" "}
                    <span className="font-mono text-[15px] tracking-widest text-foreground">{`${code.slice(0, 3)} ${code.slice(3)}`}</span>
                  </>
                ) : (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {t("sendCodeNone")}
                    <Button variant="quiet" onClick={getCode}>{t("getCode")}</Button>
                  </span>
                )}
              </li>
              <li>{t("thatsIt")}</li>
            </ol>
            {code ? (
              <p className="text-[11px] text-muted">
                {t("codeLasts")}{" "}
                <Button variant="ghost" className="p-0 text-[11px] font-normal text-secondary underline underline-offset-4 hover:bg-transparent" onClick={getCode}>
                  {t("newCode")}
                </Button>
              </p>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
