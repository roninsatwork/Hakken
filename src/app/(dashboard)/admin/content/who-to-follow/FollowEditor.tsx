"use client";

import { useMutation, useQuery } from "convex/react";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FollowKind } from "@/convex/newsSchema";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldLabel } from "@/src/ui/components/screens/SettingsCard";
import { ContentEditPage, TranslationStatus } from "../_components/ContentEditPage";
import { useContentForm } from "../_components/useContentForm";

type FollowForm = { kind: FollowKind; name: string; url: string; whyEn: string };

const EMPTY: FollowForm = { kind: "X", name: "", url: "", whyEn: "" };
const BACK_HREF = "/admin/content/who-to-follow";

/**
 * One "Who to follow" recommendation (docs/plans/active/knowledge-news-and-
 * digest-plan.md, phase 3, revised 2026-10-01): who, where they are followed,
 * and why — in English; the Translator writes the other languages.
 */
export function FollowEditor({ followId }: { followId?: Id<"newsFollows"> }) {
  const t = useTranslations("admin.newsFollows");
  const follow = useQuery(api.newsFollows.getFollow, followId ? { followId } : "skip");
  const createFollow = useMutation(api.newsFollows.createFollow);
  const updateFollow = useMutation(api.newsFollows.updateFollow);
  const row = followId ? follow : null;
  const editor = useContentForm({
    scope: "admin-news-follow",
    row,
    empty: EMPTY,
    toForm: (existing): FollowForm => ({ kind: existing.kind, name: existing.name, url: existing.url, whyEn: existing.whyEn }),
    save: (form) => (followId ? updateFollow({ followId, ...form }) : createFollow(form)),
    backHref: BACK_HREF,
    saveFailed: t("errors.saveFailed"),
  });

  return (
    <ContentEditPage
      state={row === undefined ? "loading" : followId && row === null ? "missing" : "ready"}
      back={{ label: t("back"), href: BACK_HREF }}
      icon={<UserPlus className="h-6 w-6 text-brand" />}
      title={row ? row.name : t("createTitle")}
      description={t("editorSubtitle")}
      error={editor.error}
      isSaving={editor.isSaving}
      saveLabel={followId ? t("save") : t("create")}
      onSubmit={editor.submit}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("nameLabel")} required value={editor.form.name} onChange={(event) => editor.update({ name: event.target.value })} />
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="news-follow-kind">{t("kindLabel")}</FieldLabel>
          <Select id="news-follow-kind" value={editor.form.kind} onChange={(value) => editor.update({ kind: value as FollowKind })} className="w-full">
            <option value="X">{t("kinds.X")}</option>
            <option value="YOUTUBE">{t("kinds.YOUTUBE")}</option>
            <option value="LINKEDIN">{t("kinds.LINKEDIN")}</option>
            <option value="WEBSITE">{t("kinds.WEBSITE")}</option>
          </Select>
        </div>
      </div>
      <Field label={t("urlLabel")} type="url" required value={editor.form.url} onChange={(event) => editor.update({ url: event.target.value })} placeholder="https://" />
      <TextAreaField label={t("whyLabel")} required value={editor.form.whyEn} onChange={(event) => editor.update({ whyEn: event.target.value })} className="min-h-[110px] resize-y" />
      {row ? <TranslationStatus progress={row.translations} /> : null}
    </ContentEditPage>
  );
}
