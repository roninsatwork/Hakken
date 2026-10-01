"use client";

import { useMutation, useQuery } from "convex/react";
import { Radio } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { NewsSourceKind } from "@/convex/newsSchema";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { Field } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldLabel } from "@/src/ui/components/screens/SettingsCard";
import { ContentEditPage } from "../_components/ContentEditPage";
import { useContentForm } from "../_components/useContentForm";

type SourceForm = { kind: NewsSourceKind; name: string; address: string; isOn: boolean };

const EMPTY: SourceForm = { kind: "WEBSITE", name: "", address: "", isOn: true };
const BACK_HREF = "/admin/content/news-sources";

/**
 * A News source (docs/plans/active/knowledge-news-and-digest-plan.md, A10): a
 * website, a YouTube channel or an X account, its name as News credits it, and
 * whether the News Collector reads it (phase 5).
 */
export function SourceEditor({ sourceId }: { sourceId?: Id<"newsSources"> }) {
  const t = useTranslations("admin.newsSources");
  const source = useQuery(api.newsSources.getNewsSource, sourceId ? { sourceId } : "skip");
  const createSource = useMutation(api.newsSources.createNewsSource);
  const updateSource = useMutation(api.newsSources.updateNewsSource);
  const row = sourceId ? source : null;
  const editor = useContentForm({
    scope: "admin-news-source",
    row,
    empty: EMPTY,
    toForm: (existing): SourceForm => ({
      kind: existing.kind,
      name: existing.name,
      address: existing.kind === "X_ACCOUNT" ? `@${existing.address}` : existing.address,
      isOn: existing.isOn,
    }),
    save: (form) => (sourceId ? updateSource({ sourceId, ...form }) : createSource(form)),
    backHref: BACK_HREF,
    saveFailed: t("errors.saveFailed"),
  });

  return (
    <ContentEditPage
      state={row === undefined ? "loading" : sourceId && row === null ? "missing" : "ready"}
      back={{ label: t("back"), href: BACK_HREF }}
      icon={<Radio className="h-6 w-6 text-brand" />}
      title={row ? row.name : t("createTitle")}
      description={t("editorSubtitle")}
      error={editor.error}
      isSaving={editor.isSaving}
      saveLabel={sourceId ? t("save") : t("create")}
      onSubmit={editor.submit}
    >
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="news-source-kind">{t("kindLabel")}</FieldLabel>
        <Select id="news-source-kind" value={editor.form.kind} onChange={(value) => editor.update({ kind: value as NewsSourceKind })} className="w-full sm:w-64">
          <option value="WEBSITE">{t("kinds.WEBSITE")}</option>
          <option value="YOUTUBE">{t("kinds.YOUTUBE")}</option>
          <option value="X_ACCOUNT">{t("kinds.X_ACCOUNT")}</option>
        </Select>
      </div>
      <Field label={t("nameLabel")} required value={editor.form.name} onChange={(event) => editor.update({ name: event.target.value })} placeholder={t("namePlaceholder")} />
      <Field
        label={editor.form.kind === "X_ACCOUNT" ? t("handleLabel") : t("addressLabel")}
        hint={t(`addressHints.${editor.form.kind}`)}
        required
        value={editor.form.address}
        onChange={(event) => editor.update({ address: event.target.value })}
      />
      <Checkbox label={t("isOnLabel")} checked={editor.form.isOn} onChange={(next) => editor.update({ isOn: next })} />
    </ContentEditPage>
  );
}
