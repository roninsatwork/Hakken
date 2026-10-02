"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { AlertTriangle, Plug } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { formatDate, formatDateTime } from "@/src/lib/dates";
import { SiteFacts } from "../../../sites/_components/SiteRecordParts";
import { formatDay } from "../../../sites/_components/siteFormat";
import { ConnectCard, useBeginConnect, type SearchConsoleStatus } from "../../_components/SearchConsoleNotices";
import { useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";

const PANEL = "rounded-2xl border border-border-dim bg-card/40 p-6";

/**
 * A website's connection to Google Search Console (docs/plans/active/
 * search-console-plan.md §3): where a sign-in comes back to and says how it
 * went — connected, a property to choose, or why it could not connect — and,
 * once connected, which property and account, how far back the figures go,
 * and the way to disconnect. The company's admins act here (SC4); everyone
 * else reads it.
 */
export default function SearchConsoleConnectionPage() {
  const t = useTranslations("searchConsole.connection");
  const status = useSearchConsoleStatus();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Plug className="h-5 w-5 text-brand" />} title={t("title")} description={t("description", { host: status?.host ?? "" })} />
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
    <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <p className="text-[13px] font-medium text-foreground">{t(`attemptTitle.${attempt.outcome}`, { host: status.host, account })}</p>
        <p className="text-[12.5px] text-secondary">{t(`attempt.${attempt.outcome}`, { host: status.host, account })}</p>
      </div>
    </div>
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
    <div className={`${PANEL} flex flex-col gap-4`}>
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
            <StatusLabel tone="neutral">{t(`permissions.${choice.permission as "siteOwner"}`)}</StatusLabel>
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
    </div>
  );
}

/** A website connected once: its property and account, how far its figures go, and the way to disconnect. */
function ConnectionDetails({ status }: { status: SearchConsoleStatus }) {
  const t = useTranslations("searchConsole.connection");
  const siteId = useSearchConsoleSiteId();
  const disconnect = useMutation(api.searchConsoleConnect.disconnectSearchConsole);
  const { run, isBusy } = useAdminAction({ scope: "search-console-disconnect" });
  const [confirming, setConfirming] = useState(false);
  const connection = status.connection!;
  const account = connection.googleAccount ?? t("someone");
  const facts = [
    {
      key: "property",
      label: t("property"),
      value: (
        <span className="inline-flex items-center gap-2">
          <span className="font-mono">{connection.property ?? "–"}</span>
          {connection.permission ? <StatusLabel tone="neutral">{t(`permissions.${connection.permission as "siteOwner"}`)}</StatusLabel> : null}
        </span>
      ),
    },
    { key: "account", label: t("account"), value: account },
    { key: "connected", label: t("connected"), value: connection.connectedAt ? formatDate(connection.connectedAt) : "–" },
    {
      key: "updated",
      label: t("lastUpdated"),
      value: connection.lastCollectedAt && connection.newestDay
        ? t("updatedDetail", { when: formatDateTime(connection.lastCollectedAt), day: formatDay(connection.newestDay) })
        : t("notYet"),
    },
    {
      key: "history",
      label: t("history"),
      value: connection.oldestDay
        ? t("historyKept", { day: formatDay(connection.oldestDay) })
        : t("notYet"),
    },
    { key: "collected", label: t("collected"), value: t("collectedDetail") },
  ];

  return (
    <div className="flex flex-col gap-4">
      {connection.status === "CONNECTED" && connection.problem ? (
        <p className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-[13px] text-secondary">
          {t(`problem.${connection.problem}`, { account, property: connection.property ?? "" })}
        </p>
      ) : null}
      <div className={PANEL}>
        <SiteFacts facts={facts} empty="–" />
      </div>
      {status.canManage && connection.status === "CONNECTED" ? (
        confirming ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/30 px-4 py-3">
            <p className="max-w-2xl text-[13px] text-secondary">{t("confirm")}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={isBusy()}
                className="border-destructive/40 text-destructive hover:text-destructive"
                onClick={async () => {
                  const outcome = await run(() => disconnect({ siteId }), { fallbackMessage: t("failed") });
                  if (outcome.ok) setConfirming(false);
                }}
              >
                {t("confirmDisconnect")}
              </Button>
              <Button variant="quiet" onClick={() => setConfirming(false)}>{t("keep")}</Button>
            </div>
          </div>
        ) : (
          <div>
            <Button variant="outline" onClick={() => setConfirming(true)}>{t("disconnect")}</Button>
          </div>
        )
      ) : null}
    </div>
  );
}
