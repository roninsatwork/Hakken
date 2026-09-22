"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { cn } from "@/src/ui/lib/utils";
import { siteBase } from "./siteView";

/**
 * Moves worth making: what the last collection says to do next.
 *
 * Each card says what was seen and offers the one action that answers it,
 * which the server carries out — track the rival, add the spelling, pause the
 * question, add the search. Dismissing is remembered, so the same card never
 * returns; the next collection brings new ones. That is what makes this the
 * week-forty screen as much as the day-one one: a worklist, never a checklist.
 */
export function SiteMoves({
  companyId,
  companyWebsiteId,
}: {
  companyId: Id<"companies">;
  companyWebsiteId: Id<"companyWebsites">;
}) {
  const t = useTranslations("admin.siteView.moves");
  const data = useQuery(api.websiteMoves.listSiteMoves, { companyWebsiteId });
  const actOnMove = useMutation(api.websiteMoves.actOnMove);
  const action = useAdminAction({ scope: "admin-site-moves" });
  const [error, setError] = useState("");

  if (data === undefined) return null;
  const base = siteBase(companyId, companyWebsiteId);

  const act = async (moveId: Id<"websiteMoves">, choice: "TAKE" | "DISMISS") => {
    setError("");
    const outcome = await action.run(
      () => actOnMove({ moveId, action: choice }),
      { key: moveId, suppressErrorToast: true, fallbackMessage: t("errors.failed") },
    );
    if (!outcome.ok) setError(outcome.message);
  };

  const card = (move: (typeof data.moves)[number]) => {
    const busy = action.isBusy(move._id);
    const take = (label: string) => (
      <Button variant="accent" className="shrink-0 px-3 py-2" disabled={busy} onClick={() => void act(move._id, "TAKE")}>
        {label}
      </Button>
    );
    const dismiss = (label: string) => (
      <Button variant="quiet" className="shrink-0 px-3 py-2" disabled={busy} onClick={() => void act(move._id, "DISMISS")}>
        {label}
      </Button>
    );
    const go = (href: string, label: string) => (
      <Link
        href={href}
        className="shrink-0 rounded-[8px] border border-border-dim px-3 py-2 text-[12px] font-medium text-secondary transition-colors hover:text-foreground"
      >
        {label}
      </Link>
    );

    let tone = "border-border-dim bg-card/40";
    let label = "";
    let title: ReactNode = null;
    let detail: ReactNode = null;
    let actions: ReactNode = null;

    if (move.kind === "RIVAL") {
      tone = "border-brand/40 bg-brand/5";
      label = t("kinds.RIVAL");
      title = t("rival.title", { host: move.evidence.host, times: move.evidence.times });
      detail = t("rival.detail", { day: move.evidence.lastDay });
      actions = <>{take(t("rival.take"))}{dismiss(t("rival.dismiss"))}</>;
    } else if (move.kind === "NAME") {
      tone = "border-warning/40 bg-warning/5";
      label = t("kinds.NAME");
      title = t("name.title", { text: move.evidence.text, times: move.evidence.times });
      detail = t("name.detail");
      actions = <>{take(t("name.take"))}{dismiss(t("name.dismiss"))}</>;
    } else if (move.kind === "SLIPPING_SEARCH") {
      label = t("kinds.SLIPPING_SEARCH");
      title = move.evidence.to === null
        ? t("slipping.titleGone", { keyword: move.evidence.keyword, from: move.evidence.from })
        : t("slipping.title", { keyword: move.evidence.keyword, from: move.evidence.from, to: move.evidence.to });
      detail = t("slipping.detail", { day: move.evidence.day });
      actions = <>{go(`${base}/keywords`, t("slipping.look"))}{take(t("slipping.take"))}</>;
    } else if (move.kind === "DEAD_QUESTION") {
      label = t("kinds.DEAD_QUESTION");
      title = t("dead.title", { prompt: move.evidence.prompt, weeks: move.evidence.weeks });
      detail = t("dead.detail", { asked: move.evidence.asked });
      actions = <>{go(`${base}/tracking?list=questions`, t("dead.rewrite"))}{take(t("dead.take"))}{dismiss(t("dead.dismiss"))}</>;
    } else {
      label = t("kinds.UNTRACKED_SEARCH");
      title = t("gap.title", { query: move.evidence.query, times: move.evidence.timesSeen });
      detail = t("gap.detail", { prompt: move.evidence.prompt });
      actions = <>{take(t("gap.take"))}{dismiss(t("gap.dismiss"))}</>;
    }

    return (
      <div
        key={move._id}
        className={cn("flex flex-col gap-3 rounded-[13px] border p-4 sm:flex-row sm:items-center sm:gap-4", tone)}
      >
        <span className="w-fit shrink-0 rounded-full bg-foreground/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.07em] text-secondary">
          {label}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[14px] font-semibold text-foreground">{title}</span>
          <span className="text-[12px] text-secondary">{detail}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
        <h2 className="text-[16px] font-semibold text-foreground">{t("title")}</h2>
        <span className="text-[12px] text-muted">{t("subtitle")}</span>
      </div>
      {data.moves.length === 0 ? (
        <p className="rounded-[13px] border border-dashed border-border-dim px-4 py-3 text-[12px] text-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">{data.moves.map(card)}</div>
      )}
      {data.openCount > data.moves.length ? (
        <span className="text-[11px] text-muted">{t("more", { count: data.openCount - data.moves.length })}</span>
      ) : null}
      <SaveError>{error}</SaveError>
    </section>
  );
}
