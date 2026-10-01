"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { BookOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { formatDate } from "@/src/lib/dates";
import { LearnShell, isKnowledgeTopic } from "../_learn/LearnShell";

/**
 * Knowledge (docs/plans/active/knowledge-news-and-digest-plan.md, phase 1):
 * the articles every signed-in user can read, whatever their company (A14),
 * newest first, in their language once the Translator has it — in Learn since
 * 2026-10-01 (R4), where a topic chosen in the side menu lists its own (R9).
 * One opens on its own screen, never in a pop-up, as a site's records do.
 */
export default function KnowledgePage() {
  const t = useTranslations("knowledgeArticles.list");
  const tTopics = useTranslations("learn.menu.topics");
  const locale = useLocale();
  const router = useRouter();
  const topicParam = useSearchParams().get("topic");
  const topic = isKnowledgeTopic(topicParam) ? topicParam : undefined;
  const articles = useQuery(api.knowledgeArticles.listPublishedArticles, topic ? { language: locale, topic } : { language: locale });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const rows = articles?.filter((article) => matchesSearchTerm(search, [article.title]));
  const paged = paginateItems(rows ?? [], page);

  return (
    <LearnShell header={<PageHeader icon={<BookOpen className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} divider />}>
      <DataTable
        rows={rows === undefined ? undefined : paged.items}
        rowKey={(article) => article._id}
        onRowClick={(article) => router.push(`/app/knowledge/${article._id}`)}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <BookOpen className="h-8 w-8 text-muted/30" />, label: search ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: articles === undefined,
          onPageChange: setPage,
        }}
        columns={[
          {
            key: "title",
            header: t("columns.article"),
            cell: (article) => <span className="font-medium text-foreground">{article.title}</span>,
          },
          {
            key: "topic",
            header: t("columns.topic"),
            cell: (article) => (article.topic ? <TagLabel>{tTopics(article.topic)}</TagLabel> : null),
          },
          {
            key: "updated",
            header: t("columns.updated"),
            cell: (article) => <span className="text-secondary">{formatDate(article.updatedAt)}</span>,
          },
        ]}
      />
    </LearnShell>
  );
}
