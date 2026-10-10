"use client";

import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { languageName, siteOf } from "@/src/lib/helpfulContentFormat";
import { formatShortDay } from "../../_learn/learnDates";
import { ABOVE_PANEL, ArticleFacts, LIST_HEADING, readingMinutes, type Story } from "../../_learn/StoryParts";
import { useTopicNames } from "../../_learn/useTopicNames";
import { useCountClick } from "../../_learn/useReading";

/** A Helpful content article as a reader sees it, in their language — never its words (IH1). */
export type HelpfulArticle = NonNullable<FunctionReturnType<typeof api.libraryArticles.getForReader>>;
type Article = HelpfulArticle;

export const helpfulHref = (articleId: string) => `/app/helpful-content/${articleId}`;

/** An article on a list: by when it was added, under its publication (IH5). */
export function helpfulStory(article: Article): Story {
  return { key: article._id, kind: "HELPFUL", title: article.title, summary: article.summary, sourceName: article.publication, publishedAt: article.addedAt, href: helpfulHref(article._id) };
}

/**
 * What a Helpful content article says, below its headline — on the lead and
 * on its own page alike (insights-helpful-content-plan.md, IH1, IH7):
 * Hakken's summary, what it means for the reader, its facts, the original on
 * its own site in a new tab, and Ask Hakken about it. Never the article's words.
 */
export function HelpfulBody({ article }: { article: Article }) {
  const t = useTranslations("learn.helpful");
  const countClick = useCountClick();
  const tStory = useTranslations("news.story");
  const locale = useLocale();
  const { platformName } = useSystemSettings();
  const topicName = useTopicNames();
  const askHref = `/app/assistant?ask=${encodeURIComponent(tStory("askQuestion", { title: article.title }))}`;
  const year = article.publishedOn ? ` ${article.publishedOn.slice(0, 4)}` : "";

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-[16.5px] leading-relaxed text-foreground/85">{article.summary}</p>
      {article.meaning ? (
        <div className="flex max-w-2xl flex-col gap-1.5">
          <p className={LIST_HEADING}>{tStory("meaning")}</p>
          <p className="text-[14px] leading-relaxed text-foreground/85">{article.meaning}</p>
        </div>
      ) : null}
      <ArticleFacts
        facts={[
          article.publishedOn ? t("published", { day: `${formatShortDay(article.publishedOn, locale)}${year}` }) : null,
          article.words ? t("length", { words: article.words.toLocaleString(locale), minutes: readingMinutes(article.words) }) : null,
          article.language ? t("inLanguage", { language: languageName(article.language, locale) }) : null,
          topicName(article.topic),
        ]}
      />
      <p className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-secondary">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => countClick({ type: "WEB", id: article._id })}
          className={`${ABOVE_PANEL} inline-flex items-center gap-1.5 underline decoration-foreground/25 underline-offset-4 transition-colors hover:text-foreground`}
        >
          {t("readOn", { site: siteOf(article.url) })}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <Link href={askHref} className={`${ABOVE_PANEL} underline decoration-foreground/25 underline-offset-4 transition-colors hover:text-foreground`}>
          {tStory("askHakken", { platformName })}
        </Link>
      </p>
    </div>
  );
}
