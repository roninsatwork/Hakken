"use client";

import { useSearchParams } from "next/navigation";
import { Newspaper } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { LearnShell, isNewsKind } from "../_learn/LearnShell";
import { NewsFrontPage, NewsKindList } from "./_components/NewsFrontPage";

/**
 * News (docs/plans/active/knowledge-news-and-digest-plan.md, phase 3, revised
 * again 2026-10-01): every signed-in user's, in Learn. The front page leads
 * with one story and sets the rest out as a newspaper does (R5); a kind chosen
 * in the side menu — Google updates, or what came from YouTube, X or websites
 * — lists that kind alone, newest first. Each story opens on its own page.
 */
export default function NewsPage() {
  const t = useTranslations("news");
  const kind = useSearchParams().get("kind");
  return (
    <LearnShell header={<PageHeader icon={<Newspaper className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} divider />}>
      {isNewsKind(kind) ? <NewsKindList kind={kind} /> : <NewsFrontPage />}
    </LearnShell>
  );
}
