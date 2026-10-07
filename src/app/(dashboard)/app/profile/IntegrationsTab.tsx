"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Plug, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";

/** Telegram's own page, opened from its row. */
export const TELEGRAM_PAGE = "/app/profile/integrations/telegram";

/**
 * The profile's Integrations tab (docs/plans/active/outbox-and-preferences-
 * plan.md, C2; boards ProfileIntegrations and ProfileIntegrationsLinked):
 * every app a person can link, one row each, opening its own page. Telegram
 * is the only one today; an app joins once it is set up for the platform.
 */
export function IntegrationsTab() {
  const t = useTranslations("user.preferences.integrations");
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const telegram = useQuery(api.telegram.myTelegram);
  const rows = telegram === undefined ? undefined : telegram.bot ? [{ key: "telegram", linked: telegram.linked }] : [];
  const open = () => router.push(TELEGRAM_PAGE);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h4 className="text-[13px] font-medium text-foreground tracking-wide flex items-center gap-2">
          <Plug className="w-4 h-4 text-brand" />
          {t("title")}
        </h4>
        <p className="text-[11px] text-secondary mt-0.5">{t("description", { platformName })}</p>
      </div>
      <DataTable
        rows={rows}
        rowKey={(row) => row.key}
        onRowClick={open}
        empty={{ icon: <Plug className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        columns={[
          {
            key: "app",
            header: t("columns.app"),
            className: "w-[240px]",
            cell: () => (
              <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <Send className="h-4 w-4 text-secondary" />
                {t("apps.telegram.name")}
              </span>
            ),
          },
          { key: "what", header: t("columns.what"), cell: () => <span className="text-[12px] text-secondary">{t("apps.telegram.what", { platformName })}</span> },
          {
            key: "status",
            header: t("columns.status"),
            cell: (row) => (row.linked
              ? <StatusLabel tone="success">{row.linked.telegramName ? t("linkedAs", { name: row.linked.telegramName }) : t("linked")}</StatusLabel>
              : <StatusLabel tone="neutral">{t("notLinked")}</StatusLabel>),
          },
          {
            key: "action",
            header: "",
            align: "right",
            className: "w-[150px] whitespace-nowrap",
            cell: (row) => <Button variant="quiet" onClick={open}>{row.linked ? t("manage") : t("link")}</Button>,
          },
        ]}
      />
    </div>
  );
}
