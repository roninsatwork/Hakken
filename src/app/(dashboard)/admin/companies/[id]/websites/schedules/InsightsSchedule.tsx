"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SettingSwitch, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { SeoScheduleFields } from "@/src/app/(dashboard)/admin/_components/SeoScheduleFields";
import { hydrateScheduleDraft, serializeScheduleDraft, validateScheduleDraft, type ScheduleDraft } from "@/src/app/(dashboard)/admin/_lib/scheduleConfig";
import { useScheduleSummary } from "@/src/app/(dashboard)/admin/_lib/useScheduleSummary";

/**
 * When the Insights team reads this company's websites
 * (docs/plans/active/insights-analyst-plan.md §6; Anthony, 2026-10-11: "I
 * may decide monthly for some clients"): on, and how often — weekly on Monday
 * mornings until set. The team looks every morning and reads each client
 * whose own schedule has come due. The same four cadences and fields as the
 * Collection schedule above it.
 */
export function InsightsSchedule({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("admin.companyDataCollection.insights");
  const tCommon = useTranslations("common");
  const schedule = useQuery(api.insightsTeam.getCompanyInsightsSchedule, { companyId });
  const save = useMutation(api.insightsTeam.saveCompanyInsightsSchedule);
  const action = useAdminAction({ scope: "admin-company-insights" });
  const summary = useScheduleSummary();

  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const key = schedule ? `${schedule.intervalStr}|${schedule.isActive}` : null;
  const [seen, setSeen] = useState<string | null>(null);
  if (schedule && key !== seen) {
    setSeen(key);
    setDraft(hydrateScheduleDraft(schedule.intervalStr));
    setIsActive(schedule.isActive);
  }
  if (!draft) return null;

  const handleSave = async () => {
    setError("");
    setSaved(false);
    const problem = validateScheduleDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    const outcome = await action.run(
      async () => { await save({ companyId, intervalStr: serializeScheduleDraft(draft), isActive }); },
      { suppressErrorToast: true, fallbackMessage: t("saveFailed") },
    );
    if (outcome.ok) setSaved(true);
    else setError(outcome.message);
  };

  return (
    <SettingsCard title={t("title")}>
      <SettingSwitch label={t("label")} description={t("description")} checked={isActive} onChange={setIsActive} />
      <div className="border-t border-border-dim pt-5">
        <SeoScheduleFields draft={draft} onChange={setDraft} />
      </div>
      <p className="border-t border-border-dim pt-4 text-[12px] text-secondary">
        {isActive ? t("summary", { schedule: summary(serializeScheduleDraft(draft)) }) : t("off")}
      </p>
      <SaveError>{error}</SaveError>
      <div className="flex justify-end border-t border-border-dim pt-4">
        <SaveAction onClick={handleSave} isSaving={action.isBusy()} label={t("save")} savingLabel={tCommon("saving")} successLabel={t("saved")} showSuccess={saved} />
      </div>
    </SettingsCard>
  );
}
