"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bot, MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatDate, formatDateTime } from "@/src/lib/dates";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SettingRow } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TABLE_PAGE_SIZE, matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { FINDINGS_SCREENS, SECTION_NAMES, TOP_LISTS } from "@/convex/utils/chatAppMcp";
import { isCalendarPeriod } from "@/convex/utils/calendarPeriods";

type ListedApp = "chatgpt" | "claude";

/** The page's own address never changes while it's open. */
const noChange = () => () => {};

/**
 * ChatGPT's and Claude's own pages (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md,
 * board 3), opened from the profile's Integrations tab like Telegram's: linked
 * since when and to which company, Unlink (a yes or no), and what the app asked
 * for in the last 90 days. Not linked yet, it says how to add Hakken in the app,
 * with the door's address to copy.
 */
export function ChatAppPage({ app }: { app: ListedApp }) {
  const t = useTranslations("user.preferences.chatApp");
  const tApps = useTranslations("user.preferences.integrations");
  const tAllow = useTranslations("chatApps.allow");
  const tPeriods = useTranslations("common.periods");
  const apps = useQuery(api.chatAppPasses.myChatApps);
  const asked = useQuery(api.chatAppPasses.myChatAppQuestions, { app });
  const unlink = useMutation(api.chatAppPasses.unlinkChatApp);
  const unlinking = useAdminAction({ scope: `profile-chat-app-unlink-${app}` });
  const [confirming, setConfirming] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState(false);
  // The door is at this app's own address, whatever it's deployed on: read in the browser, empty while rendering on the server.
  const address = useSyncExternalStore(noChange, () => `${window.location.origin}/mcp`, () => "");

  const name = tApps(`apps.${app}.name`);
  const back = { label: t("back"), href: "/app/profile?tab=integrations" };
  const mine = apps?.apps.find((one) => one.app === app);
  const linked = mine?.linked ?? null;
  const switchedOff = apps !== undefined && !apps.switchedOn;
  const header = (
    <DetailHeader
      back={back}
      icon={<Bot className="h-6 w-6 text-brand" />}
      title={name}
      description={tApps(`apps.${app}.what`)}
      pills={apps === undefined ? undefined : switchedOff
        ? <StatusLabel tone="neutral">{tApps("switchedOff")}</StatusLabel>
        : linked ? <StatusLabel tone="success">{tApps("linked")}</StatusLabel> : <StatusLabel tone="neutral">{tApps("notLinked")}</StatusLabel>}
    />
  );

  if (apps === undefined) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        {header}
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" />
      </div>
    );
  }

  const askedFor = (row: { tool: string; detail: string | null }) => {
    if (row.tool === "your_websites") return t("asks.websites");
    if (row.tool === "website_summary") return t("asks.summary");
    if (row.tool === "page_story") return t("asks.page");
    if (row.tool === "screen_findings" && row.detail && row.detail in FINDINGS_SCREENS) {
      return t("asks.findings", { section: SECTION_NAMES[FINDINGS_SCREENS[row.detail as keyof typeof FINDINGS_SCREENS].section] });
    }
    if (row.tool === "top_of_list" && row.detail && row.detail in TOP_LISTS) return t(`tops.${row.detail.replace(".", "_")}`);
    return t("asks.other");
  };
  const rows = (asked ?? []).map((row) => ({ ...row, askedFor: askedFor(row) }));
  const matching = rows.filter((row) => matchesSearchTerm(searchTerm, [row.askedFor, row.website ?? ""]));
  const paged = paginateItems(matching, page, TABLE_PAGE_SIZE);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      {header}
      {switchedOff ? (
        <div>
          <h4 className="text-[13px] font-medium text-foreground tracking-wide">{t("offTitle", { app: name })}</h4>
          <p className="text-[13px] text-secondary mt-1">{tAllow("offBody", { company: apps.companyName })}</p>
        </div>
      ) : linked ? (
        <div className="flex flex-col gap-3">
          <div>
            <h4 className="text-[13px] font-medium text-foreground tracking-wide">{t("linkedTitle")}</h4>
            <p className="text-[13px] text-secondary mt-1">{t("linkedSince", { company: linked.companyName, date: formatDate(linked.allowedAt) })}</p>
            <p className="text-[11px] text-secondary mt-0.5">{t("linkedHint", { app: name })}</p>
          </div>
          <div>
            <Button variant="quiet" onClick={() => setConfirming(true)}>{t("unlink")}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div>
            <h4 className="text-[13px] font-medium text-foreground tracking-wide">{t("linkIt")}</h4>
            <p className="text-[11px] text-secondary mt-0.5">{app === "chatgpt" ? t("howChatgpt") : t("howClaude")}</p>
          </div>
          <div className="divide-y divide-border-dim/40">
            <SettingRow label={t("address")}>
              <span className="flex items-center justify-end gap-3">
                <span className="font-mono text-[13px] text-foreground">{address}</span>
                <Button variant="ghost" onClick={() => void copy()}>{copied ? t("copied") : t("copy")}</Button>
              </span>
            </SettingRow>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5">
        <div>
          <h4 className="text-[13px] font-medium text-foreground tracking-wide flex items-center gap-2">
            <MessagesSquare className="w-4 h-4 text-brand" />
            {t("askedTitle", { app: name })}
          </h4>
          <p className="text-[11px] text-secondary mt-0.5">{t("askedHint")}</p>
        </div>
        <DataTable
          rows={asked === undefined ? undefined : paged.items}
          rowKey={(row) => row.id}
          search={{
            value: searchTerm,
            onChange: (next) => {
              setSearchTerm(next);
              setPage(1);
            },
            placeholder: t("search", { app: name }),
          }}
          empty={{ icon: <MessagesSquare className="h-8 w-8 text-muted/30" />, label: searchTerm ? t("noMatch") : t("empty", { app: name }) }}
          footer={{
            mode: "paged",
            page: paged.page,
            totalPages: paged.totalPages,
            totalCount: paged.totalItems,
            pageSize: paged.pageSize,
            isLoading: asked === undefined,
            onPageChange: setPage,
            labels: { empty: searchTerm ? t("noMatch") : t("empty", { app: name }) },
          }}
          columns={[
            {
              key: "asked",
              header: t("columns.asked"),
              className: "min-w-[160px] max-w-0",
              cell: (row) => <span title={row.askedFor} className="block truncate text-[13px] font-medium text-foreground">{row.askedFor}</span>,
            },
            {
              key: "website",
              header: t("columns.website"),
              className: "w-[200px] whitespace-nowrap",
              cell: (row) => (row.website ? <span className="text-[12px] text-info">{row.website}</span> : <span className="text-[12px] text-muted">–</span>),
            },
            {
              key: "dates",
              header: t("columns.dates"),
              className: "w-[150px] whitespace-nowrap",
              cell: (row) => (row.period && isCalendarPeriod(row.period) ? <span className="text-[12px] text-secondary">{tPeriods(row.period)}</span> : <span className="text-[12px] text-muted">–</span>),
            },
            {
              key: "when",
              header: t("columns.when"),
              className: "w-[190px] whitespace-nowrap",
              cell: (row) => <span className="text-[12px] text-secondary">{formatDateTime(row.at)}</span>,
            },
            {
              key: "answer",
              header: t("columns.answer"),
              align: "right",
              className: "w-[150px] whitespace-nowrap",
              cell: (row) => (row.outcome === "answered"
                ? <StatusLabel tone="success">{t("answered")}</StatusLabel>
                : <StatusLabel tone="neutral">{row.reason === "switchedOff" ? t("switchedOff") : t("couldNot")}</StatusLabel>),
            },
          ]}
        />
      </div>

      <ConfirmationModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title={t("unlinkAsk", { app: name })}
        size="sm"
        cancelLabel={t("keep")}
        confirmLabel={t("unlink")}
        isSubmitting={unlinking.isBusy()}
        onConfirm={() => void unlinking.run(() => unlink({ app }), { fallbackMessage: t("failed") }).then((done) => { if (done.ok) setConfirming(false); })}
        error={unlinking.error}
      >
        <p className="text-[13px] text-secondary">{t("unlinkBody", { app: name })}</p>
      </ConfirmationModal>
    </div>
  );
}
