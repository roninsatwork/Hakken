"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Bot, Plug, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";

/** Telegram's own page, opened from its row. */
export const TELEGRAM_PAGE = "/app/profile/integrations/telegram";

/** ChatGPT's and Claude's own pages (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, board 3). */
export const CHAT_APP_PAGES = { chatgpt: "/app/profile/integrations/chatgpt", claude: "/app/profile/integrations/claude" } as const;

type IntegrationRow =
  | { key: "telegram"; linked: { telegramName?: string | null } | null }
  | { key: "chatgpt" | "claude"; linked: boolean; switchedOff: boolean };

/**
 * The profile's Integrations tab (docs/plans/active/outbox-and-preferences-
 * plan.md, C2; boards ProfileIntegrations and ProfileIntegrationsLinked):
 * every app a person can link, one row each, opening its own page. ChatGPT and
 * Claude first (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, board 2), then
 * Telegram once it is set up for the platform.
 */
export function IntegrationsTab() {
  const t = useTranslations("user.preferences.integrations");
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const telegram = useQuery(api.telegram.myTelegram);
  const chatApps = useQuery(api.chatAppPasses.myChatApps);
  const rows: IntegrationRow[] | undefined = telegram === undefined || chatApps === undefined ? undefined : [
    ...chatApps.apps.map((one) => ({ key: one.app, linked: one.linked !== null, switchedOff: !chatApps.switchedOn }) satisfies IntegrationRow),
    ...(telegram.bot ? [{ key: "telegram" as const, linked: telegram.linked }] : []),
  ];
  const pageOf = (row: IntegrationRow) => (row.key === "telegram" ? TELEGRAM_PAGE : CHAT_APP_PAGES[row.key]);
  const open = (row: IntegrationRow) => router.push(pageOf(row));

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
            cell: (row) => (
              <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                {row.key === "telegram" ? <Send className="h-4 w-4 text-secondary" /> : <Bot className="h-4 w-4 text-secondary" />}
                {t(`apps.${row.key}.name`)}
              </span>
            ),
          },
          { key: "what", header: t("columns.what"), cell: (row) => <span className="text-[12px] text-secondary">{t(`apps.${row.key}.what`, { platformName })}</span> },
          {
            key: "status",
            header: t("columns.status"),
            cell: (row) => {
              if (row.key !== "telegram") {
                if (row.switchedOff) return <StatusLabel tone="neutral">{t("switchedOff")}</StatusLabel>;
                return row.linked ? <StatusLabel tone="success">{t("linked")}</StatusLabel> : <StatusLabel tone="neutral">{t("notLinked")}</StatusLabel>;
              }
              return row.linked
                ? <StatusLabel tone="success">{row.linked.telegramName ? t("linkedAs", { name: row.linked.telegramName }) : t("linked")}</StatusLabel>
                : <StatusLabel tone="neutral">{t("notLinked")}</StatusLabel>;
            },
          },
          {
            key: "action",
            header: "",
            align: "right",
            className: "w-[150px] whitespace-nowrap",
            cell: (row) => <Button variant="quiet" onClick={() => open(row)}>{row.linked ? t("manage") : t("link")}</Button>,
          },
        ]}
      />
    </div>
  );
}
