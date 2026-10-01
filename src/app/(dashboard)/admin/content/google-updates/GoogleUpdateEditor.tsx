"use client";

import { useMutation, useQuery } from "convex/react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { ContentEditPage, TranslationStatus } from "../_components/ContentEditPage";
import { useContentForm } from "../_components/useContentForm";

type UpdateForm = { titleEn: string; descriptionEn: string; meaningEn: string; startedOn: string; finishedOn: string; expectedDays: string; url: string };

/** Google's usual "up to two weeks", until the announcement says otherwise (R8). */
const DEFAULT_EXPECTED_DAYS = "14";

const EMPTY: UpdateForm = { titleEn: "", descriptionEn: "", meaningEn: "", startedOn: "", finishedOn: "", expectedDays: DEFAULT_EXPECTED_DAYS, url: "" };
const BACK_HREF = "/admin/content/google-updates";

/**
 * Entering a Google update (docs/plans/active/knowledge-news-and-digest-plan.md,
 * D6, revised 2026-10-01): its title and a plain description in English — what
 * News shows and, from phase 10, what a Sites chart's marker says on hover —
 * the days it started and finished, blank while it rolls out, and Google's own
 * link. Since 2026-10-01 (R8) also what it means for the reader, if anything,
 * and up to how many days Google said it may take, which News's rollout line
 * ends at. The Translator writes the other languages.
 */
export function GoogleUpdateEditor({ updateId }: { updateId?: Id<"googleUpdates"> }) {
  const t = useTranslations("admin.googleUpdates");
  const update = useQuery(api.googleUpdates.getGoogleUpdate, updateId ? { updateId } : "skip");
  const createUpdate = useMutation(api.googleUpdates.createGoogleUpdate);
  const saveUpdate = useMutation(api.googleUpdates.updateGoogleUpdate);
  const row = updateId ? update : null;
  const editor = useContentForm({
    scope: "admin-google-update",
    row,
    empty: EMPTY,
    toForm: (existing): UpdateForm => ({
      titleEn: existing.titleEn,
      descriptionEn: existing.descriptionEn,
      meaningEn: existing.meaningEn,
      startedOn: existing.startedOn,
      finishedOn: existing.finishedOn ?? "",
      expectedDays: String(existing.expectedDays),
      url: existing.url,
    }),
    save: ({ expectedDays, ...form }) => {
      // A whole number of days, or what the server says when it is not one.
      const input = { ...form, expectedDays: expectedDays.trim() ? Number(expectedDays) : undefined };
      return updateId ? saveUpdate({ updateId, ...input }) : createUpdate(input);
    },
    backHref: BACK_HREF,
    saveFailed: t("errors.saveFailed"),
  });

  return (
    <ContentEditPage
      state={row === undefined ? "loading" : updateId && row === null ? "missing" : "ready"}
      back={{ label: t("back"), href: BACK_HREF }}
      icon={<Sparkles className="h-6 w-6 text-brand" />}
      title={row ? row.titleEn : t("createTitle")}
      description={t("editorSubtitle")}
      error={editor.error}
      isSaving={editor.isSaving}
      saveLabel={updateId ? t("save") : t("create")}
      onSubmit={editor.submit}
    >
      <Field label={t("titleLabel")} required value={editor.form.titleEn} onChange={(event) => editor.update({ titleEn: event.target.value })} placeholder={t("titlePlaceholder")} />
      <TextAreaField
        label={t("descriptionLabel")}
        required
        value={editor.form.descriptionEn}
        onChange={(event) => editor.update({ descriptionEn: event.target.value })}
        className="min-h-[130px] resize-y"
      />
      <TextAreaField
        label={t("meaningLabel")}
        hint={t("meaningHint")}
        value={editor.form.meaningEn}
        onChange={(event) => editor.update({ meaningEn: event.target.value })}
        className="min-h-[90px] resize-y"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={t("startedLabel")} type="date" required value={editor.form.startedOn} onChange={(event) => editor.update({ startedOn: event.target.value })} />
        <Field
          label={t("finishedLabel")}
          type="date"
          hint={t("finishedHint")}
          value={editor.form.finishedOn}
          min={editor.form.startedOn}
          onChange={(event) => editor.update({ finishedOn: event.target.value })}
        />
        <Field
          label={t("expectedDaysLabel")}
          type="number"
          min={1}
          max={60}
          step={1}
          hint={t("expectedDaysHint")}
          value={editor.form.expectedDays}
          onChange={(event) => editor.update({ expectedDays: event.target.value })}
        />
      </div>
      <Field label={t("urlLabel")} type="url" required value={editor.form.url} onChange={(event) => editor.update({ url: event.target.value })} placeholder="https://status.search.google.com/…" />
      {row ? <TranslationStatus progress={row.translations} /> : null}
    </ContentEditPage>
  );
}
