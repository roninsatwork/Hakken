"use client";

import { useMutation, useQuery } from "convex/react";
import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { KnowledgeStatus } from "@/convex/knowledgeArticlesSchema";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldLabel } from "@/src/ui/components/screens/SettingsCard";
import { ContentEditPage, TranslationStatus } from "../_components/ContentEditPage";
import { useContentForm } from "../_components/useContentForm";

type ArticleForm = { titleEn: string; bodyEn: string; status: KnowledgeStatus };

const EMPTY: ArticleForm = { titleEn: "", bodyEn: "", status: "DRAFT" };
const BACK_HREF = "/admin/content/knowledge";

/**
 * Writing a Knowledge article (docs/plans/active/knowledge-news-and-digest-
 * plan.md, phase 1, revised 2026-10-01): one title and one article, in
 * English, and whether readers can see it yet. Once published, the Translator
 * writes every other language; the page says how far it has got.
 */
export function ArticleEditor({ articleId }: { articleId?: Id<"knowledgeArticles"> }) {
  const t = useTranslations("admin.knowledgeArticles");
  const article = useQuery(api.knowledgeArticles.getArticle, articleId ? { articleId } : "skip");
  const createArticle = useMutation(api.knowledgeArticles.createArticle);
  const updateArticle = useMutation(api.knowledgeArticles.updateArticle);
  const row = articleId ? article : null;
  const editor = useContentForm({
    scope: "admin-knowledge-article",
    row,
    empty: EMPTY,
    toForm: (existing): ArticleForm => ({ titleEn: existing.titleEn, bodyEn: existing.bodyEn, status: existing.status }),
    save: (form) => (articleId ? updateArticle({ articleId, ...form }) : createArticle(form)),
    backHref: BACK_HREF,
    saveFailed: t("errors.saveFailed"),
  });

  return (
    <ContentEditPage
      state={row === undefined ? "loading" : articleId && row === null ? "missing" : "ready"}
      back={{ label: t("back"), href: BACK_HREF }}
      icon={<BookOpen className="h-6 w-6 text-brand" />}
      title={row ? row.titleEn : t("createTitle")}
      description={t("editorSubtitle")}
      error={editor.error}
      isSaving={editor.isSaving}
      saveLabel={articleId ? t("save") : t("create")}
      onSubmit={editor.submit}
    >
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="knowledge-article-status">{t("statusLabel")}</FieldLabel>
        <Select id="knowledge-article-status" value={editor.form.status} onChange={(value) => editor.update({ status: value as KnowledgeStatus })} className="w-full sm:w-64">
          <option value="DRAFT">{t("draft")}</option>
          <option value="PUBLISHED">{t("published")}</option>
        </Select>
      </div>
      <Field label={t("titleLabel")} required value={editor.form.titleEn} onChange={(event) => editor.update({ titleEn: event.target.value })} />
      <TextAreaField
        label={t("bodyLabel")}
        hint={t("bodyHint")}
        value={editor.form.bodyEn}
        onChange={(event) => editor.update({ bodyEn: event.target.value })}
        className="min-h-[420px] resize-y font-mono text-[13px]"
      />
      {row ? <TranslationStatus progress={row.translations} /> : null}
    </ContentEditPage>
  );
}
