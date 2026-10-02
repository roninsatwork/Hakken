"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { AlertTriangle, ListChecks, Plug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { formatDate } from "@/src/lib/dates";
import { formatDay } from "../../sites/_components/siteFormat";
import { SiteViewSwitch } from "../../sites/_components/SiteViewSwitch";
import { RESULT_KINDS, useResultKind, useSearchConsoleHref } from "./useSearchConsole";

export type SearchConsoleStatus = NonNullable<FunctionReturnType<typeof api.searchConsoleConnect.searchConsoleStatus>>;

/**
 * Start connecting: the server mints the sign-in's single-use state and hands
 * back the one link to follow, to Google's own sign-in and back to the
 * site's Connection page. A new screen, never a pop-up.
 */
export function useBeginConnect(siteId: Id<"companyWebsites">): { start: () => Promise<void>; busy: boolean } {
  const t = useTranslations("searchConsole.connect");
  const begin = useMutation(api.searchConsoleConnect.beginSearchConsoleConnect);
  const { run, isBusy } = useAdminAction({ scope: "search-console-connect" });
  return {
    busy: isBusy(),
    start: async () => {
      const outcome = await run(() => begin({ siteId }), { fallbackMessage: t("failed") });
      if (outcome.ok) window.location.assign(outcome.data.authorizeUrl);
    },
  };
}

/** Whether the site has figures to show: connected once, whatever it is now. */
export function hasFigures(status: SearchConsoleStatus): boolean {
  const connection = status.connection;
  return Boolean(connection?.newestDay) && connection?.status !== "CHOOSING";
}

const PANEL = "flex gap-5 rounded-2xl border border-border-dim bg-card/40 p-6";

/**
 * A site with nothing from Search Console yet: what connecting brings, and
 * the way to connect for an admin, or who can for anyone else. The Google app
 * not set up yet says that instead, since nobody here can connect until it is.
 */
export function ConnectCard({ status, siteId }: { status: SearchConsoleStatus; siteId: Id<"companyWebsites"> }) {
  const t = useTranslations("searchConsole.connect");
  const { start, busy } = useBeginConnect(siteId);
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
  );
}

/**
 * Why nothing new is coming in, over figures that are still shown: Google
 * took the access back, the account lost the property, or it was
 * disconnected. An admin can connect again from here.
 */
export function ConnectionBanner({ status, siteId }: { status: SearchConsoleStatus; siteId: Id<"companyWebsites"> }) {
  const t = useTranslations("searchConsole.connection");
  const { start, busy } = useBeginConnect(siteId);
  const connection = status.connection;
  if (!connection || (connection.status !== "NEEDS_RECONNECT" && connection.status !== "DISCONNECTED")) return null;
  const account = connection.googleAccount ?? t("someone");
  const title = connection.status === "DISCONNECTED"
    ? t("disconnectedOn", { day: connection.disconnectedAt ? formatDate(connection.disconnectedAt) : "–" })
    : connection.problem
      ? t(`problem.${connection.problem}`, { account, property: connection.property ?? "" })
      : t("problem.REVOKED", { account, property: connection.property ?? "" });
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] font-medium text-foreground">{title}</p>
          <p className="text-[12.5px] text-secondary">
            {connection.newestDay ? t("keptTo", { day: formatDay(connection.newestDay) }) : t("keptNone")}
          </p>
        </div>
      </div>
      {status.canManage && status.configured ? (
        <Button variant="brand" disabled={busy} onClick={() => void start()}>{t("reconnect")}</Button>
      ) : null}
    </div>
  );
}

/**
 * What a page shows until the site has figures: the way to connect, or, with
 * a sign-in back from Google and several properties to choose from, the way
 * to the Connection page to choose one. A site connected with nothing
 * collected says so: collecting waits for the Search Console agent
 * (search-console-plan.md §12), so connecting again would change nothing.
 */
export function SearchConsoleGate({ status, siteId, children }: {
  status: SearchConsoleStatus;
  siteId: Id<"companyWebsites">;
  children: React.ReactNode;
}) {
  const t = useTranslations("searchConsole.connection");
  const hrefFor = useSearchConsoleHref(siteId);
  if (hasFigures(status)) return <>{children}</>;
  if (status.connection?.status === "CHOOSING") {
    return (
      <div className={PANEL}>
        <ListChecks className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
        <div className="flex max-w-2xl flex-col items-start gap-3">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[15px] font-medium text-foreground">{t("chooseTitle")}</h2>
            <p className="text-[13px] text-secondary">
              {t("chooseDescription", { account: status.connection.googleAccount ?? t("someone"), host: status.host })}
            </p>
          </div>
          <Link href={hrefFor("connection")} className="text-[13px] font-medium text-info hover:underline">{t("chooseTitle")} →</Link>
        </div>
      </div>
    );
  }
  if (status.connection?.status === "CONNECTED") {
    return (
      <div className={PANEL}>
        <Plug className="h-6 w-6 shrink-0 text-muted" aria-hidden="true" />
        <div className="flex max-w-2xl flex-col items-start gap-3">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[15px] font-medium text-foreground">{t("nothingCollectedTitle")}</h2>
            <p className="text-[13px] text-secondary">{t("nothingCollectedBody", { host: status.host })}</p>
          </div>
          <Link href={hrefFor("connection")} className="text-[13px] font-medium text-info hover:underline">{t("title")} →</Link>
        </div>
      </div>
    );
  }
  return <ConnectCard status={status} siteId={siteId} />;
}

/** The kind of result every page of the site shows: web, image, video, news, Discover or Google News. */
export function ResultKindSwitch() {
  const t = useTranslations("searchConsole.kinds");
  const [kind, setKind] = useResultKind();
  return (
    <SiteViewSwitch
      label={t("label")}
      options={RESULT_KINDS.map((value) => ({ value, label: t(value) }))}
      value={kind}
      onChange={setKind}
    />
  );
}

/** A kind of result with nothing in the dates chosen. */
export function NothingOfKind({ from, to }: { from: string; to: string }) {
  const t = useTranslations("searchConsole");
  const [kind] = useResultKind();
  const name = t(`kinds.${kind}`);
  return (
    <div className="rounded-2xl border border-border-dim bg-card/40 px-6 py-10 text-center">
      <p className="text-[14px] font-medium text-foreground">{t("noKind.title", { kind: name })}</p>
      <p className="mt-1 text-[13px] text-secondary">{t("noKind.body", { kind: name, from: formatDay(from), to: formatDay(to) })}</p>
    </div>
  );
}
