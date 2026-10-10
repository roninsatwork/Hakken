"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BookOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import Header from "@/src/ui/components/layout/Header";
import { HakkenMarkdown } from "@/src/ui/components/chat/HakkenMarkdown";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { formatDate } from "@/src/lib/dates";
import { LearnShell } from "../../_learn/LearnShell";
import { ArticleFacts, LIST_HEADING, StoryList, readingMinutes } from "../../_learn/StoryParts";
import { useTopicNames } from "../../_learn/useTopicNames";
import { useCountReading } from "../../_learn/useReading";
import { StoryKicker } from "../../news/_components/NewsStory";
import { helpfulStory } from "../../helpful-content/_components/HelpfulArticle";
import { knowledgeStory } from "../_components/KnowledgeFront";

/** Stories listed under "Keep reading". */
const KEEP_READING = 4;

type KnowledgeArticle = NonNullable<FunctionReturnType<typeof api.knowledgeArticles.getPublishedArticle>>;

/**
 * One Knowledge article, on its own page with the way back to the list
 * (docs/plans/active/knowledge-news-and-digest-plan.md, phase 1; redrawn by
 * insights-helpful-content-plan.md, IH12, board 7): its kicker and facts, its
 * whole text — Hakken's own — Ask Hakken about it, and "Keep reading", the
 * same topic's Knowledge and Helpful content together. In the reader's
 * language once the Translator has it; a draft, or one taken down, reads as
 * not here.
 */
export default function KnowledgeArticlePage() {
  const t = useTranslations("knowledgeArticles.article");
  const tStory = useTranslations("news.story");
  const locale = useLocale();
  const { platformName } = useSystemSettings();
  const topicName = useTopicNames();
  const params = useParams();
  const article = useQuery(api.knowledgeArticles.getPublishedArticle, { articleId: params.articleId as Id<"knowledgeArticles">, language: locale });
  // A view, then a read at 30 seconds or its end (content-people-knowledge-plan.md, phase 4).
  const endRef = useCountReading(article ? { type: "OURS", id: article._id } : null);
  const back = { label: t("back"), href: "/app/knowledge" };
  const icon = <BookOpen className="h-6 w-6 text-brand" />;

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
        <HakkenEmptyState icon={BookOpen} title={t("notFoundTitle")} description={t("notFoundDescription")} />
      </LearnShell>
    );
  }

  const askHref = `/app/assistant?ask=${encodeURIComponent(tStory("askQuestion", { title: article.title }))}`;

  return (
    <LearnShell current={article.topic ? `topic-${article.topic}` : "articles"} header={<DetailHeader back={back} icon={icon} title={article.title} />}>
      <div className="flex flex-col gap-3">
        <StoryKicker kind="KNOWLEDGE" sourceName={platformName} publishedAt={article.publishedAt} />
        <ArticleFacts facts={[topicName(article.topic), t("readingTime", { minutes: readingMinutes(article.words) }), t("updated", { date: formatDate(article.updatedAt) })]} />
      </div>
      {/*
        No box around it (Anthony, 2026-10-01: no cards). A long line is harder
        to read, so the words keep a column (AGENTS.md, fluid layouts). An
        article's own table — the traffic article's "who clicks" — is styled
        from here, so the renderer stays as chat uses it.
      */}
      <article className="max-w-2xl pt-2 text-[14px] leading-relaxed text-foreground [&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_td]:border-t [&_td]:border-border-dim [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.12em] [&_th]:text-secondary">
        <HakkenMarkdown content={article.body} />
      </article>
      <div ref={endRef} aria-hidden="true" />
      <p className="text-[13px] text-secondary">
        <Link href={askHref} className="underline decoration-foreground/25 underline-offset-4 transition-colors hover:text-foreground">
          {tStory("askHakken", { platformName })}
        </Link>
      </p>
      <KeepReading article={article} />
    </LearnShell>
  );
}

/** "Keep reading": the same topic's Knowledge and Helpful content together, newest first — the newest of each when it has no topic. */
function KeepReading({ article }: { article: KnowledgeArticle }) {
  const t = useTranslations("knowledgeArticles.article");
  const language = useLocale();
  const { platformName } = useSystemSettings();
  const topic = article.topic ? { topic: article.topic } : {};
  const knowledge = useQuery(api.knowledgeArticles.listMoreForReaders, { language, exclude: article._id, ...topic });
  const helpful = useQuery(api.libraryArticles.listMoreForReaders, { language, ...topic });
  if (knowledge === undefined || helpful === undefined) return null;
  const stories = [...knowledge.map((row) => knowledgeStory(row, platformName)), ...helpful.map(helpfulStory)]
    .sort((left, right) => right.publishedAt - left.publishedAt)
    .slice(0, KEEP_READING);
  if (stories.length === 0) return null;
  return (
    <section data-part="keep-reading" aria-labelledby="knowledge-keep-reading" className="mt-6 flex flex-col gap-2 border-t border-border-dim pt-6">
      <h2 id="knowledge-keep-reading" className={LIST_HEADING}>{t("keepReading")}</h2>
      <StoryList stories={stories} />
    </section>
  );
}
