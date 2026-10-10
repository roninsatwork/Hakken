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
import { LeadPinButton, LeadStoryNotice, LeadUntilLabel } from "../_components/LeadStory";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { ContentEditPage, TranslationStatus } from "../_components/ContentEditPage";
import { formatContentDay } from "../_components/contentDays";
import { useContentDelete } from "../_components/useContentDelete";
import { useContentForm } from "../_components/useContentForm";
import { TopicSelect, topicNameIn, useTopicChoices } from "../_components/TopicSelect";
import { languageName } from "@/src/lib/helpfulContentFormat";

type LibraryForm = {
  url: string;
  title: string;
  publication: string;
  author: string;
  publishedOn: string;
  updatedOn: string;
  description: string;
  /** A key in the shared topic list, or "" for none. */
  topic: string;
  status: LibraryStatus;
  language: string;
  body: string;
  /** When Firecrawl read the words in the form; null for words pasted by hand. */
  readAt: number | null;
  /** What readers see (insights-helpful-content-plan.md, IH1, IH2): Hakken's summary, and what it means for them. */
  summaryEn: string;
  meaningEn: string;
};

type ReadResult = FunctionReturnType<typeof api.libraryArticleActions.readPage>;
type WriteResult = FunctionReturnType<typeof api.libraryArticleWriter.writeForReaders>;

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
  summaryEn: "",
  meaningEn: "",
};
/** Knowledge's one list (content-people-knowledge-plan.md, phase 3): the web's articles are listed and opened there. */
const BACK_HREF = "/admin/content/knowledge";
const WEB_HREF = `${BACK_HREF}/web`;

/**
 * Add from a link, or a web article's own page, in Knowledge
 * (docs/plans/active/content-people-knowledge-plan.md, board 6; moved from
 * Helpful content, content-library-plan.md, boards 2 and 3): its address,
 * read through Firecrawl on a press (L3), the details the page gave — a blank
 * author says "Not on the page" (L4) — who reads it (L5), and its words. A
 * page that cannot be read says why, and the words can be pasted (L6). On an
 * article's page, Read again asks first and fills the form; nothing is stored
 * until Save (L9). Delete asks yes or no and returns to the list (L8).
 */
export function LibraryArticleEditor({ articleId }: { articleId?: Id<"libraryArticles"> }) {
  const t = useTranslations("admin.libraryArticles");
  const tCommon = useTranslations("common");
  const topicChoices = useTopicChoices();
  const locale = useLocale();
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const article = useQuery(api.libraryArticles.getArticle, articleId ? { articleId } : "skip");
  const createArticle = useMutation(api.libraryArticles.createArticle);
  const updateArticle = useMutation(api.libraryArticles.updateArticle);
  const deleteArticle = useMutation(api.libraryArticles.deleteArticle);
  const readPage = useAction(api.libraryArticleActions.readPage);
  const writeForReaders = useAction(api.libraryArticleWriter.writeForReaders);
  const reader = useAdminAction({ scope: "admin-library-read" });
  const writer = useAdminAction({ scope: "admin-library-write" });
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
      summaryEn: existing.summaryEn ?? "",
      meaningEn: existing.meaningEn ?? "",
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
  const [written, setWritten] = useState<WriteResult | { status: "error"; message: string } | null>(null);
  const [askingReadAgain, setAskingReadAgain] = useState(false);
  const form = editor.form;
  const reading = reader.isBusy();

  /** Hakken writes what readers see from the words in the form (IH2); nothing is stored until Save. */
  const write = async (page: { title: string; publication: string; body: string }) => {
    const outcome = await writer.run(() => writeForReaders(page), { suppressErrorToast: true, fallbackMessage: t("errors.writeFailed") });
    if (!outcome.ok) {
      if (outcome.message) setWritten({ status: "error", message: outcome.message });
      return;
    }
    setWritten(outcome.data);
    if (outcome.data.status === "written") editor.update({ summaryEn: outcome.data.summary, meaningEn: outcome.data.meaning });
  };

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
      // A new article's summary is written straight after its page is read;
      // a saved one keeps its own until Write again.
      if (!articleId) void write({ title: answer.title, publication: answer.publication, body: answer.body });
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
            {topicNameIn(topicChoices, row.topic) ? <TagLabel>{topicNameIn(topicChoices, row.topic)}</TagLabel> : null}
            <TagLabel>{t("words", { count: row.words })}</TagLabel>
            {row.language ? <TagLabel>{languageName(row.language, locale)}</TagLabel> : null}
            <LeadUntilLabel leadUntil={row.leadUntil} />
          </>
        ) : undefined}
        notice={row ? <LeadStoryNotice here="HELPFUL" storyId={row._id} /> : undefined}
        headerAction={row ? (
          <div className="flex items-center gap-2">
            <LeadPinButton storyId={row._id} leadUntil={row.leadUntil} canLead={row.shown} />
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
              link: (chunks) => <Link href={`${WEB_HREF}/${result.articleId}`} className="text-foreground underline">{chunks}</Link>,
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
                <TopicSelect id="library-article-topic" value={form.topic} onChange={(topic) => editor.update({ topic })} noneLabel={t("noTopic")} className="w-full" />
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
            <div data-part="readers-see" className="flex flex-col gap-4 border-t border-border-dim pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <FieldLabel>{t("readersLabel")}</FieldLabel>
                  <FieldHint>{t("readersHint", { platformName })}</FieldHint>
                </div>
                <Button
                  variant="quiet"
                  disabled={writer.isBusy() || !form.body.trim()}
                  onClick={() => void write({ title: form.title, publication: form.publication, body: form.body })}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  {writer.isBusy() ? t("writing") : t("writeAgain")}
                </Button>
              </div>
              {written?.status === "failed" ? <Notice tone="warning">{t(`writeFailed.${written.why}`, { platformName })}</Notice> : null}
              {written?.status === "error" ? <Notice tone="warning">{written.message}</Notice> : null}
              <TextAreaField
                label={t("summaryLabel")}
                hint={t("summaryHint")}
                value={form.summaryEn}
                onChange={(event) => editor.update({ summaryEn: event.target.value })}
                className="min-h-[96px] resize-y"
              />
              <TextAreaField
                label={t("meaningLabel")}
                hint={t("meaningHint")}
                value={form.meaningEn}
                onChange={(event) => editor.update({ meaningEn: event.target.value })}
                className="min-h-[96px] resize-y"
              />
              {row ? <TranslationStatus progress={row.translations} /> : null}
            </div>
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
