"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { Plus, SpellCheck, Star, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { MAX_BRAND_NAMES } from "@/convex/utils/websiteBrands";

type Kind = "NAME" | "MISSPELLING";
type Draft = { name: string; isPrimary: boolean; kind: Kind };

/**
 * The names this company knows one of its websites by — its own, or a
 * competitor's (docs/plans/active/company-level-website-facts-plan.md, CL7).
 * No other company sees them. They are what AI answers are read for: an
 * answer counts as naming the website for this company when one of these
 * appears in it.
 *
 * A name can be marked a misspelling — a spelling people get wrong, counted
 * apart — which the shared editor this replaced could not keep: saving there
 * turned every misspelling back into a name.
 */
export function HoldBrandNames({
  companyWebsiteId,
  saved,
}: {
  companyWebsiteId: Id<"companyWebsites">;
  /** Empty means no names yet, never that they have not loaded. */
  saved: ReadonlyArray<{ name: string; isPrimary: boolean; kind?: Kind }>;
}) {
  const t = useTranslations("admin.siteView.profile.brands");
  const tCommon = useTranslations("common");
  const setBrandNames = useMutation(api.holdProfiles.setHoldBrandNames);
  const action = useAdminAction({ scope: "admin-hold-brands" });

  const [draft, setDraft] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  // Adopted during render, keyed on the saved list's content, so typing is
  // never wiped by a fresh array and no frame shows a stale list.
  const savedKey = JSON.stringify(saved);
  const [adoptedKey, setAdoptedKey] = useState<string | null>(null);
  if (adoptedKey !== savedKey) {
    setAdoptedKey(savedKey);
    const names = JSON.parse(savedKey) as Array<{ name: string; isPrimary: boolean; kind?: Kind }>;
    setDraft(names.length > 0
      ? names.map((entry) => ({ name: entry.name, isPrimary: entry.isPrimary, kind: entry.kind ?? "NAME" }))
      : [{ name: "", isPrimary: true, kind: "NAME" }]);
  }

  const change = (index: number, patch: Partial<Draft>) => {
    setIsSaved(false);
    setDraft((rows) => rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  };

  const makePrimary = (index: number) => {
    setIsSaved(false);
    // The main name is a correct one: a misspelling made main becomes a name.
    setDraft((rows) => rows.map((row, at) => (at === index ? { ...row, isPrimary: true, kind: "NAME" } : { ...row, isPrimary: false })));
  };

  const remove = (index: number) => {
    setIsSaved(false);
    setDraft((rows) => {
      const kept = rows.filter((_, at) => at !== index);
      if (kept.length === 0) return [{ name: "", isPrimary: true, kind: "NAME" }];
      return kept.some((row) => row.isPrimary) ? kept : kept.map((row, at) => ({ ...row, isPrimary: at === 0 }));
    });
  };

  const handleSave = async () => {
    setError("");
    setIsSaved(false);
    const outcome = await action.run(
      () => setBrandNames({
        companyWebsiteId,
        names: draft
          .filter((row) => row.name.trim().length > 0)
          .map((row) => ({ name: row.name, isPrimary: row.isPrimary, kind: row.kind })),
      }),
      { suppressErrorToast: true, fallbackMessage: t("errors.saveFailed") },
    );
    if (outcome.ok) setIsSaved(true);
    else setError(outcome.message);
  };

  return (
    <SettingsCard title={t("title")}>
      <p className="max-w-2xl text-[12px] leading-relaxed text-secondary">{t("subtitle")}</p>

      <div className="flex flex-col gap-2">
        {draft.map((row, index) => (
          <div key={index} className="flex items-end gap-2">
            <Field
              label={t("nameLabel", { number: index + 1 })}
              labelHidden
              value={row.name}
              onChange={(event) => change(index, { name: event.target.value })}
              placeholder={t("placeholder")}
              wrapperClassName="flex-1"
            />
            <Button
              variant="icon"
              onClick={() => change(index, { kind: row.kind === "MISSPELLING" ? "NAME" : "MISSPELLING" })}
              disabled={row.isPrimary}
              aria-pressed={row.kind === "MISSPELLING"}
              aria-label={t("markMisspelling")}
              title={row.isPrimary ? t("mainIsCorrect") : t("markMisspelling")}
              className={row.kind === "MISSPELLING" ? "text-warning" : "text-muted hover:text-foreground"}
            >
              <SpellCheck className="h-4 w-4" />
            </Button>
            <Button
              variant="icon"
              onClick={() => makePrimary(index)}
              aria-pressed={row.isPrimary}
              aria-label={t("makePrimary")}
              title={t("makePrimary")}
              className={row.isPrimary ? "text-brand" : "text-muted hover:text-foreground"}
            >
              <Star className="h-4 w-4" />
            </Button>
            <Button
              variant="icon"
              onClick={() => remove(index)}
              aria-label={t("removeName")}
              title={t("removeName")}
              className="text-muted hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Button
            variant="quiet"
            className="w-fit px-3 py-1.5 text-[12px]"
            disabled={draft.length >= MAX_BRAND_NAMES}
            onClick={() => setDraft((rows) => [...rows, { name: "", isPrimary: false, kind: "NAME" }])}
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            {t("addName", { used: draft.length, max: MAX_BRAND_NAMES })}
          </Button>
          <span className="text-[11px] text-muted">{t("shortNameWarning")}</span>
        </div>
        <SaveAction
          onClick={handleSave}
          isSaving={action.isBusy()}
          label={t("save")}
          savingLabel={tCommon("saving")}
          successLabel={t("saved")}
          showSuccess={isSaved}
        />
      </div>

      <SaveError>{error}</SaveError>
    </SettingsCard>
  );
}
