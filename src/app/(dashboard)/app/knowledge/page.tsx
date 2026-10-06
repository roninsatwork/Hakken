"use client";

import { useSearchParams } from "next/navigation";
import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { LearnShell, isTopicKey } from "../_learn/LearnShell";
import { KnowledgeFront, KnowledgeList } from "./_components/KnowledgeFront";

/**
 * Knowledge (docs/plans/active/knowledge-news-and-digest-plan.md, phase 1;
 * redrawn by insights-helpful-content-plan.md, IH12): the articles every
 * signed-in user can read, whatever their company (A14), in their language
 * once the Translator has it. The front page is set out as News's; a topic
 * chosen in the side menu lists its own (R9). One opens on its own page.
 */
export default function KnowledgePage() {
  const t = useTranslations("knowledgeArticles.list");
  const topic = useSearchParams().get("topic");
  return (
    <LearnShell header={<PageHeader icon={<BookOpen className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} divider />}>
      {isTopicKey(topic) ? <KnowledgeList topic={topic} /> : <KnowledgeFront />}
    </LearnShell>
  );
}
