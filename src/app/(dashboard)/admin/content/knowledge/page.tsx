"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BookOpen, Edit2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import useDebounce from "@/src/hooks/useDebounce";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { formatDate } from "@/src/lib/dates";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { TranslationStatus } from "../_components/ContentEditPage";
import { LeadPinRowButton, LeadStoryNotice, LeadUntilLabel } from "../_components/LeadStory";
import { useContentDelete } from "../_components/useContentDelete";

type Article = FunctionReturnType<typeof api.knowledgeArticles.listArticlesPage>["page"][number];

const BASE = "/admin/content/knowledge";

/**
 * Admin → Content → Knowledge (docs/plans/active/knowledge-news-and-digest-
 * plan.md, phase 1, A3): every article, drafts too. New and an article each
 * open on their own page; what is published is what every signed-in user
 * reads under Knowledge, in their language, and what Ask Hakken reads.
 * Searched and paged on the server; a published article can be pinned to lead
 * the News front page (insights-helpful-content-plan.md, IH11, IH21, board 11).
 */
export default function KnowledgeArticlesAdminPage() {
  const t = useTranslations("admin.knowledgeArticles");
  const router = useRouter();
  const deleteArticle = useMutation(api.knowledgeArticles.deleteArticle);
  const remover = useContentDelete({
    scope: "admin-knowledge-articles",
    remove: deleteArticle,
    argsFor: (article: Article) => ({ articleId: article._id }),
    deleteFailed: t("errors.deleteFailed"),
  });

  const [search, setSearch] = useState("");
  const searched = useDebounce(search, 300).trim();
  // The server searches and pages (IH21); a new search starts at page one.
  const pages = useServerPagedTable(api.knowledgeArticles.listArticlesPage, searched ? { search: searched } : {}, TABLE_PAGE_SIZE);
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

      <LeadStoryNotice here="KNOWLEDGE" />

      <DataTable
        rows={pages.isLoading ? undefined : pages.rows}
        rowKey={(article) => article._id}
        onRowClick={open}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        empty={{ icon: <BookOpen className="h-8 w-8 text-muted/30" />, label: search ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: pages.page,
          totalPages: pages.totalPages,
          totalCount: pages.loadedCount,
          pageSize: pages.pageSize,
          isLoading: pages.isBusy,
          onPageChange: pages.goToPage,
        }}
        columns={[
          {
            key: "title",
            header: t("columns.article"),
            cell: (article) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{article.titleEn}</span>
                <LeadUntilLabel leadUntil={article.leadUntil} className="mt-1" />
              </span>
            ),
          },
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
                <LeadPinRowButton storyId={article._id} leadUntil={article.leadUntil} canLead={article.status === "PUBLISHED"} />
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
