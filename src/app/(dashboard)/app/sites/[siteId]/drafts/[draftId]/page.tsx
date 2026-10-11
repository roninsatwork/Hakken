"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { PenLine } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { Button } from "@/src/ui/components/screens/Button";
import { DetailHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDay } from "../../../_components/siteFormat";

/** Where each area's drafts are listed, to go back to. */
const BACK: Record<string, string> = { LOCAL: "local", REVIEWS: "reviews", LINKS: "backlinks/where" };

/**
 * One drafted fix (insights-analyst-plan.md I23, I39): what it is, why, the
 * words to paste or send with their tagged link, and the person's answer.
 * Until Google approves Hakken's Business Profile access (I31), and with
 * nothing emailed in alpha (I17), approving copies the words for the person
 * to use themselves; the tagged link lets the Track record count what it
 * brought.
 */
export default function SiteDraftPage() {
  const t = useTranslations("sites.drafts");
  const params = useParams<{ siteId: string; draftId: string }>();
  const draft = useQuery(api.insightsDrafts.siteDraft, { draftId: params.draftId as Id<"insightDrafts"> });
  const decide = useMutation(api.insightsDrafts.decideDraft);
  const action = useAdminAction({ scope: "insight-draft" });
  const [copied, setCopied] = useState(false);
  if (draft === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  if (draft === null) return <HakkenEmptyState icon={PenLine} title={t("gone")} description={t("goneDescription")} />;
  const back = `/app/sites/${draft.siteId}/${BACK[draft.area] ?? "local"}`;
  const answer = (decision: "APPROVED" | "DISMISSED" | "DRAFTED") => void action.run(async () => {
    if (decision === "APPROVED") {
      await navigator.clipboard?.writeText(draft.body).catch(() => undefined);
      setCopied(true);
    }
    await decide({ draftId: draft.draftId, decision });
  }, { key: decision, fallbackMessage: t("failed") });
  const busy = action.isBusy();
  const tone = draft.status === "APPROVED" ? "success" : draft.status === "DISMISSED" ? "neutral" : "info";

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={{ href: back, label: t(`back.${draft.area}`) }}
        icon={<PenLine className="h-5 w-5 text-brand" />}
        title={draft.title}
        description={draft.why}
        pills={<><StatusLabel tone={tone}>{t(`statuses.${draft.status}`)}</StatusLabel><span className="text-[12px] text-secondary">{t("drafted", { day: formatDay(new Date(draft.createdAt).toISOString().slice(0, 10)), target: draft.target })}</span></>}
        action={draft.status === "DISMISSED" ? undefined : <PagePrimaryAction variant="brand" onClick={() => answer("APPROVED")} disabled={busy}>{t(draft.status === "APPROVED" ? "copyAgain" : "approve")}</PagePrimaryAction>}
      />
      <HakkenSees says={[draft.why]} steps={[{ words: t(`howTo.${draft.kind}`), link: t(`back.${draft.area}`), href: back }]} />
      <div className="max-w-3xl whitespace-pre-wrap border-l-2 border-border-dim pl-4 text-[14px] leading-relaxed text-foreground">{draft.body}</div>
      {draft.link ? <p className="max-w-2xl text-[12px] text-secondary">{t("tagged", { campaign: draft.campaign })}</p> : null}
      {copied ? <Notice tone="info">{t("copied")}</Notice> : null}
      <div className="flex flex-wrap gap-3">
        {draft.status === "DRAFTED"
          ? <Button variant="quiet" onClick={() => answer("DISMISSED")} disabled={busy}>{t("dismiss")}</Button>
          : <Button variant="quiet" onClick={() => answer("DRAFTED")} disabled={busy}>{t("undo")}</Button>}
      </div>
    </div>
  );
}
