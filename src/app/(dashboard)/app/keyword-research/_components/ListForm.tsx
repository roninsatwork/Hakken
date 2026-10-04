"use client";

import { useState, type FormEvent } from "react";
import { ListChecks } from "lucide-react";
import { useTranslations } from "next-intl";
import Header from "@/src/ui/components/layout/Header";
import { Field } from "@/src/ui/components/screens/Field";
import { Notice } from "@/src/ui/components/screens/Notice";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldHint, FieldLabel, SettingsCard } from "@/src/ui/components/screens/SettingsCard";

/** A list's name, as long as the server keeps (`NAME_MAX` in convex/keywordResearch.ts). */
const NAME_MAX = 80;

/**
 * A research list's own page for its fields — making one, or renaming one —
 * never a pop-up (Anthony, 2026-10-01: anything with fields is its own page).
 * The way back, the name, the website it is measured against when it is new,
 * the reason a save failed, and Save. A read-only account is told it cannot
 * change lists, in place of the form.
 */
export function ListForm({
  back,
  title,
  description,
  initialName = "",
  websites,
  initialSiteId = "",
  canChange,
  isSaving,
  error,
  onSave,
}: {
  back: { label: string; href: string };
  title: string;
  description: string;
  initialName?: string;
  /** The company's own websites to measure the list against; left out when renaming, which keeps the website. */
  websites?: ReadonlyArray<{ siteId: string; host: string }>;
  initialSiteId?: string;
  canChange: boolean;
  isSaving: boolean;
  error: string | null;
  onSave: (name: string, siteId: string) => void | Promise<void>;
}) {
  const t = useTranslations("keywordResearch.listForm");
  const [name, setName] = useState(initialName);
  const [siteId, setSiteId] = useState(initialSiteId);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || isSaving) return;
    void onSave(name.trim(), siteId);
  };

  return (
    <>
      <Header />
      <div className="flex w-full flex-col gap-5 pb-8">
        <DetailHeader back={back} icon={<ListChecks className="h-6 w-6 text-brand" />} title={title} description={description} />
        {canChange ? (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <SettingsCard title={t("card")}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field
                  label={t("name")}
                  placeholder={t("namePlaceholder")}
                  value={name}
                  maxLength={NAME_MAX}
                  required
                  onChange={(event) => setName(event.target.value)}
                />
                {websites ? (
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel htmlFor="kr-list-site">{t("measuredAgainst")}</FieldLabel>
                    <Select id="kr-list-site" value={siteId} onChange={setSiteId} className="w-full" selectClassName="h-[46px] rounded-[12px] text-[14px]">
                      {websites.map((website) => <option key={website.siteId} value={website.siteId}>{website.host}</option>)}
                      <option value="">{t("noWebsite")}</option>
                    </Select>
                    <FieldHint>{t("measuredHint")}</FieldHint>
                  </div>
                ) : null}
              </div>
            </SettingsCard>
            <SaveError>{error}</SaveError>
            <div className="flex items-center justify-end gap-4 border-t border-border-dim pt-5">
              <SaveAction type="submit" isSaving={isSaving} label={t("save")} savingLabel={t("saving")} disabled={!name.trim()} />
            </div>
          </form>
        ) : (
          <Notice>{t("readOnly")}</Notice>
        )}
      </div>
    </>
  );
}
