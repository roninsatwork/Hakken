"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SettingSwitch, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { useAdminAction } from "@/src/hooks/useAdminAction";

const PARTS = ["local", "reviews", "aiApps", "aiDemand", "brandRadar", "webMentions"] as const;
type Part = (typeof PARTS)[number];
type Parts = Record<Part, boolean>;

/**
 * Which of Discovery's new kinds of data this company buys on its schedule
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, D16; Anthony,
 * 2026-10-09: "hold until I say", per company, per part). Each starts off;
 * switched on, the part is planned on the company's next run.
 */
export function CollectionParts({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("admin.companyDataCollection.parts");
  const tCommon = useTranslations("common");
  const saved = useQuery(api.collectionParts.getCollectionParts, { companyId });
  const save = useMutation(api.collectionParts.setCollectionParts);
  const action = useAdminAction({ scope: "admin-collection-parts" });
  const [draft, setDraft] = useState<Parts | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const parts = draft ?? saved ?? null;

  const handleSave = async () => {
    if (!parts) return;
    setError("");
    setDone(false);
    const outcome = await action.run(() => save({ companyId, parts }), { suppressErrorToast: true, fallbackMessage: t("saveFailed") });
    if (outcome.ok) {
      setDone(true);
      setDraft(null);
    } else {
      setError(outcome.message);
    }
  };

  return (
    <SettingsCard title={t("title")}>
      <p className="text-[12px] text-secondary">{t("intro")}</p>
      {PARTS.map((part) => (
        <SettingSwitch
          key={part}
          label={t(`${part}.label`)}
          description={t(`${part}.description`)}
          checked={parts?.[part] ?? false}
          onChange={(checked) => {
            if (parts) setDraft({ ...parts, [part]: checked });
          }}
        />
      ))}
      <SaveError>{error}</SaveError>
      <div className="flex justify-end border-t border-border-dim pt-4">
        <SaveAction onClick={handleSave} isSaving={action.isBusy()} label={t("saveParts")} savingLabel={tCommon("saving")} successLabel={t("saved")} showSuccess={done} />
      </div>
    </SettingsCard>
  );
}
