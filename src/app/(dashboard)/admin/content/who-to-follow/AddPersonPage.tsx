"use client";

import { useMutation } from "convex/react";
import { Plus, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { channelKindOf, MAX_CHANNELS } from "@/convex/utils/followChannels";
import { Button } from "@/src/ui/components/screens/Button";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { Notice } from "@/src/ui/components/screens/Notice";
import { FieldHint, FieldLabel, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { RowIconButton } from "@/src/ui/components/screens/Table";
import { ContentEditPage } from "../_components/ContentEditPage";
import { useContentForm } from "../_components/useContentForm";
import { FollowDetailsFields } from "./FollowDetailsFields";

const BASE = "/admin/content/who-to-follow";

type PersonForm = { name: string; channels: string[]; whyEn: string; topic: string; picked: boolean };
const EMPTY: PersonForm = { name: "", channels: ["", ""], whyEn: "", topic: "", picked: false };

/**
 * Add a person (docs/plans/active/content-people-knowledge-plan.md, board
 * 3, C3): their name, the channels they publish on — one address a line,
 * added by hand, each named website, YouTube, X or LinkedIn as it is typed —
 * why we recommend them, their topic and "Our pick". Saving opens their page,
 * where the News Collector's first read of their channels shows.
 */
export function AddPersonPage() {
  const t = useTranslations("admin.newsFollows");
  const { platformName } = useSystemSettings();
  const tKinds = useTranslations("admin.newsFollows.kinds");
  const createFollow = useMutation(api.newsFollows.createFollow);
  const editor = useContentForm({
    scope: "admin-news-follow-add",
    row: null,
    empty: EMPTY,
    toForm: (form: PersonForm) => form,
    save: ({ topic, channels, ...form }) => {
      return createFollow({ ...form, channels: channels.filter((address) => address.trim()), topic: topic || undefined });
    },
    backHref: BASE,
    doneHref: (followId) => `${BASE}/${String(followId)}`,
    saveFailed: t("errors.saveFailed"),
  });
  const channels = editor.form.channels;
  const setChannel = (index: number, address: string) => editor.update({ channels: channels.map((entry, at) => (at === index ? address : entry)) });

  return (
    <ContentEditPage
      state="ready"
      back={{ label: t("back"), href: BASE }}
      icon={<UserPlus className="h-6 w-6 text-brand" />}
      title={t("add.title")}
      description={t("add.subtitle", { platformName })}
      error={editor.error}
      isSaving={editor.isSaving}
      saveLabel={t("add.save")}
      onSubmit={editor.submit}
    >
      <SettingsCard title={t("add.cardTitle")}>
        <Field label={t("nameLabel")} required value={editor.form.name} onChange={(event) => editor.update({ name: event.target.value })} placeholder={t("add.namePlaceholder")} />
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="person-channel-0">{t("add.channelsLabel")}</FieldLabel>
          {channels.map((address, index) => (
            <div key={index} className="flex items-center gap-3">
              <Field
                id={`person-channel-${index}`}
                label={index === 0 ? t("add.channelsLabel") : t("add.anotherLabel")}
                labelHidden
                type="text"
                inputMode="url"
                wrapperClassName="flex-1"
                value={address}
                onChange={(event) => setChannel(index, event.target.value)}
                placeholder={index === 0 ? t("add.firstPlaceholder") : t("add.otherPlaceholder")}
              />
              {/* What the address is, as soon as it is typed: the kind the server keeps it as. */}
              <span className="w-[72px] shrink-0">{address.trim() ? <TagLabel>{tKinds(channelKindOf(address))}</TagLabel> : null}</span>
              {channels.length > 1 ? (
                <RowIconButton label={t("add.removeOne")} onClick={() => editor.update({ channels: channels.filter((_, at) => at !== index) })}>
                  <X className="h-4 w-4" />
                </RowIconButton>
              ) : null}
            </div>
          ))}
          {channels.length < MAX_CHANNELS ? (
            <Button variant="quiet" className="self-start" onClick={() => editor.update({ channels: [...channels, ""] })}>
              <Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {t("add.addAnother")}
            </Button>
          ) : null}
          <FieldHint>{t("add.channelsHint")}</FieldHint>
        </div>
        <TextAreaField label={t("whyLabel")} hint={t("whyHint", { platformName })} required value={editor.form.whyEn} onChange={(event) => editor.update({ whyEn: event.target.value })} className="min-h-[96px] resize-y" />
        <FollowDetailsFields name={editor.form.name} details={editor.form} onChange={editor.update} />
      </SettingsCard>
      <Notice>{t("add.notice", { platformName })}</Notice>
    </ContentEditPage>
  );
}
