"use client";

import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, BookOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { knowledgeTopicHref } from "../../_learn/LearnShell";
import { formatShortDay, localDay } from "../../_learn/learnDates";
import { ABOVE_PANEL, ArticleFacts, CountAside, Dateline, LEAD_PANEL, LEAD_SECTION, LEAD_TITLE, LIST_HEADING, PanelLink, ShowMore, StoryColumns, StoryList, readingMinutes, type Story } from "../../_learn/StoryParts";
import { useTopicNames } from "../../_learn/useTopicNames";
import { StoryKicker } from "../../news/_components/NewsStory";

/** Articles read at a time; "Show more" reads the next as many. */
const PAGE = 20;
/** The articles set in columns under the lead (R5). */
const COLUMNS = 3;

export type KnowledgeSummary = FunctionReturnType<typeof api.knowledgeArticles.listPublishedPage>["page"][number];

export const knowledgeHref = (articleId: string) => `/app/knowledge/${articleId}`;

/** A Knowledge article on a list: by when it was published, under the platform's name. */
export function knowledgeStory(article: KnowledgeSummary, platformName: string): Story {
  return { key: article._id, kind: "KNOWLEDGE", title: article.title, summary: article.excerpt, sourceName: platformName, publishedAt: article.publishedAt, href: knowledgeHref(article._id) };
}

/**
 * Knowledge's front page (docs/plans/active/insights-helpful-content-plan.md,
 * IH12, board 6), set out as News's: the dateline, the pinned article — else
 * the newest — leading with what Knowledge covers beside it, three in
 * columns, then the rest one to a line — read from the server a page at a
 * time, its numbers from the counts kept as the list changes (IH21).
 */
export function KnowledgeFront() {
  const t = useTranslations("knowledgeArticles.front");
  const language = useLocale();
  const { platformName } = useSystemSettings();
  const today = localDay();
  const counts = useQuery(api.learnMenu.getLearnMenuCounts, { today, language });
  const feed = usePaginatedQuery(api.knowledgeArticles.listPublishedPage, { language }, { initialNumItems: PAGE });
  const pinned = useQuery(api.knowledgeArticles.getPinnedForReaders, { language, today });

  if (feed.status === "LoadingFirstPage" || pinned === undefined) return <div className="h-64 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  // A Knowledge article pinned to lead the News front page leads here too (insights-helpful-content-plan.md, IH11).
  const lead = pinned ?? feed.results[0];
  if (!lead) return <HakkenEmptyState icon={BookOpen} title={t("emptyTitle")} description={t("empty")} />;
  const rest = feed.results.filter((article) => article._id !== lead._id);

  const columns = rest.slice(0, COLUMNS).map((article) => knowledgeStory(article, platformName));
  const wire = rest.slice(COLUMNS).map((article) => knowledgeStory(article, platformName));
  const topics = (counts?.topics ?? []).filter((topic) => (counts?.articles.byTopic[topic.key] ?? 0) > 0);

  return (
    <div className="flex flex-col">
      <Dateline
        left={<><span className="font-medium text-foreground">{t("articleCount", { count: counts?.articles.all ?? feed.results.length })}</span>{" · "}{t("writtenBy", { platformName })}</>}
        right={t("lastAdded", { day: formatShortDay(localDay(new Date(Math.max(...feed.results.map((article) => article.publishedAt)))), language) })}
      />

      <section data-part="lead-story" aria-label={t("leadLabel")} className={LEAD_SECTION}>
        <article className={LEAD_PANEL}>
          <StoryKicker kind="KNOWLEDGE" sourceName={platformName} publishedAt={lead.publishedAt} />
          <h2 className={LEAD_TITLE}>
            <PanelLink href={knowledgeHref(lead._id)} className="transition-colors hover:text-foreground/80">{lead.title}</PanelLink>
          </h2>
          <KnowledgeLeadBody article={lead} />
        </article>
        <CountAside
          part="knowledge-topics"
          icon={<BookOpen className="h-3 w-3" aria-hidden="true" />}
          label={t("topicsLabel")}
          title={t("topicsTitle")}
          description={t("topicsDescription", { platformName })}
          rows={topics.map((topic) => ({ key: topic.key, label: topic.name, count: counts?.articles.byTopic[topic.key] ?? 0, href: knowledgeTopicHref(topic.key) }))}
          countWords={(count) => t("articleCount", { count })}
          link={{ label: t("helpfulContent"), href: "/app/helpful-content" }}
        />
      </section>

      <StoryColumns stories={columns} label={t("moreLabel")} />

      {wire.length > 0 || feed.status === "CanLoadMore" ? (
        <section data-part="earlier-stories" aria-labelledby="knowledge-earlier" className="flex flex-col gap-2 pt-7">
          <h3 data-part-title id="knowledge-earlier" className={LIST_HEADING}>{t("earlier")}</h3>
          <StoryList stories={wire} />
          <ShowMore feed={feed} pageSize={PAGE} />
        </section>
      ) : null}
    </div>
  );
}

/** Under the lead's headline: its opening, its facts, the article and Ask Hakken about it. */
export function KnowledgeLeadBody({ article }: { article: KnowledgeSummary }) {
  const t = useTranslations("knowledgeArticles.front");
  const tArticle = useTranslations("knowledgeArticles.article");
  const tStory = useTranslations("news.story");
  const { platformName } = useSystemSettings();
  const topicName = useTopicNames();
  const askHref = `/app/assistant?ask=${encodeURIComponent(tStory("askQuestion", { title: article.title }))}`;
  const link = `${ABOVE_PANEL} underline decoration-foreground/25 underline-offset-4 transition-colors hover:text-foreground`;
  return (
    <div className="flex flex-col gap-6">
      {article.excerpt ? <p className="max-w-2xl text-[16.5px] leading-relaxed text-foreground/85">{article.excerpt}</p> : null}
      <ArticleFacts facts={[topicName(article.topic), tArticle("readingTime", { minutes: readingMinutes(article.words) })]} />
      <p className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-secondary">
        <Link href={knowledgeHref(article._id)} className={`${link} inline-flex items-center gap-1.5`}>
          {t("readArticle")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        <Link href={askHref} className={link}>{tStory("askHakken", { platformName })}</Link>
      </p>
    </div>
  );
}

/** One topic's articles alone, newest first, with their openings — from the server a page at a time. */
export function KnowledgeList({ topic }: { topic: string }) {
  const t = useTranslations("knowledgeArticles.front");
  const language = useLocale();
  const { platformName } = useSystemSettings();
  const topicName = useTopicNames();
  const feed = usePaginatedQuery(api.knowledgeArticles.listPublishedPage, { language, topic }, { initialNumItems: PAGE });

  if (feed.status === "LoadingFirstPage") return <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  if (feed.results.length === 0) return <HakkenEmptyState icon={BookOpen} title={t("emptyTitle")} description={t("emptyTopic")} />;

  return (
    <section aria-labelledby="knowledge-topic" className="flex flex-col gap-2">
      <h2 id="knowledge-topic" className={`border-b border-border-dim pb-3 ${LIST_HEADING}`}>{topicName(topic) ?? t("allArticles")}</h2>
      <StoryList stories={feed.results.map((article) => knowledgeStory(article, platformName))} withSummary />
      <ShowMore feed={feed} pageSize={PAGE} />
    </section>
  );
}
