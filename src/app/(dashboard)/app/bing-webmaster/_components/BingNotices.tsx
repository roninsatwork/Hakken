"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { ListChecks, Plug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { Notice } from "@/src/ui/components/screens/Notice";
import { hasFigures, useBingHref, type BingStatus } from "./useBing";

const PANEL = "flex gap-5 rounded-2xl border border-border-dim bg-card/40 p-6";

/**
 * Start connecting: the server mints the sign-in's single-use state and hands
 * back the one link to follow — Bing's own sign-in, and back to the website's
 * Connection page (bing-webmaster-plan.md §3).
 */
export function useBeginBingConnect(siteId: Id<"companyWebsites">): { start: () => Promise<void>; busy: boolean } {
  const t = useTranslations("bingWebmaster.connect");
  const begin = useMutation(api.bingWebmasterConnect.beginBingConnect);
  const { run, isBusy } = useAdminAction({ scope: "bing-webmaster-connect" });
  return {
    busy: isBusy(),
    start: async () => {
      const outcome = await run(() => begin({ siteId }), { fallbackMessage: t("failed") });
      if (outcome.ok) window.location.assign(outcome.data.authorizeUrl);
    },
  };
}

/**
 * A website with nothing from Bing yet (§5, board 9): what connecting brings
 * and the way to connect for an admin, or who can for anyone else, and how a
 * website not yet in Bing Webmaster Tools gets there.
 */
export function BingConnectCard({ status, siteId }: { status: BingStatus; siteId: Id<"companyWebsites"> }) {
  const t = useTranslations("bingWebmaster.connect");
  const { start, busy } = useBeginBingConnect(siteId);
  if (!status.configured) {
    return (
      <div className={PANEL}>
        <Plug className="h-6 w-6 shrink-0 text-muted" aria-hidden="true" />
        <div className="flex max-w-2xl flex-col gap-1.5">
          <h2 className="text-[15px] font-medium text-foreground">{t("notSetUpTitle")}</h2>
          <p className="text-[13px] text-secondary">{t("notSetUpBody")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className={PANEL}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15">
          <Plug className="h-5 w-5 text-brand" aria-hidden="true" />
        </span>
        <div className="flex max-w-2xl flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[15px] font-medium text-foreground">{t("title")}</h2>
            <p className="text-[13px] text-secondary">{t("body", { host: status.host })}</p>
          </div>
          {status.canManage ? (
            <div className="flex flex-col items-start gap-2">
              <Button variant="brand" disabled={busy} onClick={() => void start()}>{t("button")}</Button>
              <p className="text-[12px] text-muted">{t("hint", { host: status.host })}</p>
            </div>
          ) : (
            <p className="rounded-xl border border-border-dim px-3 py-2 text-[12.5px] text-secondary">{t("askAdmin")}</p>
          )}
        </div>
      </div>
      <Notice>{t("importTip")}</Notice>
    </div>
  );
}

/**
 * Why nothing new is coming in, over figures that are still shown: Bing took
 * the access back, the account lost the site, or the keys cannot be read. An
 * admin can connect again from here.
 */
export function BingConnectionBanner({ status, siteId }: { status: BingStatus; siteId: Id<"companyWebsites"> }) {
  const t = useTranslations("bingWebmaster.banner");
  const tp = useTranslations("bingWebmaster.connection.problem");
  const { start, busy } = useBeginBingConnect(siteId);
  const connection = status.connection;
  if (connection?.status !== "NEEDS_RECONNECT" || !connection.problem) return null;
  return (
    <Notice tone="warning" action={status.canManage ? <Button variant="quiet" disabled={busy} onClick={() => void start()}>{t("reconnect")}</Button> : undefined}>
      <span className="block font-medium text-foreground">{t("reconnectTitle")}</span>
      <span className="block">{tp(connection.problem, { host: status.host })}</span>
    </Notice>
  );
}

/**
 * A figures page before there are figures: the site to choose first, the
 * first collection under way, or the way to connect.
 */
export function BingGate({ status, siteId, children }: { status: BingStatus; siteId: Id<"companyWebsites">; children: React.ReactNode }) {
  const t = useTranslations("bingWebmaster.gate");
  const hrefFor = useBingHref(siteId);
  const connection = status.connection;
  if (hasFigures(status)) return <>{children}</>;
  if (connection?.status === "CHOOSING") {
    return (
      <div className={PANEL}>
        <ListChecks className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
        <div className="flex max-w-2xl flex-col items-start gap-3">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[15px] font-medium text-foreground">{t("chooseTitle")}</h2>
            <p className="text-[13px] text-secondary">{t("chooseBody", { host: status.host })}</p>
          </div>
          <Link href={hrefFor("connection")} className="text-[13px] font-medium text-info hover:underline">{t("toConnection")} →</Link>
        </div>
      </div>
    );
  }
  if (connection?.status === "CONNECTED") {
    return (
      <div className="flex flex-col gap-4">
        <Notice>
          <span className="block font-medium text-foreground">{t("collectingTitle")}</span>
          <span className="block">{t("collectingBody", { host: status.host })}</span>
        </Notice>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-sidebar/30" />)}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-sidebar/30" />
      </div>
    );
  }
  return <BingConnectCard status={status} siteId={siteId} />;
}
