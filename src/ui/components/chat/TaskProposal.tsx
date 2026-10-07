"use client";

import { useMutation } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { TaskProposal as Proposal } from "@/convex/utils/hakkenTaskProposals";
import { pathOf } from "@/convex/utils/hakkenTaskRules";
import { clockOf } from "@/convex/utils/hakkenTaskTiming";
import { PageLinkCell } from "@/src/app/(dashboard)/app/sites/_components/SiteCells";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate } from "@/src/lib/dates";
import { Button } from "@/src/ui/components/screens/Button";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";

/**
 * A change the Assistant proposed, waiting for the reader's tap
 * (docs/plans/active/hakken-tasks-plan.md, item 1.2, as drawn and signed off
 * 2026-10-07 — the drawing's `JobConfirmation`): a new alert written out line
 * by line with "Yes, start watching" and "Not now", or pausing, resuming or
 * deleting one of their own. Plain rows under a rule, no box. Nothing changes
 * until they answer; the answer is theirs alone, once.
 */
export function TaskProposal({ messageId, proposal, isReadOnly = false }: { messageId: Id<"messages">; proposal: Proposal; isReadOnly?: boolean }) {
  const t = useTranslations("ai.assistant.taskProposal");
  const locale = useLocale();
  const { platformName } = useSystemSettings();
  const answer = useMutation(api.hakkenTasks.answerProposal);
  const action = useAdminAction({ scope: "assistant-task-proposal" });

  const reply = (yes: boolean) =>
    void action.run(
      () => answer({ messageId, yes, ...(yes ? { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}) }),
      { fallbackMessage: t("failed"), suppressErrorToast: true },
    );
  const busy = action.isBusy();
  const answered = proposal.status !== "PENDING";

  if (proposal.action !== "CREATE") {
    const words = {
      ask: t(`change.${proposal.action}.ask`, { title: proposal.title, platformName }),
      yes: t(`change.${proposal.action}.yes`),
      no: t(`change.${proposal.action}.no`),
      done: t(`change.${proposal.action}.done`),
    };
    return (
      <div className="flex flex-col gap-3 mt-1">
        <p className="text-[13px] leading-snug text-foreground border-t border-border-dim pt-3">{words.ask}</p>
        {answered ? (
          proposal.status === "DONE" ? <StatusLabel tone="success">{words.done}</StatusLabel> : <TagLabel>{t("leftAsItWas")}</TagLabel>
        ) : !isReadOnly ? (
          <div className="flex items-center gap-2">
            <Button variant={proposal.action === "DELETE" ? "destructive" : "primary"} onClick={() => reply(true)} disabled={busy}>{words.yes}</Button>
            <Button variant="ghost" onClick={() => reply(false)} disabled={busy}>{words.no}</Button>
          </div>
        ) : null}
        {action.error && <p role="alert" className="text-[12px] text-warning">{action.error}</p>}
      </div>
    );
  }

  const condition = proposal.condition;
  const rule = condition
    ? (() => {
        const one =
          condition.op === "dropBy" && condition.value === 50
            ? t("rule.dropHalf")
            : t(`rule.${condition.op}`, { value: condition.value.toLocaleString() });
        return condition.days > 1 ? t("rule.inARow", { rule: one, days: condition.days }) : one;
      })()
    : "";
  const rows: Array<[string, React.ReactNode]> = [
    [t("watch"), t(`measures.${proposal.measure ?? "visitors"}`)],
    proposal.target?.page
      ? [t("page"), <PageLinkCell key="page" href={`/app/search-console/${proposal.target.companyWebsiteId}/pages`} page={pathOf(proposal.target.page)} />]
      : [t("website"), proposal.target?.website ?? ""],
    [t("letYouKnow"), rule],
    [t("when"), t("at", { time: locale.startsWith("en") ? clockOf(proposal.timeOfDay ?? "09:00") : (proposal.timeOfDay ?? "09:00") })],
    [t("where"), t("whereBellEmail", { platformName })],
    [t("goodToKnow"), t("settle")],
    [t("cost"), t("free")],
  ];

  return (
    <div className="flex flex-col gap-3 mt-1">
      <div className="flex flex-col border-t border-border-dim">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-4 py-2 border-b border-border-dim text-[13px] leading-snug">
            <span className="w-32 shrink-0 text-muted">{label}</span>
            <span className="text-foreground">{value}</span>
          </div>
        ))}
      </div>
      {answered ? (
        proposal.status === "DONE" ? (
          <StatusLabel tone="success">{t("set", { date: formatDate(proposal.answeredAt, { locale, fallback: "" }) })}</StatusLabel>
        ) : (
          <TagLabel>{t("declined")}</TagLabel>
        )
      ) : !isReadOnly ? (
        <>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => reply(true)} disabled={busy}>{t("yes")}</Button>
            <Button variant="ghost" onClick={() => reply(false)} disabled={busy}>{t("notNow")}</Button>
          </div>
          <p className="text-[12px] text-muted">{t("hint")}</p>
        </>
      ) : null}
      {action.error && <p role="alert" className="text-[12px] text-warning">{action.error}</p>}
    </div>
  );
}
