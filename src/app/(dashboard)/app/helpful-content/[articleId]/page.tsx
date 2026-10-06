"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Library } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Header from "@/src/ui/components/layout/Header";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { LearnShell } from "../../_learn/LearnShell";
import { LIST_HEADING, StoryList } from "../../_learn/StoryParts";
import { useTopicNames } from "../../_learn/useTopicNames";
import { StoryKicker } from "../../news/_components/NewsStory";
import { HelpfulBody, helpfulStory, type HelpfulArticle } from "../_components/HelpfulArticle";

/**
 * One Helpful content article on its own page (docs/plans/active/insights-
 * helpful-content-plan.md, IH7, board 2): Hakken's summary, what it means, its
 * facts, the original in a new tab, Ask Hakken about it, and more on its
 * topic. A draft, or one taken down, reads as not here.
 */
export default function HelpfulArticlePage() {
  const t = useTranslations("learn.helpful");
  const language = useLocale();
  const params = useParams();
  const article = useQuery(api.libraryArticles.getForReader, { articleId: params.articleId as Id<"libraryArticles">, language });
  const back = { label: t("back"), href: "/app/helpful-content" };
  const icon = <Library className="h-6 w-6 text-brand" />;

  if (article === undefined) {
    return (
      <>
        <Header />
        <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
      </>
    );
  }

  if (article === null) {
    return (
      <LearnShell header={<DetailHeader back={back} icon={icon} title={t("notFoundTitle")} />}>
        <HakkenEmptyState icon={Library} title={t("notFoundTitle")} description={t("notFoundDescription")} />
      </LearnShell>
    );
  }

  return (
    <LearnShell current={article.topic ? `helpful-${article.topic}` : "helpful"} header={<DetailHeader back={back} icon={icon} title={article.title} />}>
      <article className="flex flex-col gap-5">
        <StoryKicker kind="HELPFUL" sourceName={article.publication} publishedAt={article.addedAt} />
        <HelpfulBody article={article} />
      </article>
      <MoreOnTopic article={article} />
    </LearnShell>
  );
}

/** "More on <topic>" under the article — or the newest others when it has no topic — one line each. */
function MoreOnTopic({ article }: { article: HelpfulArticle }) {
  const t = useTranslations("learn.helpful");
  const language = useLocale();
  const topicName = useTopicNames();
  const more = useQuery(api.libraryArticles.listMoreForReaders, { language, exclude: article._id, ...(article.topic ? { topic: article.topic } : {}) });
  if (!more || more.length === 0) return null;
  const topic = topicName(article.topic);
  return (
    <section data-part="more-on-topic" aria-labelledby="helpful-more" className="mt-8 flex flex-col gap-2 border-t border-border-dim pt-6">
      <h2 id="helpful-more" className={LIST_HEADING}>{topic ? t("moreOn", { topic }) : t("moreArticles")}</h2>
      <StoryList stories={more.map(helpfulStory)} />
    </section>
  );
}
