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

/**
 * How much this company collects about each website it holds: how many of a
 * site's keywords and how many of its backlinks are kept
 * (`convex/companyDataLimits.ts`). Anthony, 2026-09-24: "some may get 100,
 * some may get 1000 or 2000".
 *
 * Beside the schedule because it is the other half of what collection costs:
 * the schedule says how often, this says how much. Super admin only, like the
 * rest of the screen.
 */
export function CollectionLimits({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("admin.companyDataCollection.limits");
  const tCommon = useTranslations("common");
  const limits = useQuery(api.companyDataLimits.getCompanyDataLimits, { companyId });
  const setLimits = useMutation(api.companyDataLimits.setCompanyDataLimits);
  const action = useAdminAction({ scope: "admin-company-data-limits" });

  const [keywords, setKeywords] = useState<number | null>(null);
  const [backlinks, setBacklinks] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (!limits) return null;
  const chosenKeywords = keywords ?? limits.keywordsPerSite;
  const chosenBacklinks = backlinks ?? limits.backlinksPerSite;
  const changed = chosenKeywords !== limits.keywordsPerSite || chosenBacklinks !== limits.backlinksPerSite;

  const handleSave = async () => {
    setError("");
    setSaved(false);
    const outcome = await action.run(
      () => setLimits({ companyId, keywordsPerSite: chosenKeywords, backlinksPerSite: chosenBacklinks }),
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

  const choice = (value: number) => (
    <option key={value} value={value}>{t("choice", { count: value })}</option>
  );

  return (
    <SettingsCard title={t("title")}>
      <p className="max-w-2xl text-[12px] leading-relaxed text-secondary">{t("intro")}</p>

      <SettingRow label={t("keywordsLabel")} description={t("keywordsDescription")}>
        <Select
          aria-label={t("keywordsLabel")}
          value={chosenKeywords}
          onChange={(value) => { setKeywords(Number(value)); setSaved(false); }}
          className="w-full"
        >
          {limits.choices.map(choice)}
        </Select>
      </SettingRow>

      <SettingRow label={t("backlinksLabel")} description={t("backlinksDescription")}>
        <Select
          aria-label={t("backlinksLabel")}
          value={chosenBacklinks}
          onChange={(value) => { setBacklinks(Number(value)); setSaved(false); }}
          className="w-full"
        >
          {limits.choices.map(choice)}
        </Select>
      </SettingRow>

      <p className="border-t border-border-dim pt-4 text-[12px] text-secondary">
        {limits.isDefault && !changed ? t("usingDefaults") : t("costNote")}
      </p>

      <SaveError>{error}</SaveError>

      <div className="flex justify-end border-t border-border-dim pt-4">
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
