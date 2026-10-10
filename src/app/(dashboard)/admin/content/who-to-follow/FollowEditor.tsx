"use client";

import { useMutation, useQuery } from "convex/react";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import type { Id } from "@/convex/_generated/dataModel";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { ContentEditPage, TranslationStatus } from "../_components/ContentEditPage";
import { useContentForm } from "../_components/useContentForm";
import { FollowDetailsFields, type FollowDetails } from "./FollowDetailsFields";

const BASE = "/admin/content/who-to-follow";

/**
 * A person's details — name, why, topic and "Our picks" — in English; the
 * Translator writes the other languages (docs/plans/active/knowledge-news-
 * and-digest-plan.md, revised 2026-10-01). Opened by Edit details on their
 * page; their channels are changed on the page itself
 * (content-people-knowledge-plan.md, C3).
 */
export function FollowEditor({ followId }: { followId: Id<"newsFollows"> }) {
  const t = useTranslations("admin.newsFollows");
  const { platformName } = useSystemSettings();
  const row = useQuery(api.newsFollows.getFollow, { followId });
  const updateFollow = useMutation(api.newsFollows.updateFollow);
  const personHref = `${BASE}/${followId}`;
  const editor = useContentForm({
    scope: "admin-news-follow",
    row,
    empty: { name: "", whyEn: "", topic: "", picked: false } satisfies FollowDetails & { name: string; whyEn: string },
    toForm: (existing) => ({ name: existing.name, whyEn: existing.whyEn, topic: existing.topic ?? "", picked: existing.pickedAt !== null }),
    save: ({ topic, ...form }) => {
      return updateFollow({ followId, ...form, topic: topic || undefined });
    },
    backHref: personHref,
    saveFailed: t("errors.saveFailed"),
  });

  return (
    <ContentEditPage
      state={row === undefined ? "loading" : row === null ? "missing" : "ready"}
      back={{ label: row?.name ?? t("back"), href: personHref }}
      icon={<UserPlus className="h-6 w-6 text-brand" />}
      title={t("editTitle")}
      description={t("editorSubtitle")}
      error={editor.error}
      isSaving={editor.isSaving}
      saveLabel={t("save")}
      onSubmit={editor.submit}
    >
      <Field label={t("nameLabel")} required value={editor.form.name} onChange={(event) => editor.update({ name: event.target.value })} />
      <TextAreaField label={t("whyLabel")} hint={t("whyHint", { platformName })} required value={editor.form.whyEn} onChange={(event) => editor.update({ whyEn: event.target.value })} className="min-h-[110px] resize-y" />
      <FollowDetailsFields followId={followId} name={editor.form.name} details={editor.form} onChange={editor.update} />
      {row ? <TranslationStatus progress={row.translations} /> : null}
    </ContentEditPage>
  );
}
