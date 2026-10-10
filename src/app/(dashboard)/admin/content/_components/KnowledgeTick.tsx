"use client";

import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";

/** A story's place in Knowledge, as `knowledgeStateOf` answers it. */
export type KnowledgeState = {
  state: "IN" | "READING" | "FAILED" | null;
  words: number | null;
  problem: string | null;
};

/**
 * The In knowledge tick on News and on a person's page (docs/plans/active/
 * content-people-knowledge-plan.md, C4, boards 2 and 4). Ticked, Hakken reads
 * the whole article once and keeps it in Knowledge for Ask Hakken; unticked,
 * the kept copy goes and the story stays in News. It sits in a clickable row,
 * so it never opens the row.
 */
export function KnowledgeTick({ itemId, title, knowledge }: { itemId: Id<"newsItems">; title: string; knowledge: KnowledgeState }) {
  const t = useTranslations("admin.knowledgeTick");
  const setInKnowledge = useMutation(api.newsKnowledge.setNewsItemInKnowledge);
  const action = useAdminAction({ scope: "admin-news-knowledge" });
  const ticked = knowledge.state === "IN" || knowledge.state === "READING";
  return (
    <span onClick={(event) => event.stopPropagation()} className="inline-flex">
      <Checkbox
        label={t("label", { title })}
        labelHidden
        checked={ticked}
        disabled={action.isBusy(itemId)}
        onChange={(keep) => void action.run(() => setInKnowledge({ itemId, keep }), { key: itemId, fallbackMessage: t("failed") })}
      />
    </span>
  );
}

/** Words kept: the kept article's length, "Reading the page…" while it is read, why it could not be kept, or "Summary only". */
export function WordsKept({ knowledge }: { knowledge: KnowledgeState }) {
  const t = useTranslations("admin.knowledgeTick");
  if (knowledge.state === "IN") {
    return knowledge.words === null
      ? <span className="text-[12px] text-muted">{t("kept")}</span>
      : <span className="font-mono text-[12px] tabular-nums text-foreground">{knowledge.words.toLocaleString("en-GB")}</span>;
  }
  if (knowledge.state === "READING") return <StatusLabel tone="info" icon="working">{t("reading")}</StatusLabel>;
  if (knowledge.state === "FAILED") {
    return <StatusLabel tone="warning" wrap className="text-left">{knowledge.problem ?? t("couldNotKeep")}</StatusLabel>;
  }
  return <span className="text-[12px] text-muted">{t("summaryOnly")}</span>;
}
