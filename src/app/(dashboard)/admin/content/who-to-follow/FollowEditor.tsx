"use client";

import { useMutation, useQuery } from "convex/react";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FollowKind } from "@/convex/newsSchema";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldHint, FieldLabel } from "@/src/ui/components/screens/SettingsCard";
import { ContentEditPage, TranslationStatus } from "../_components/ContentEditPage";
import { useContentForm } from "../_components/useContentForm";
import { TopicSelect } from "../_components/TopicSelect";

/** `topic` is a key in the shared topic list, or "" for none; `picked` is "Our picks" (IH14). */
type FollowForm = { kind: FollowKind; name: string; url: string; whyEn: string; topic: string; picked: boolean };

const EMPTY: FollowForm = { kind: "X", name: "", url: "", whyEn: "", topic: "", picked: false };
/** "Our picks": the server refuses a fifth. */
const MAX_PICKS = 4;
const BACK_HREF = "/admin/content/who-to-follow";

/**
 * One "Who to follow" recommendation (docs/plans/active/knowledge-news-and-
 * digest-plan.md, phase 3, revised 2026-10-01): who, where they are followed,
 * and why — in English; the Translator writes the other languages — with an
 * optional topic from the shared list and the "Our picks" tick
 * (insights-helpful-content-plan.md, IH14, board 15).
 */
export function FollowEditor({ followId }: { followId?: Id<"newsFollows"> }) {
  const t = useTranslations("admin.newsFollows");
  const follow = useQuery(api.newsFollows.getFollow, followId ? { followId } : "skip");
  const picks = useQuery(api.newsFollows.listPicksForAdmin, {});
  const createFollow = useMutation(api.newsFollows.createFollow);
  const updateFollow = useMutation(api.newsFollows.updateFollow);
  const row = followId ? follow : null;
  const editor = useContentForm({
    scope: "admin-news-follow",
    row,
    empty: EMPTY,
    toForm: (existing): FollowForm => ({
      kind: existing.kind,
      name: existing.name,
      url: existing.url,
      whyEn: existing.whyEn,
      topic: existing.topic ?? "",
      picked: existing.pickedAt !== null,
    }),
    save: ({ topic, ...form }) => {
      const input = { ...form, topic: topic || undefined };
      return followId ? updateFollow({ followId, ...input }) : createFollow(input);
    },
    backHref: BACK_HREF,
    saveFailed: t("errors.saveFailed"),
  });

  // The picks other than this entry: four of them leave no room for it.
  const pickedElsewhere = (picks ?? []).filter((pick) => pick._id !== followId);

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="news-follow-topic">{t("topicLabel")}</FieldLabel>
          <TopicSelect id="news-follow-topic" value={editor.form.topic} onChange={(topic) => editor.update({ topic })} noneLabel={t("noTopic")} className="w-full" />
          <FieldHint>{t("topicHint")}</FieldHint>
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="news-follow-pick">{t("picksLabel")}</FieldLabel>
          <Checkbox
            id="news-follow-pick"
            label={t("pickCheckbox")}
            checked={editor.form.picked}
            disabled={pickedElsewhere.length >= MAX_PICKS && !editor.form.picked}
            onChange={(picked) => editor.update({ picked })}
          />
          <FieldHint>
            {pickedElsewhere.length >= MAX_PICKS && !editor.form.picked
              ? t("pickHintFull", { names: pickedElsewhere.map((pick) => pick.name).join(", "), name: editor.form.name || t("thisEntry"), max: MAX_PICKS })
              : t("pickHint", { free: Math.max(MAX_PICKS - pickedElsewhere.length - (editor.form.picked ? 1 : 0), 0), max: MAX_PICKS })}
          </FieldHint>
        </div>
      </div>
      {row ? <TranslationStatus progress={row.translations} /> : null}
    </ContentEditPage>
  );
}
