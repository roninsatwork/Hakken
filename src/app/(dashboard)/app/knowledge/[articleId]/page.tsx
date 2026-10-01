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
import { LearnShell } from "../../_learn/LearnShell";

/**
 * One Knowledge article, on its own screen with the way back to the list
 * (docs/plans/active/knowledge-news-and-digest-plan.md, phase 1), in Learn
 * since 2026-10-01 with its topic lit in the side menu (R4, R9), in the
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
      <LearnShell header={<DetailHeader back={back} icon={<BookOpen className="h-6 w-6 text-brand" />} title={t("notFoundTitle")} />}>
        <HakkenEmptyState icon={BookOpen} title={t("notFoundTitle")} description={t("notFoundDescription")} />
      </LearnShell>
    );
  }

  return (
    <LearnShell
      current={article.topic ? `topic-${article.topic}` : "articles"}
      header={
        <DetailHeader
          back={back}
          icon={<BookOpen className="h-6 w-6 text-brand" />}
          title={article.title}
          description={t("updated", { date: formatDate(article.updatedAt) })}
        />
      }
    >
      {/*
        No box around it (Anthony, 2026-10-01: no cards). A long line is harder
        to read, so the words keep a column (AGENTS.md, fluid layouts). An
        article's own table — the traffic article's "who clicks" — is styled
        from here, so the renderer stays as chat uses it.
      */}
      <article className="max-w-2xl text-[14px] leading-relaxed text-foreground [&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_td]:border-t [&_td]:border-border-dim [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.12em] [&_th]:text-secondary">
        <HakkenMarkdown content={article.body} />
      </article>
    </LearnShell>
  );
}
