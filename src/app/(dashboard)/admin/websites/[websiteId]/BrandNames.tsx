"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { Plus, Star, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { MAX_BRAND_NAMES } from "@/convex/utils/websiteBrands";

/**
 * The names this website goes by.
 *
 * **On the global website screen rather than a company's view of it, because
 * the list is shared and this screen is the one that can say so.** Anyone
 * tracking one host would write down the same names, so they belong
 * beside the host — and that is also what lets one AI citation purchase answer
 * every company watching the site.
 *
 * Super admin only for now, which the platform gate above already enforces and
 * the notice below states plainly. An edit here changes what other customers
 * see, and a screen that hid that would be lying by omission.
 */

type Draft = { name: string; isPrimary: boolean };

export function BrandNames({
  websiteId,
  saved,
}: {
  websiteId: Id<"websites">;
  /** Empty means this site has no names yet, never that they have not loaded. */
  saved: ReadonlyArray<{ name: string; isPrimary: boolean }>;
}) {
  const t = useTranslations("admin.websiteDetail.brands");
  const tCommon = useTranslations("common");
  const setBrandNames = useMutation(api.websites.setWebsiteBrandNames);
  const action = useAdminAction({ scope: "admin-website-brands" });

  const [draft, setDraft] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  /*
    Adopted during render, keyed on the content of the saved list.

    Keyed on content rather than on the array: the parent builds that array
    fresh on every render, so depending on it directly re-seeded constantly and
    wiped the draft between keystrokes — the field looked like it was refusing
    typing. A serialised key changes only when the saved names really change,
    which is the one moment re-seeding is right. And during render rather than
    in an effect, so the reader never sees a frame of the stale list first.
  */
  const savedKey = JSON.stringify(saved);
  const [adoptedKey, setAdoptedKey] = useState<string | null>(null);
  if (adoptedKey !== savedKey) {
    setAdoptedKey(savedKey);
    const names = JSON.parse(savedKey) as Draft[];
    setDraft(names.length > 0
      ? names.map((entry) => ({ ...entry }))
      : [{ name: "", isPrimary: true }]);
  }

  const update = (index: number, name: string) => {
    setIsSaved(false);
    setDraft((rows) => rows.map((row, at) => (at === index ? { ...row, name } : row)));
  };

  const makePrimary = (index: number) => {
    setIsSaved(false);
    setDraft((rows) => rows.map((row, at) => ({ ...row, isPrimary: at === index })));
  };

  const remove = (index: number) => {
    setIsSaved(false);
    setDraft((rows) => {
      const kept = rows.filter((_, at) => at !== index);
      if (kept.length === 0) return [{ name: "", isPrimary: true }];
      // Removing the primary has to leave one behind, or the next save would be
      // choosing on the person's behalf without telling them.
      return kept.some((row) => row.isPrimary)
        ? kept
        : kept.map((row, at) => ({ ...row, isPrimary: at === 0 }));
    });
  };

  const handleSave = async () => {
    setError("");
    setIsSaved(false);

    const outcome = await action.run(
      () => setBrandNames({
        websiteId,
        names: draft
          .filter((row) => row.name.trim().length > 0)
          .map((row) => ({ name: row.name, isPrimary: row.isPrimary })),
      }),
      { suppressErrorToast: true, fallbackMessage: t("errors.saveFailed") },
    );

    if (outcome.ok) setIsSaved(true);
    else setError(outcome.message);
  };

  return (
    <div className="flex flex-col gap-4 rounded-[12px] border border-border-dim bg-card/40 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t("title")}
        </h2>
        {/*
          Said outright rather than left to be discovered: this list is not
          private to whoever is looking at it.
        */}
        <p className="max-w-3xl text-[13px] text-secondary">{t("subtitle")}</p>
      </div>

      <div className="flex flex-col gap-2">
        {draft.map((row, index) => (
          <div key={index} className="flex items-end gap-2">
            <Field
              label={t("nameLabel", { number: index + 1 })}
              labelHidden
              value={row.name}
              onChange={(event) => update(index, event.target.value)}
              placeholder={t("placeholder")}
              wrapperClassName="flex-1"
            />
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
            onClick={() => setDraft((rows) => [...rows, { name: "", isPrimary: false }])}
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            {t("addName", { used: draft.length, max: MAX_BRAND_NAMES })}
          </Button>
          {/*
            The warning that saves a support ticket: a one-word brand matches
            text about something else entirely.
          */}
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
    </div>
  );
}
