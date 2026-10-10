"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { HandCoins, ListChecks, Plug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { Notice } from "@/src/ui/components/screens/Notice";
import { formatDate } from "@/src/lib/dates";
import { formatDay } from "../../sites/_components/siteFormat";
import { hasFigures, useAnalyticsHref, type AnalyticsStatus } from "./useAnalytics";

const PANEL = "flex gap-5 rounded-2xl border border-border-dim bg-card/40 p-6";

/**
 * Start connecting: the server mints the sign-in's single-use state and hands
 * back the one link to follow — Google's own sign-in, asking for Analytics and
 * Search Console at once (§10, Q3), and back to the website's Connection page.
 */
export function useBeginAnalyticsConnect(siteId: Id<"companyWebsites">): { start: () => Promise<void>; busy: boolean } {
  const t = useTranslations("googleAnalytics.connect");
  const begin = useMutation(api.googleAnalyticsConnect.beginGoogleAnalyticsConnect);
  const { run, isBusy } = useAdminAction({ scope: "google-analytics-connect" });
  return {
    busy: isBusy(),
    start: async () => {
      const outcome = await run(() => begin({ siteId }), { fallbackMessage: t("failed") });
      if (outcome.ok) window.location.assign(outcome.data.authorizeUrl);
    },
  };
}

/**
 * A website with nothing from Google Analytics yet (§3, screen 1; §11 board
 * 11): what connecting brings and the way to connect for an admin — "Add
 * Google Analytics" when Search Console is connected already, since Google
 * then asks only for the extra access — or who can, for anyone else.
 */
export function AnalyticsConnectCard({ status, siteId }: { status: AnalyticsStatus; siteId: Id<"companyWebsites"> }) {
  const t = useTranslations("googleAnalytics.connect");
  const { start, busy } = useBeginAnalyticsConnect(siteId);
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
  const adding = status.searchConsoleConnected;
  return (
    <div className={PANEL}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/15">
        <Plug className="h-5 w-5 text-foreground" aria-hidden="true" />
      </span>
      <div className="flex max-w-2xl flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[15px] font-medium text-foreground">{adding ? t("addTitle") : t("title")}</h2>
          <p className="text-[13px] text-secondary">{t("body", { host: status.host })}</p>
        </div>
        {status.canManage ? (
          <div className="flex flex-col items-start gap-2">
            <Button variant="brand" disabled={busy} onClick={() => void start()}>{adding ? t("addButton") : t("button")}</Button>
            <p className="text-[12px] text-muted">{adding ? t("addHint", { host: status.host }) : t("hint")}</p>
          </div>
        ) : (
          <p className="rounded-xl border border-border-dim px-3 py-2 text-[12.5px] text-secondary">{t("askAdmin")}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Why nothing new is coming in, over figures that are still shown (§11 board
 * 20): Google took the access back, the account lost the property, or it was
 * disconnected. An admin can connect again from here.
 */
export function AnalyticsConnectionBanner({ status, siteId }: { status: AnalyticsStatus; siteId: Id<"companyWebsites"> }) {
  const t = useTranslations("googleAnalytics.connection");
  const { start, busy } = useBeginAnalyticsConnect(siteId);
  const connection = status.connection;
  if (!connection || (connection.status !== "NEEDS_RECONNECT" && connection.status !== "DISCONNECTED")) return null;
  const account = connection.googleAccount ?? t("someone");
  const property = connection.propertyName ?? connection.property ?? "";
  const title = connection.status === "DISCONNECTED"
    ? t("disconnectedOn", { day: connection.disconnectedAt ? formatDate(connection.disconnectedAt) : "–" })
    : t(`problem.${connection.problem ?? "REVOKED"}`, { account, property });
  return (
    <Notice
      tone="warning"
      action={status.canManage && status.configured ? (
        <Button variant="brand" disabled={busy} onClick={() => void start()}>{t("reconnect")}</Button>
      ) : null}
    >
      <span className="block font-medium text-foreground">{title}</span>
      <span className="block">{connection.newestDay ? t("keptTo", { day: formatDay(connection.newestDay) }) : t("keptNone")}</span>
    </Notice>
  );
}

/**
 * What a page shows until the website has figures (§5, "the states people
 * meet first"; §11 boards 11 and 17): the way to connect; the way to the
 * Connection page while a property or what counts is still to be chosen; and,
 * connected, the first collection coming in.
 */
export function AnalyticsGate({ status, siteId, children }: {
  status: AnalyticsStatus;
  siteId: Id<"companyWebsites">;
  children: React.ReactNode;
}) {
  const t = useTranslations("googleAnalytics.gate");
  const hrefFor = useAnalyticsHref(siteId);
  const connection = status.connection;
  if (hasFigures(status)) return <>{children}</>;
  if (connection?.status === "CHOOSING" || connection?.status === "COUNTING") {
    const step = connection.status === "CHOOSING" ? "choose" : "count";
    return (
      <div className={PANEL}>
        <ListChecks className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
        <div className="flex max-w-2xl flex-col items-start gap-3">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[15px] font-medium text-foreground">{t(`${step}Title`)}</h2>
            <p className="text-[13px] text-secondary">{t(`${step}Body`, { host: status.host })}</p>
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
          <span className="block">{t("collectingBody")}</span>
        </Notice>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-sidebar/30" />)}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-sidebar/30" />
      </div>
    );
  }
  return <AnalyticsConnectCard status={status} siteId={siteId} />;
}

/** A website counting nothing as a conversion yet (§11 board 18): its visits are here; conversions wait for a choice. */
export function NothingCounted({ status, siteId }: { status: AnalyticsStatus; siteId: Id<"companyWebsites"> }) {
  const t = useTranslations("googleAnalytics.nothingCounted");
  const hrefFor = useAnalyticsHref(siteId);
  const router = useRouter();
  return (
    <div className={PANEL}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/15">
        <HandCoins className="h-5 w-5 text-foreground" aria-hidden="true" />
      </span>
      <div className="flex max-w-2xl flex-col items-start gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[15px] font-medium text-foreground">{t("title")}</h2>
          <p className="text-[13px] text-secondary">{t("body", { host: status.host })}</p>
        </div>
        {status.canManage ? (
          <Button variant="brand" onClick={() => router.push(hrefFor("connection", { change: "1" }))}>{t("button")}</Button>
        ) : null}
        <p className="text-[12px] text-muted">{t("hint")}</p>
      </div>
    </div>
  );
}

/** Whether the website counts anything as a conversion. */
export function countsAnything(status: AnalyticsStatus): boolean {
  return (status.connection?.events ?? []).some((event) => event.counted);
}
