"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { BookOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Header from "@/src/ui/components/layout/Header";
import { HakkenMarkdown } from "@/src/ui/components/chat/HakkenMarkdown";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { formatDate } from "@/src/lib/dates";

/**
 * One Knowledge article, on its own screen with the way back to the list
 * (docs/plans/active/knowledge-news-and-digest-plan.md, phase 1), in the
 * reader's language once the Translator has it, the English until then. A
 * draft, or an article taken down, reads as not here.
 */
export default function KnowledgeArticlePage() {
  const t = useTranslations("knowledgeArticles.article");
  const locale = useLocale();
  const params = useParams();
  const article = useQuery(api.knowledgeArticles.getPublishedArticle, { articleId: params.articleId as Id<"knowledgeArticles">, language: locale });
  const back = { label: t("back"), href: "/app/knowledge" };

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
      <>
        <Header />
        <div className="flex flex-col gap-6 pb-8">
          <DetailHeader back={back} icon={<BookOpen className="h-6 w-6 text-brand" />} title={t("notFoundTitle")} />
          <HakkenEmptyState icon={BookOpen} title={t("notFoundTitle")} description={t("notFoundDescription")} />
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <DetailHeader
          back={back}
          icon={<BookOpen className="h-6 w-6 text-brand" />}
          title={article.title}
          description={t("updated", { date: formatDate(article.updatedAt) })}
        />
        <article className="rounded-2xl border border-border-dim bg-card/40 px-6 py-6">
          {/*
            A long line is harder to read: the words keep a column, the card does
            not (AGENTS.md, fluid layouts). An article's own table — the traffic
            article's "who clicks" — is styled from here, so the renderer stays
            as chat uses it.
          */}
          <div className="max-w-2xl text-[14px] leading-relaxed text-foreground [&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_td]:border-t [&_td]:border-border-dim [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.12em] [&_th]:text-secondary">
            <HakkenMarkdown content={article.body} />
          </div>
        </article>
      </div>
    </>
  );
}
