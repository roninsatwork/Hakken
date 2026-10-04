"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BookOpen, Edit2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatDate } from "@/src/lib/dates";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { TranslationStatus } from "../_components/ContentEditPage";
import { useContentDelete } from "../_components/useContentDelete";

type Article = FunctionReturnType<typeof api.knowledgeArticles.listArticles>[number];

const BASE = "/admin/content/knowledge";

/**
 * Admin → Content → Knowledge (docs/plans/active/knowledge-news-and-digest-
 * plan.md, phase 1, A3): every article, drafts too. New and an article each
 * open on their own page; what is published is what every signed-in user
 * reads under Knowledge, in their language, and what Ask Hakken reads.
 */
export default function KnowledgeArticlesAdminPage() {
  const t = useTranslations("admin.knowledgeArticles");
  const router = useRouter();
  const articles = useQuery(api.knowledgeArticles.listArticles, {});
  const deleteArticle = useMutation(api.knowledgeArticles.deleteArticle);
  const remover = useContentDelete({
    scope: "admin-knowledge-articles",
    remove: deleteArticle,
    argsFor: (article: Article) => ({ articleId: article._id }),
    deleteFailed: t("errors.deleteFailed"),
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const matching = articles?.filter((article) => matchesSearchTerm(search, [article.titleEn]));
  const paged = paginateItems(matching ?? [], page);
  const open = (article: Article) => router.push(`${BASE}/${article._id}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<BookOpen className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <PagePrimaryAction variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => router.push(`${BASE}/new`)}>
            {t("create")}
          </PagePrimaryAction>
        }
      />

      <DataTable
        rows={articles === undefined ? undefined : paged.items}
        rowKey={(article) => article._id}
        onRowClick={open}
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
          { key: "title", header: t("columns.article"), cell: (article) => <span className="text-[13px] font-medium text-foreground">{article.titleEn}</span> },
          {
            key: "status",
            header: t("columns.status"),
            cell: (article) => (
              <StatusLabel tone={article.status === "PUBLISHED" ? "success" : "neutral"}>
                {article.status === "PUBLISHED" ? t("published") : t("draft")}
              </StatusLabel>
            ),
          },
          { key: "translations", header: t("columns.translations"), cell: (article) => <TranslationStatus progress={article.translations} compact /> },
          { key: "updated", header: t("columns.updated"), cell: (article) => <span className="text-[12px] text-secondary">{formatDate(article.updatedAt)}</span> },
          {
            key: "actions",
            header: t("columns.actions"),
            align: "right",
            cell: (article) => (
              <RowActions>
                <RowIconButton label={t("edit")} navigates onClick={() => open(article)}>
                  <Edit2 className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton label={t("delete")} tone="danger" onClick={() => remover.askDelete(article)}>
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      <ContentDeleteDialog
        isOpen={remover.deleting !== null}
        title={t("deleteTitle")}
        warning={t("deleteWarning")}
        error={remover.error}
        isSubmitting={remover.isBusy}
        onClose={remover.closeDelete}
        onConfirm={remover.confirmDelete}
      >
        {t.rich("deleteConfirm", {
          title: remover.deleting?.titleEn ?? "",
          highlight: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
        })}
      </ContentDeleteDialog>
    </div>
  );
}
