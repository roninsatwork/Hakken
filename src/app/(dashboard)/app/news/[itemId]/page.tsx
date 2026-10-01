"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Newspaper } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Header from "@/src/ui/components/layout/Header";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { LearnShell } from "../../_learn/LearnShell";
import { localDay } from "../../_learn/learnDates";
import { StoryBody, StoryKicker } from "../_components/NewsStory";

/**
 * One story on its own page (docs/plans/active/knowledge-news-and-digest-
 * plan.md, revised again 2026-10-01, R10), as every row in Sites has a screen
 * behind it: what it says, a Google update's rollout, what it means for the
 * reader, the original, and Ask Hakken about it. One taken down reads as not
 * here.
 */
export default function NewsStoryPage() {
  const t = useTranslations("news.story");
  const language = useLocale();
  const params = useParams();
  const item = useQuery(api.news.getNewsItem, { itemId: params.itemId as Id<"newsItems">, language });
  const back = { label: t("back"), href: "/app/news" };

  if (item === undefined) {
    return (
      <>
        <Header />
        <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
      </>
    );
  }

  if (item === null) {
    return (
      <LearnShell header={<DetailHeader back={back} icon={<Newspaper className="h-6 w-6 text-brand" />} title={t("notFoundTitle")} />}>
        <HakkenEmptyState icon={Newspaper} title={t("notFoundTitle")} description={t("notFoundDescription")} />
      </LearnShell>
    );
  }

  return (
    <LearnShell header={<DetailHeader back={back} icon={<Newspaper className="h-6 w-6 text-brand" />} title={item.title} />}>
      <article className="flex flex-col gap-5">
        <StoryKicker kind={item.kind} sourceName={item.sourceName} publishedAt={item.publishedAt} />
        <StoryBody item={item} today={localDay()} />
      </article>
    </LearnShell>
  );
}
