"use client";

import { useMutation, useQuery } from "convex/react";
import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { KnowledgeStatus } from "@/convex/knowledgeArticlesSchema";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { FieldLabel } from "@/src/ui/components/screens/SettingsCard";
import { ContentEditPage, TranslationStatus } from "../_components/ContentEditPage";
import { useContentForm } from "../_components/useContentForm";
import { TopicSelect, topicNameIn, useTopicChoices } from "../_components/TopicSelect";
import { LeadPinButton, LeadStoryNotice, LeadUntilLabel } from "../_components/LeadStory";

/** `topic` is a key in the shared topic list, or "" for none. */
type ArticleForm = { titleEn: string; bodyEn: string; status: KnowledgeStatus; topic: string };

const EMPTY: ArticleForm = { titleEn: "", bodyEn: "", status: "DRAFT", topic: "" };
const BACK_HREF = "/admin/content/knowledge";

/**
 * Writing a Knowledge article (docs/plans/active/knowledge-news-and-digest-
 * plan.md, phase 1, revised 2026-10-01): one title and one article, in
 * English, and whether readers can see it yet. Once published, the Translator
 * writes every other language; the page says how far it has got. Its topic
 * (2026-10-01, R9) is where Learn's side menu lists it. A published one can
 * lead the News front page from here (insights-helpful-content-plan.md, IH11,
 * board 12).
 */
export function ArticleEditor({ articleId }: { articleId?: Id<"knowledgeArticles"> }) {
  const t = useTranslations("admin.knowledgeArticles");
  const article = useQuery(api.knowledgeArticles.getArticle, articleId ? { articleId } : "skip");
  const createArticle = useMutation(api.knowledgeArticles.createArticle);
  const updateArticle = useMutation(api.knowledgeArticles.updateArticle);
  const topicChoices = useTopicChoices();
  const row = articleId ? article : null;
  const editor = useContentForm({
    scope: "admin-knowledge-article",
    row,
    empty: EMPTY,
    toForm: (existing): ArticleForm => ({ titleEn: existing.titleEn, bodyEn: existing.bodyEn, status: existing.status, topic: existing.topic ?? "" }),
    save: ({ topic, ...form }) => {
      const input = { ...form, topic: topic || undefined };
      return articleId ? updateArticle({ articleId, ...input }) : createArticle(input);
    },
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
      pills={row ? (
        <>
          <StatusLabel tone={row.status === "PUBLISHED" ? "success" : "neutral"}>{row.status === "PUBLISHED" ? t("published") : t("draft")}</StatusLabel>
          {topicNameIn(topicChoices, row.topic) ? <TagLabel>{topicNameIn(topicChoices, row.topic)}</TagLabel> : null}
          <LeadUntilLabel leadUntil={row.leadUntil} />
        </>
      ) : undefined}
      headerAction={row ? <LeadPinButton storyId={row._id} leadUntil={row.leadUntil} canLead={row.status === "PUBLISHED"} /> : undefined}
      notice={row ? <LeadStoryNotice here="KNOWLEDGE" storyId={row._id} /> : undefined}
      error={editor.error}
      isSaving={editor.isSaving}
      saveLabel={articleId ? t("save") : t("create")}
      onSubmit={editor.submit}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="knowledge-article-status">{t("statusLabel")}</FieldLabel>
          <Select id="knowledge-article-status" value={editor.form.status} onChange={(value) => editor.update({ status: value as KnowledgeStatus })} className="w-full">
            <option value="DRAFT">{t("draft")}</option>
            <option value="PUBLISHED">{t("published")}</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="knowledge-article-topic">{t("topicLabel")}</FieldLabel>
          <TopicSelect id="knowledge-article-topic" value={editor.form.topic} onChange={(topic) => editor.update({ topic })} noneLabel={t("noTopic")} className="w-full" />
        </div>
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
