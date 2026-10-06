"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ExternalLink, Library, RefreshCw, ScanText, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import type { Id } from "@/convex/_generated/dataModel";
import type { LibraryStatus } from "@/convex/libraryArticlesSchema";
import { KNOWLEDGE_TOPICS, type KnowledgeTopic } from "@/convex/utils/learnLists";
import { LIBRARY_MAX_BODY_LENGTH } from "@/convex/utils/libraryPage";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";
import { Button } from "@/src/ui/components/screens/Button";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { Notice } from "@/src/ui/components/screens/Notice";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldHint, FieldLabel } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { RowIconButton } from "@/src/ui/components/screens/Table";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { ContentEditPage } from "../_components/ContentEditPage";
import { formatContentDay } from "../_components/contentDays";
import { useContentDelete } from "../_components/useContentDelete";
import { useContentForm } from "../_components/useContentForm";
import { languageName } from "./libraryFormat";

type LibraryForm = {
  url: string;
  title: string;
  publication: string;
  author: string;
  publishedOn: string;
  updatedOn: string;
  description: string;
  topic: KnowledgeTopic | "";
  status: LibraryStatus;
  language: string;
  body: string;
  /** When Firecrawl read the words in the form; null for words pasted by hand. */
  readAt: number | null;
};

type ReadResult = FunctionReturnType<typeof api.libraryArticleActions.readPage>;

const EMPTY: LibraryForm = {
  url: "",
  title: "",
  publication: "",
  author: "",
  publishedOn: "",
  updatedOn: "",
  description: "",
  topic: "",
  status: "IN_KNOWLEDGE",
  language: "",
  body: "",
  readAt: null,
};
const BACK_HREF = "/admin/content/library";

/**
 * Adding a Library article, or one article's own page
 * (docs/plans/active/content-library-plan.md, boards 2 and 3): its address,
 * read through Firecrawl on a press (L3), the details the page gave — a blank
 * author says "Not on the page" (L4) — who reads it (L5), and its words. A
 * page that cannot be read says why, and the words can be pasted (L6). On an
 * article's page, Read again asks first and fills the form; nothing is stored
 * until Save (L9). Delete asks yes or no and returns to the list (L8).
 */
export function LibraryArticleEditor({ articleId }: { articleId?: Id<"libraryArticles"> }) {
  const t = useTranslations("admin.libraryArticles");
  const tCommon = useTranslations("common");
  const tTopics = useTranslations("learn.menu.topics");
  const locale = useLocale();
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const article = useQuery(api.libraryArticles.getArticle, articleId ? { articleId } : "skip");
  const createArticle = useMutation(api.libraryArticles.createArticle);
  const updateArticle = useMutation(api.libraryArticles.updateArticle);
  const deleteArticle = useMutation(api.libraryArticles.deleteArticle);
  const readPage = useAction(api.libraryArticleActions.readPage);
  const reader = useAdminAction({ scope: "admin-library-read" });
  const row = articleId ? article : null;

  const editor = useContentForm({
    scope: "admin-library-article",
    row,
    empty: EMPTY,
    toForm: (existing): LibraryForm => ({
      url: existing.url,
      title: existing.title,
      publication: existing.publication,
      author: existing.author ?? "",
      publishedOn: existing.publishedOn ?? "",
      updatedOn: existing.updatedOn ?? "",
      description: existing.description ?? "",
      topic: existing.topic ?? "",
      status: existing.status,
      language: existing.language ?? "",
      body: existing.body,
      readAt: existing.readAt,
    }),
    save: ({ topic, language, readAt, ...form }) => {
      const input = { ...form, topic: topic || undefined, language: language || undefined, readAt: readAt ?? undefined };
      return articleId ? updateArticle({ articleId, ...input }) : createArticle(input);
    },
    backHref: BACK_HREF,
    saveFailed: t("errors.saveFailed"),
  });
  const remover = useContentDelete({
    scope: "admin-library-article-delete",
    remove: deleteArticle,
    argsFor: (id: Id<"libraryArticles">) => ({ articleId: id }),
    deleteFailed: t("errors.deleteFailed"),
    onDeleted: () => router.push(BACK_HREF),
  });

  const [result, setResult] = useState<ReadResult | { status: "error"; message: string } | null>(null);
  const [askingReadAgain, setAskingReadAgain] = useState(false);
  const form = editor.form;
  const reading = reader.isBusy();

  const read = async () => {
    setAskingReadAgain(false);
    const outcome = await reader.run(() => readPage({ url: form.url, ...(articleId ? { articleId } : {}) }), {
      suppressErrorToast: true,
      fallbackMessage: t("errors.readFailed"),
    });
    if (!outcome.ok) {
      if (outcome.message) setResult({ status: "error", message: outcome.message });
      return;
    }
    const answer = outcome.data;
    if (answer.status === "read") {
      editor.update({
        url: answer.url,
        title: answer.title,
        publication: answer.publication,
        author: answer.author ?? "",
        publishedOn: answer.publishedOn ?? "",
        updatedOn: answer.updatedOn ?? "",
        description: answer.description ?? "",
        language: answer.language ?? "",
        body: answer.body,
        readAt: answer.readAt,
      });
    } else if (answer.status === "unread" && answer.publication && !form.publication) {
      editor.update({ publication: answer.publication });
    }
    setResult(answer);
  };

  // A new article shows its fields once its page has been tried; a saved one always does.
  const showFields = Boolean(articleId) || result?.status === "read" || result?.status === "unread";
  const justRead = result?.status === "read" ? result : null;

  const byline = row
    ? [
        row.publication,
        row.publishedOn ? t("byline.published", { date: formatContentDay(row.publishedOn) }) : null,
        row.readAt ? t("byline.readAt", { date: formatDateTime(row.readAt, { options: { dateStyle: "short", timeStyle: "short" } }) }) : t("byline.pasted"),
      ].filter(Boolean).join(" · ")
    : t("createSubtitle", { platformName });

  const readButton = articleId ? null : result === null ? (
    <Button
      variant="brand"
      data-part="primary-action"
      disabled={reading || !form.url.trim()}
      onClick={() => void read()}
      className="inline-flex h-[46px] shrink-0 items-center gap-2 whitespace-nowrap"
    >
      <ScanText className="h-4 w-4" aria-hidden="true" />
      {reading ? t("reading") : t("read")}
    </Button>
  ) : (
    <Button variant="quiet" disabled={reading || !form.url.trim()} onClick={() => void read()} className="inline-flex h-[46px] shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2">
      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      {reading ? t("reading") : t("readAgain")}
    </Button>
  );

  // Adding, the address comes first: it is what the page is read from. On a
  // saved article it sits under who reads it and its topic (board 3).
  const address = (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field
          label={t("addressLabel")}
          type="url"
          required
          wrapperClassName="flex-1"
          placeholder="https://…"
          value={form.url}
          onChange={(event) => editor.update({ url: event.target.value })}
        />
        {readButton}
      </div>
      <FieldHint>{articleId ? t("addressHintSaved") : t("addressHint")}</FieldHint>
    </div>
  );

  return (
    <>
      <ContentEditPage
        state={row === undefined ? "loading" : articleId && row === null ? "missing" : "ready"}
        back={{ label: t("back"), href: BACK_HREF }}
        icon={<Library className="h-6 w-6 text-brand" />}
        title={row ? row.title : t("createTitle")}
        description={byline}
        pills={row ? (
          <>
            {row.status === "IN_KNOWLEDGE"
              ? <StatusLabel tone="success">{t("inKnowledge", { platformName })}</StatusLabel>
              : <StatusLabel tone="neutral">{t("draftLabel", { platformName })}</StatusLabel>}
            {row.topic ? <TagLabel>{tTopics(row.topic)}</TagLabel> : null}
            <TagLabel>{t("words", { count: row.words })}</TagLabel>
            {row.language ? <TagLabel>{languageName(row.language, locale)}</TagLabel> : null}
          </>
        ) : undefined}
        headerAction={row ? (
          <div className="flex items-center gap-2">
            <Button variant="quiet" disabled={reading} onClick={() => setAskingReadAgain(true)} className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {reading ? t("reading") : t("readAgain")}
            </Button>
            <Button variant="quiet" onClick={() => window.open(row.url, "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              {t("open")}
            </Button>
            <RowIconButton label={t("delete")} tone="danger" onClick={() => remover.askDelete(row._id)}>
              <Trash2 className="h-4 w-4" />
            </RowIconButton>
          </div>
        ) : undefined}
        error={editor.error}
        isSaving={editor.isSaving}
        saveLabel={articleId ? t("save") : t("add")}
        saveDisabled={!showFields}
        onSubmit={editor.submit}
      >
        {articleId ? null : address}

        {justRead ? (
          <Notice>
            {justRead.language
              ? t("readNoticeLanguage", { words: justRead.words, language: languageName(justRead.language, locale) })
              : t("readNotice", { words: justRead.words })}
            {justRead.cut ? ` ${t("readCut", { limit: LIBRARY_MAX_BODY_LENGTH.toLocaleString() })}` : null}
          </Notice>
        ) : null}
        {result?.status === "unread" ? (
          <Notice tone="warning">{t(`unread.${result.why}`, { status: result.httpStatus ?? "", words: result.words ?? 0, platformName })}</Notice>
        ) : null}
        {result?.status === "duplicate" ? (
          <Notice tone="warning">
            {t.rich("duplicate", {
              title: result.title,
              link: (chunks) => <Link href={`${BACK_HREF}/${result.articleId}`} className="text-foreground underline">{chunks}</Link>,
            })}
          </Notice>
        ) : null}
        {result?.status === "error" ? <Notice tone="warning">{result.message}</Notice> : null}

        {showFields ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="library-article-status">{t("whoLabel")}</FieldLabel>
                <Select id="library-article-status" value={form.status} onChange={(value) => editor.update({ status: value as LibraryStatus })} className="w-full">
                  <option value="IN_KNOWLEDGE">{t("whoAsk", { platformName })}</option>
                  <option value="DRAFT">{t("whoDraft")}</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="library-article-topic">{t("topicLabel")}</FieldLabel>
                <Select id="library-article-topic" value={form.topic} onChange={(value) => editor.update({ topic: value as KnowledgeTopic | "" })} className="w-full">
                  <option value="">{t("noTopic")}</option>
                  {KNOWLEDGE_TOPICS.map((topic) => (
                    <option key={topic} value={topic}>{tTopics(topic)}</option>
                  ))}
                </Select>
              </div>
            </div>
            {articleId ? address : null}
            <Field label={t("titleLabel")} required value={form.title} onChange={(event) => editor.update({ title: event.target.value })} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={t("publicationLabel")}
                required
                placeholder={t("publicationPlaceholder")}
                value={form.publication}
                onChange={(event) => editor.update({ publication: event.target.value })}
              />
              <Field
                label={t("authorLabel")}
                placeholder={t("authorPlaceholder")}
                value={form.author}
                onChange={(event) => editor.update({ author: event.target.value })}
                hint={justRead && !form.author.trim() ? <StatusLabel tone="warning">{t("notOnPage")}</StatusLabel> : undefined}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("publishedLabel")} type="date" value={form.publishedOn} onChange={(event) => editor.update({ publishedOn: event.target.value })} />
              <Field
                label={t("updatedLabel")}
                type="date"
                hint={t("updatedHint")}
                value={form.updatedOn}
                onChange={(event) => editor.update({ updatedOn: event.target.value })}
              />
            </div>
            <Field
              label={t("descriptionLabel")}
              placeholder={t("descriptionPlaceholder")}
              hint={t("descriptionHint")}
              value={form.description}
              onChange={(event) => editor.update({ description: event.target.value })}
            />
            <TextAreaField
              label={t("bodyLabel")}
              placeholder={t("bodyPlaceholder")}
              hint={articleId ? t("bodyHintSaved", { platformName }) : t("bodyHint")}
              value={form.body}
              onChange={(event) => editor.update({ body: event.target.value })}
              className="min-h-[420px] resize-y font-mono text-[13px]"
            />
          </>
        ) : null}
      </ContentEditPage>

      <ConfirmationModal
        isOpen={askingReadAgain}
        onClose={() => setAskingReadAgain(false)}
        title={t("readAgainTitle")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("readAgain")}
        isSubmitting={reading}
        onConfirm={() => void read()}
      >
        <p>{t("readAgainConfirm")}</p>
      </ConfirmationModal>

      <ContentDeleteDialog
        isOpen={remover.deleting !== null}
        title={t("deleteTitle")}
        warning={t("deleteWarning", { platformName })}
        error={remover.error}
        isSubmitting={remover.isBusy}
        onClose={remover.closeDelete}
        onConfirm={remover.confirmDelete}
      >
        {t.rich("deleteConfirm", {
          title: row?.title ?? "",
          highlight: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
        })}
      </ContentDeleteDialog>
    </>
  );
}
