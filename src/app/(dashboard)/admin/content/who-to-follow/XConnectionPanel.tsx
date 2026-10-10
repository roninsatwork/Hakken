"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";
import { Button } from "@/src/ui/components/screens/Button";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";

const OUTCOMES = ["connected", "declined", "failed", "missing-scope"] as const;
type Outcome = (typeof OUTCOMES)[number];

/**
 * X on Who to follow (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 6; moved from News sources when it went, content-people-knowledge-
 * plan.md, C2): whether people's X accounts can be read — the X app's token — and
 * Anthony's own account, connected so his bookmarks come into News. The
 * sign-in leaves for X and comes back here, saying how it went; disconnecting
 * asks first. The access itself is never shown.
 */
export function XConnectionPanel() {
  const t = useTranslations("admin.newsFollows.x");
  const tCommon = useTranslations("common");
  const x = useQuery(api.xConnect.getXForAdmin, {});
  const begin = useMutation(api.xConnect.beginXConnect);
  const disconnect = useMutation(api.xConnect.disconnectX);
  const action = useAdminAction({ scope: "admin-news-follows-x" });
  const [confirming, setConfirming] = useState(false);
  const came = useSearchParams().get("x");
  const outcome = OUTCOMES.find((entry) => entry === came) ?? null;

  if (!x) return null;

  const connect = async () => {
    const started = await action.run(() => begin({}), { fallbackMessage: t("connectFailed") });
    if (started.ok) window.location.assign(started.data.authorizeUrl);
  };

  const connected = x.status === "CONNECTED";
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border-dim bg-card/40 px-4 py-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-[13px] font-medium text-foreground">{t("title")}</h2>
        <p className="text-[12px] text-secondary">{x.appTokenConfigured ? t("accountsReady") : t("accountsWaiting")}</p>
      </div>

      {outcome ? (
        <StatusLabel tone={outcome === "connected" ? "success" : "warning"} wrap>{t(`outcomes.${outcome as Outcome}`)}</StatusLabel>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] text-foreground">
            {connected
              ? t("bookmarksConnected", { account: x.account ?? "" })
              : x.status === "BROKEN"
                ? t("bookmarksBroken", { account: x.account ?? "" })
                : t("bookmarksNone")}
          </span>
          <span className="text-[12px] text-secondary">
            {!x.signInConfigured
              ? t("signInNotSetUp")
              : connected
                ? (x.lastReadAt ? t("lastRead", { when: formatDateTime(x.lastReadAt) }) : t("notReadYet"))
                : (x.problem ?? t("bookmarksWhy"))}
          </span>
        </div>
        {connected ? (
          <Button variant="quiet" onClick={() => setConfirming(true)}>{t("disconnect")}</Button>
        ) : (
          <Button variant="quiet" disabled={!x.signInConfigured || action.isBusy()} onClick={() => void connect()}>
            {x.status === "BROKEN" ? t("reconnect") : t("connect")}
          </Button>
        )}
      </div>

      <ConfirmationModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title={t("disconnectTitle")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("disconnect")}
        isSubmitting={action.isBusy()}
        onConfirm={() => void action.run(() => disconnect({}), { fallbackMessage: t("disconnectFailed") }).then((done) => {
          if (done.ok) setConfirming(false);
        })}
      >
        <p>{t("disconnectBody", { account: x.account ?? "" })}</p>
      </ConfirmationModal>
    </section>
  );
}
