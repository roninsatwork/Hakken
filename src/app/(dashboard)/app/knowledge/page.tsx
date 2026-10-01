"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { BookOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { formatDate } from "@/src/lib/dates";

/**
 * Knowledge (docs/plans/active/knowledge-news-and-digest-plan.md, phase 1):
 * the articles every signed-in user can read, whatever their company (A14),
 * newest first, in their language once the Translator has it. One opens on
 * its own screen, never in a pop-up, as a site's records do.
 */
export default function KnowledgePage() {
  const t = useTranslations("knowledgeArticles.list");
  const locale = useLocale();
  const router = useRouter();
  const articles = useQuery(api.knowledgeArticles.listPublishedArticles, { language: locale });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const rows = articles?.filter((article) => matchesSearchTerm(search, [article.title]));
  const paged = paginateItems(rows ?? [], page);

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader icon={<BookOpen className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} divider />

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
              key: "updated",
              header: t("columns.updated"),
              cell: (article) => <span className="text-secondary">{formatDate(article.updatedAt)}</span>,
            },
          ]}
        />
      </div>
    </>
  );
}
