"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Plug } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { Notice } from "@/src/ui/components/screens/Notice";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { formatLongDate } from "@/src/lib/dates";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { ConnectionLines, lastUpdate } from "../../../sites/_components/ConnectionLines";
import { formatDay } from "../../../sites/_components/siteFormat";
import { ConnectCard, useBeginConnect, type SearchConsoleStatus } from "../../_components/SearchConsoleNotices";
import { useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";

/**
 * A website's connection to Google Search Console (docs/plans/active/
 * search-console-plan.md §3, redone 2026-11-20 in search-console-breakdowns-plan-2026-11-20.md):
 * where a sign-in comes back to and says how it went — connected, a property to
 * choose, or why it could not connect — and, once connected, how the figures get
 * here in plain sentences, and the way to disconnect. The company's admins act
 * here (SC4); everyone else reads it. A connection page has no What Hakken sees.
 */
export default function SearchConsoleConnectionPage() {
  const t = useTranslations("searchConsole.connection");
  const status = useSearchConsoleStatus();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Plug className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? <ConnectionBody status={status} /> : null}
    </div>
  );
}

function ConnectionBody({ status }: { status: SearchConsoleStatus }) {
  const siteId = useSearchConsoleSiteId();
  const connection = status.connection;
  return (
    <>
      {connection?.attempt ? <AttemptNote status={status} /> : null}
      {!connection || connection.status === "CONNECTING" ? (
        <ConnectCard status={status} siteId={siteId} />
      ) : connection.status === "CHOOSING" ? (
        <ChooseProperty status={status} />
      ) : (
        <ConnectionDetails status={status} />
      )}
    </>
  );
}

/** Why the last sign-in did not connect, with the account it was tried with. */
function AttemptNote({ status }: { status: SearchConsoleStatus }) {
  const t = useTranslations("searchConsole.connection");
  const attempt = status.connection?.attempt;
  if (!attempt) return null;
  const account = attempt.account ?? t("someone");
  return (
    <Notice tone="warning">
      <span className="block font-medium text-foreground">{t(`attemptTitle.${attempt.outcome}`, { host: status.host, account })}</span>
      <span className="block">{t(`attempt.${attempt.outcome}`, { host: status.host, account })}</span>
    </Notice>
  );
}

/** A sign-in back from Google with several properties that are this website: the admin chooses one. */
function ChooseProperty({ status }: { status: SearchConsoleStatus }) {
  const t = useTranslations("searchConsole.connection");
  const siteId = useSearchConsoleSiteId();
  const choose = useMutation(api.searchConsoleConnect.chooseSearchConsoleProperty);
  const { run, isBusy } = useAdminAction({ scope: "search-console-choose" });
  const { start, busy } = useBeginConnect(siteId);
  const choices = status.connection?.choices ?? [];
  const [picked, setPicked] = useState(choices[0]?.property ?? "");
  const account = status.connection?.googleAccount ?? t("someone");

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-medium text-foreground">{t("chooseTitle")}</h2>
        <p className="text-[13px] text-secondary">{t("chooseDescription", { account, host: status.host })}</p>
      </div>
      <fieldset className="flex flex-col divide-y divide-border-dim/50 overflow-hidden rounded-xl border border-border-dim">
        <legend className="sr-only">{t("chooseTitle")}</legend>
        {choices.map((choice) => (
          <label key={choice.property} className="flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-hover">
            <input
              type="radio"
              name="search-console-property"
              value={choice.property}
              checked={picked === choice.property}
              disabled={!status.canManage}
              onChange={() => setPicked(choice.property)}
              className="accent-brand"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono text-[13px] text-foreground">{choice.property}</span>
              <span className="text-[12px] text-secondary">{choice.property.startsWith("sc-domain:") ? t("domain") : t("prefix")}</span>
            </span>
            <TagLabel>{t(`permissions.${choice.permission as "siteOwner"}`)}</TagLabel>
          </label>
        ))}
      </fieldset>
      {status.canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="brand"
            disabled={!picked || isBusy()}
            onClick={() => void run(() => choose({ siteId, property: picked }), { fallbackMessage: t("failed") })}
          >
            {t("use")}
          </Button>
          <Button variant="quiet" disabled={busy} onClick={() => void start()}>{t("another")}</Button>
        </div>
      ) : null}
    </>
  );
}

/**
 * A website connected once, as Google Analytics' Connection says it (his pick on the Breakdowns and Connection canvas,
 * 2026-11-20): one line saying if it's working, then plain sentences saying how the figures get here, which account
 * and property it reads, and the way to disconnect. Disconnected, it says only how far back the kept figures go: the
 * banner over every page says the rest.
 */
function ConnectionDetails({ status }: { status: SearchConsoleStatus }) {
  const t = useTranslations("searchConsole.connection");
  const connection = status.connection!;
  const account = connection.googleAccount ?? t("someone");
  const disconnected = connection.status === "DISCONNECTED";
  const working = connection.status === "CONNECTED" && !connection.problem;
  const last = lastUpdate(connection.lastCollectedAt, connection.newestDay);
  const access = connection.permission ? t(`permissions.${connection.permission as "siteOwner"}`) : "none";
  const property = connection.property;
  const history = connection.oldestDay
    ? connection.daysFrom && connection.daysFrom !== connection.oldestDay
      ? [t("lines.history", { from: formatDay(connection.daysFrom), day: formatDay(connection.oldestDay) })]
      : [t("lines.historyOne", { day: formatDay(connection.oldestDay) })]
    : [];
  const lines = disconnected ? history : [
    t("lines.source"),
    t(`lines.${last.key}`, last.values),
    ...history,
    ...(connection.oldestDay ? [t("lines.older")] : []),
    connection.analytics === "SAME" ? t("lines.accountShared", { account }) : t("lines.account", { account }),
    ...(property
      ? [property.startsWith("sc-domain:")
        ? t("lines.domain", { host: property.slice("sc-domain:".length), access })
        : t("lines.prefix", { property, access })]
      : []),
  ];
  const statusLine = disconnected ? null : working
    ? <StatusLabel tone="success" size="md">{t("status.working", { day: connection.connectedAt ? formatLongDate(connection.connectedAt) : "" })}</StatusLabel>
    : <StatusLabel tone="warning" size="md">{t("status.notUpdating")}</StatusLabel>;

  return (
    <>
      {connection.status === "CONNECTED" && connection.problem ? (
        <Notice tone="warning">{t(`problem.${connection.problem}`, { account, property: property ?? "" })}</Notice>
      ) : null}
      <ConnectionLines status={statusLine} lines={lines} />
      {status.canManage && connection.status === "CONNECTED" ? <Disconnect analytics={connection.analytics !== null} /> : null}
    </>
  );
}

/** The way to disconnect, saying what stays: the figures so far, and Google Analytics when it's connected too. */
function Disconnect({ analytics }: { analytics: boolean }) {
  const t = useTranslations("searchConsole.connection");
  const siteId = useSearchConsoleSiteId();
  const disconnect = useMutation(api.searchConsoleConnect.disconnectSearchConsole);
  const { run, isBusy } = useAdminAction({ scope: "search-console-disconnect" });
  const [confirming, setConfirming] = useState(false);
  const stays = analytics ? "yes" : "no";
  return (
    <>
      <div className="flex flex-col items-start gap-2">
        <Button variant="outline" onClick={() => setConfirming(true)}>{t("disconnect")}</Button>
        <p className="text-[12px] text-muted">{t("disconnectHint", { analytics: stays })}</p>
      </div>
      {/* A yes or a no, so the kit's confirmation (AGENTS.md: a pop-up is only for a yes or a no). */}
      <ConfirmationModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title={t("disconnectTitle")}
        cancelLabel={t("keep")}
        confirmLabel={t("confirmDisconnect")}
        isSubmitting={isBusy()}
        onConfirm={async () => {
          const outcome = await run(() => disconnect({ siteId }), { fallbackMessage: t("failed") });
          if (outcome.ok) setConfirming(false);
        }}
      >
        {t("confirm", { analytics: stays })}
      </ConfirmationModal>
    </>
  );
}
