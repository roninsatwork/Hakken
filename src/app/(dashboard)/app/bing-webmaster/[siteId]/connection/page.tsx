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
import { formatDate, formatDateTime } from "@/src/lib/dates";
import { SiteFacts } from "../../../sites/_components/SiteRecordParts";
import { formatDay } from "../../../sites/_components/siteFormat";
import { BingConnectCard, useBeginBingConnect } from "../../_components/BingNotices";
import { useBingSiteId, useBingStatus, type BingStatus } from "../../_components/useBing";

const PANEL = "rounded-2xl border border-border-dim bg-card/40 p-6";

/**
 * A website's connection to Bing Webmaster Tools (bing-webmaster-plan.md §3;
 * boards 8 and 9): where a sign-in comes back to and says how it went —
 * connected, a site to choose, or why it could not connect — and, once
 * connected, which site, how far back the figures go, and the way to
 * disconnect. The company's admins act here; everyone else reads it.
 */
export default function BingConnectionPage() {
  const t = useTranslations("bingWebmaster.connection");
  const status = useBingStatus();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Plug className="h-5 w-5 text-brand" />} title={t("title")} description={t("description", { host: status?.host ?? "" })} />
      {status ? <ConnectionBody status={status} /> : null}
    </div>
  );
}

function ConnectionBody({ status }: { status: BingStatus }) {
  const siteId = useBingSiteId();
  const connection = status.connection;
  return (
    <>
      {connection?.attempt ? <AttemptNote status={status} /> : null}
      {!connection || connection.status === "CONNECTING" ? (
        <BingConnectCard status={status} siteId={siteId} />
      ) : connection.status === "CHOOSING" ? (
        <ChooseSite status={status} />
      ) : (
        <ConnectionDetails status={status} />
      )}
    </>
  );
}

/** Why the last sign-in did not connect. */
function AttemptNote({ status }: { status: BingStatus }) {
  const t = useTranslations("bingWebmaster.connection");
  const attempt = status.connection?.attempt;
  if (!attempt) return null;
  return (
    <Notice tone="warning">
      <span className="block font-medium text-foreground">{t("attemptTitle")}</span>
      <span className="block">{t(`attempt.${attempt.outcome}`, { host: status.host })}</span>
    </Notice>
  );
}

/** A sign-in back from Bing with several verified sites that are this website: the admin chooses one. */
function ChooseSite({ status }: { status: BingStatus }) {
  const t = useTranslations("bingWebmaster.connection");
  const siteId = useBingSiteId();
  const choose = useMutation(api.bingWebmasterConnect.chooseBingSite);
  const { run, isBusy } = useAdminAction({ scope: "bing-webmaster-choose" });
  const { start, busy } = useBeginBingConnect(siteId);
  const choices = status.connection?.choices ?? [];
  const [picked, setPicked] = useState(choices[0] ?? "");
  return (
    <div className={`${PANEL} flex flex-col gap-4`}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-medium text-foreground">{t("chooseTitle")}</h2>
        <p className="text-[13px] text-secondary">{t("chooseDescription", { host: status.host })}</p>
      </div>
      <fieldset className="flex flex-col divide-y divide-border-dim/50 overflow-hidden rounded-xl border border-border-dim">
        <legend className="sr-only">{t("chooseTitle")}</legend>
        {choices.map((choice) => (
          <label key={choice} className="flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-hover">
            <input
              type="radio"
              name="bing-site"
              value={choice}
              checked={picked === choice}
              disabled={!status.canManage}
              onChange={() => setPicked(choice)}
              className="accent-brand"
            />
            <span className="truncate font-mono text-[13px] text-foreground">{choice}</span>
          </label>
        ))}
      </fieldset>
      {status.canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="brand" disabled={!picked || isBusy()} onClick={() => void run(() => choose({ siteId, site: picked }), { fallbackMessage: t("failed") })}>
            {t("use")}
          </Button>
          <Button variant="quiet" disabled={busy} onClick={() => void start()}>{t("another")}</Button>
        </div>
      ) : null}
    </div>
  );
}

/** A website connected once: its site, how far its figures go, and the way to disconnect. */
function ConnectionDetails({ status }: { status: BingStatus }) {
  const t = useTranslations("bingWebmaster.connection");
  const siteId = useBingSiteId();
  const disconnect = useMutation(api.bingWebmasterConnect.disconnectBing);
  const { run, isBusy } = useAdminAction({ scope: "bing-webmaster-disconnect" });
  const { start, busy } = useBeginBingConnect(siteId);
  const [confirming, setConfirming] = useState(false);
  const confirmDisconnect = async () => {
    const outcome = await run(() => disconnect({ siteId }), { fallbackMessage: t("failed") });
    if (outcome.ok) setConfirming(false);
  };
  const connection = status.connection!;
  const facts = [
    { key: "site", label: t("site"), value: <span className="font-mono">{connection.site ?? "–"}</span> },
    { key: "connected", label: t("connected"), value: connection.connectedAt ? formatDate(connection.connectedAt) : "–" },
    {
      key: "updated",
      label: t("lastUpdated"),
      value: connection.lastCollectedAt && connection.newestDay
        ? t("updatedDetail", { when: formatDateTime(connection.lastCollectedAt), day: formatDay(connection.newestDay) })
        : t("notYet"),
    },
    { key: "history", label: t("history"), value: connection.oldestDay ? t("historyKept", { day: formatDay(connection.oldestDay) }) : t("notYet") },
    { key: "collected", label: t("collected"), value: t("collectedDetail") },
  ];

  return (
    <div className="flex flex-col gap-4">
      {connection.status === "DISCONNECTED" && connection.disconnectedAt ? (
        <Notice action={status.canManage ? <Button variant="quiet" disabled={busy} onClick={() => void start()}>{t("reconnect")}</Button> : undefined}>
          {t("disconnectedOn", { day: formatDate(connection.disconnectedAt) })}
        </Notice>
      ) : null}
      <div className={PANEL}>
        <SiteFacts facts={facts} empty="–" />
      </div>
      {status.canManage && connection.status === "CONNECTED" ? (
        <>
          <div>
            <Button variant="outline" onClick={() => setConfirming(true)}>{t("disconnect")}</Button>
          </div>
          {/* A yes or a no, so the kit's confirmation (AGENTS.md: a pop-up is only for a yes or a no). */}
          <ConfirmationModal
            isOpen={confirming}
            onClose={() => setConfirming(false)}
            title={t("disconnectTitle")}
            cancelLabel={t("keep")}
            confirmLabel={t("confirmDisconnect")}
            isSubmitting={isBusy()}
            onConfirm={() => void confirmDisconnect()}
          >
            {t("confirm")}
          </ConfirmationModal>
        </>
      ) : null}
    </div>
  );
}
