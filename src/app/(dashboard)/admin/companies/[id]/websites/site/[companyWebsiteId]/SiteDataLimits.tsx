"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { Select } from "@/src/ui/components/screens/Select";
import { SettingRow, SettingsCard } from "@/src/ui/components/screens/SettingsCard";

/** The select's value for "follow the company". A real limit is never empty. */
const FOLLOW = "";

/**
 * How much is kept about this one website: how many of its keywords and how
 * many of its backlinks (`convex/companyDataLimits.ts`). Anthony, 2026-09-24:
 * "I think we need to set a limit on the website not just the company" — a
 * company's biggest competitor may need ten thousand keywords where the rest
 * need a thousand.
 *
 * On the website's own page, its own sites and every competitor alike, rather
 * than in the settings panel: a paired competitor has no settings panel, since
 * its day and place are its pair's, but how much of it is kept is its own.
 * "Follow the company" keeps no row of its own, so a change on the company's
 * Data collection screen moves every website left following it.
 */
export function SiteDataLimits({ companyWebsiteId }: { companyWebsiteId: Id<"companyWebsites"> }) {
  const t = useTranslations("admin.companyWebsiteDetail.limits");
  const tCommon = useTranslations("common");
  const limits = useQuery(api.companyDataLimits.getSiteDataLimits, { companyWebsiteId });
  const setLimits = useMutation(api.companyDataLimits.setSiteDataLimits);
  const action = useAdminAction({ scope: "admin-site-data-limits" });

  // Null means "untouched", so the saved limit shows without an effect
  // copying it into state every time it changes underneath.
  const [keywords, setKeywords] = useState<string | null>(null);
  const [backlinks, setBacklinks] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (!limits) return null;
  const storedKeywords = limits.own.keywordsPerSite === null ? FOLLOW : String(limits.own.keywordsPerSite);
  const storedBacklinks = limits.own.backlinksPerSite === null ? FOLLOW : String(limits.own.backlinksPerSite);
  const chosenKeywords = keywords ?? storedKeywords;
  const chosenBacklinks = backlinks ?? storedBacklinks;
  const changed = chosenKeywords !== storedKeywords || chosenBacklinks !== storedBacklinks;

  const handleSave = async () => {
    setError("");
    setSaved(false);
    const outcome = await action.run(
      () => setLimits({
        companyWebsiteId,
        keywordsPerSite: chosenKeywords === FOLLOW ? null : Number(chosenKeywords),
        backlinksPerSite: chosenBacklinks === FOLLOW ? null : Number(chosenBacklinks),
      }),
      { suppressErrorToast: true, fallbackMessage: t("saveFailed") },
    );
    if (outcome.ok) {
      setSaved(true);
      setKeywords(null);
      setBacklinks(null);
    } else if (!outcome.deduplicated) {
      setError(outcome.message);
    }
  };

  const limitRow = (
    kind: "keywords" | "backlinks",
    value: string,
    onChange: (next: string) => void,
    companyLimit: number,
  ) => (
    <SettingRow label={t(`${kind}Label`)} description={t(`${kind}Description`)}>
      <Select
        aria-label={t(`${kind}Label`)}
        value={value}
        onChange={(next) => { onChange(next); setSaved(false); }}
        className="w-full"
      >
        <option value={FOLLOW}>{t("follow", { count: companyLimit })}</option>
        {limits.choices.map((choice) => (
          <option key={choice} value={String(choice)}>{t(`${kind}Choice`, { count: choice })}</option>
        ))}
      </Select>
    </SettingRow>
  );

  return (
    <SettingsCard title={t("title")}>
      <p className="max-w-2xl text-[12px] leading-relaxed text-secondary">{t("subtitle")}</p>

      {limitRow("keywords", chosenKeywords, setKeywords, limits.company.keywordsPerSite)}
      {limitRow("backlinks", chosenBacklinks, setBacklinks, limits.company.backlinksPerSite)}

      <SaveError>{error}</SaveError>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-dim pt-4">
        <p className="text-[12px] text-secondary">{t("appliesNext")}</p>
        <SaveAction
          onClick={handleSave}
          isSaving={action.isBusy()}
          disabled={!changed}
          label={t("save")}
          savingLabel={tCommon("saving")}
          successLabel={t("saved")}
          showSuccess={saved}
        />
      </div>
    </SettingsCard>
  );
}
