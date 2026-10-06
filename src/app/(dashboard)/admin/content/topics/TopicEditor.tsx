"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Tags, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Field } from "@/src/ui/components/screens/Field";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { RowIconButton } from "@/src/ui/components/screens/Table";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { ContentEditPage, TranslationStatus } from "../_components/ContentEditPage";
import { useContentDelete } from "../_components/useContentDelete";
import { useContentForm } from "../_components/useContentForm";

type TopicForm = { nameEn: string; order: string };

const EMPTY: TopicForm = { nameEn: "", order: "" };
const BACK_HREF = "/admin/content/topics";

/**
 * Adding a topic, or one topic's own page (docs/plans/active/insights-helpful-
 * content-plan.md, IH20, board 17): its English name — the Translator writes
 * the rest — and its place in Insights' side menu and filters, with what uses
 * it in the header and Delete beside it, asked yes or no first.
 */
export function TopicEditor({ topicId }: { topicId?: Id<"topics"> }) {
  const t = useTranslations("admin.topics");
  const router = useRouter();
  const topic = useQuery(api.topics.getTopic, topicId ? { topicId } : "skip");
  const createTopic = useMutation(api.topics.createTopic);
  const updateTopic = useMutation(api.topics.updateTopic);
  const deleteTopic = useMutation(api.topics.deleteTopic);
  const row = topicId ? topic : null;

  const editor = useContentForm({
    scope: "admin-topic",
    row,
    empty: EMPTY,
    toForm: (existing): TopicForm => ({ nameEn: existing.nameEn, order: String(existing.order) }),
    save: (form) => {
      const order = Number(form.order);
      const placed = form.order.trim() && Number.isFinite(order) ? order : undefined;
      if (topicId) return updateTopic({ topicId, nameEn: form.nameEn, order: placed ?? row?.order ?? 1 });
      return createTopic({ nameEn: form.nameEn, ...(placed === undefined ? {} : { order: placed }) });
    },
    backHref: BACK_HREF,
    saveFailed: t("errors.saveFailed"),
  });
  const remover = useContentDelete({
    scope: "admin-topic-delete",
    remove: deleteTopic,
    argsFor: (id: Id<"topics">) => ({ topicId: id }),
    deleteFailed: t("errors.deleteFailed"),
    onDeleted: () => router.push(BACK_HREF),
  });

  return (
    <>
      <ContentEditPage
        state={row === undefined ? "loading" : topicId && row === null ? "missing" : "ready"}
        back={{ label: t("back"), href: BACK_HREF }}
        icon={<Tags className="h-6 w-6 text-brand" />}
        title={row ? row.nameEn : t("createTitle")}
        description={t("editorSubtitle")}
        pills={row ? (
          <>
            <TagLabel>{t("uses.knowledge", { count: row.uses.knowledge })}</TagLabel>
            <TagLabel>{t("uses.helpful", { count: row.uses.helpful })}</TagLabel>
            <TagLabel>{t("uses.people", { count: row.uses.people })}</TagLabel>
          </>
        ) : undefined}
        headerAction={row ? (
          <RowIconButton label={t("delete")} tone="danger" onClick={() => remover.askDelete(row._id)}>
            <Trash2 className="h-4 w-4" />
          </RowIconButton>
        ) : undefined}
        error={editor.error}
        isSaving={editor.isSaving}
        saveLabel={topicId ? t("save") : t("create")}
        onSubmit={editor.submit}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("nameLabel")} required value={editor.form.nameEn} onChange={(event) => editor.update({ nameEn: event.target.value })} hint={t("nameHint")} />
          <Field
            label={t("orderLabel")}
            type="number"
            value={editor.form.order}
            onChange={(event) => editor.update({ order: event.target.value })}
            hint={topicId ? t("orderHint") : t("orderHintNew")}
          />
        </div>
        {row ? <TranslationStatus progress={row.translations} /> : null}
      </ContentEditPage>

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
          name: row?.nameEn ?? "",
          knowledge: row?.uses.knowledge ?? 0,
          helpful: row?.uses.helpful ?? 0,
          people: row?.uses.people ?? 0,
          highlight: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
        })}
      </ContentDeleteDialog>
    </>
  );
}
