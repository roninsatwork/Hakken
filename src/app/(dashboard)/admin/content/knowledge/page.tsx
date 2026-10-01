"use client";

import { useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BookOpen, Edit2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate } from "@/src/lib/dates";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { EMPTY_ARTICLE, type ArticleForm } from "./articleForm";

type Article = FunctionReturnType<typeof api.knowledgeArticles.listArticles>[number];

const loadDialogs = () => import("./KnowledgeArticleDialogs");
const KnowledgeArticleDialogs = dynamic(() => loadDialogs().then((module) => module.KnowledgeArticleDialogs));

/**
 * Admin → Content → Knowledge (docs/plans/active/knowledge-news-and-digest-
 * plan.md, phase 1, A3): every article, drafts too, with add, edit and delete.
 * What is published here is what every signed-in user reads under Knowledge.
 */
export default function KnowledgeArticlesAdminPage() {
  const t = useTranslations("admin.knowledgeArticles");
  const articles = useQuery(api.knowledgeArticles.listArticles, {});
  const createArticle = useMutation(api.knowledgeArticles.createArticle);
  const updateArticle = useMutation(api.knowledgeArticles.updateArticle);
  const deleteArticle = useMutation(api.knowledgeArticles.deleteArticle);
  const action = useAdminAction({ scope: "admin-knowledge-articles" });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogsRequested, setDialogsRequested] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [deleting, setDeleting] = useState<Article | null>(null);
  const [form, setForm] = useState<ArticleForm>(EMPTY_ARTICLE);
  const [submitError, setSubmitError] = useState("");

  const matching = articles?.filter((article) => matchesSearchTerm(search, [article.titleEn, article.titleIt]));
  const paged = paginateItems(matching ?? [], page);

  const prepareDialogs = () => {
    setDialogsRequested(true);
    void loadDialogs();
  };

  const openEditor = (article: Article | null) => {
    prepareDialogs();
    setEditing(article);
    setForm(article
      ? { titleEn: article.titleEn, bodyEn: article.bodyEn, titleIt: article.titleIt, bodyIt: article.bodyIt, status: article.status }
      : EMPTY_ARTICLE);
    setSubmitError("");
    setEditorOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await action.run(
      () => (editing ? updateArticle({ articleId: editing._id, ...form }) : createArticle(form)),
      { suppressErrorToast: true, fallbackMessage: t("errors.saveFailed") },
    );
    if (outcome.ok) setEditorOpen(false);
    else if (outcome.message) setSubmitError(outcome.message);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const outcome = await action.run(() => deleteArticle({ articleId: deleting._id }), {
      suppressErrorToast: true,
      fallbackMessage: t("errors.deleteFailed"),
    });
    if (outcome.ok) setDeleting(null);
    else if (outcome.message) setSubmitError(outcome.message);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<BookOpen className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <PagePrimaryAction variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => openEditor(null)}>
            {t("create")}
          </PagePrimaryAction>
        }
      />

      <DataTable
        rows={articles === undefined ? undefined : paged.items}
        rowKey={(article) => article._id}
        minWidthClassName="min-w-[760px]"
        onRowClick={(article) => openEditor(article)}
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
            cell: (article) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{article.titleEn}</span>
                <span className="text-[12px] text-secondary">{article.titleIt || t("noItalian")}</span>
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
          {
            key: "updated",
            header: t("columns.updated"),
            cell: (article) => <span className="text-[12px] text-secondary">{formatDate(article.updatedAt)}</span>,
          },
          {
            key: "actions",
            header: t("columns.actions"),
            align: "right",
            cell: (article) => (
              <RowActions>
                <RowIconButton label={t("edit")} onClick={() => openEditor(article)}>
                  <Edit2 className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton
                  label={t("delete")}
                  tone="danger"
                  onClick={() => {
                    prepareDialogs();
                    setSubmitError("");
                    setDeleting(article);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      {dialogsRequested ? (
        <KnowledgeArticleDialogs
          editorOpen={editorOpen}
          editing={editing !== null}
          form={form}
          setForm={setForm}
          submitError={submitError}
          isSubmitting={action.isBusy()}
          onEditorClose={() => setEditorOpen(false)}
          onSubmit={save}
          deletingTitle={deleting?.titleEn ?? null}
          onDeleteClose={() => {
            setDeleting(null);
            setSubmitError("");
          }}
          onDeleteConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}
