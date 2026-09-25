"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SettingSwitch, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { SeoScheduleFields } from "@/src/app/(dashboard)/admin/_components/SeoScheduleFields";
import {
  createDefaultScheduleDraft,
  hydrateScheduleDraft,
  serializeScheduleDraft,
  validateScheduleDraft,
  type ScheduleDraft,
} from "@/src/app/(dashboard)/admin/_lib/scheduleConfig";
import { useScheduleSummary } from "@/src/app/(dashboard)/admin/_lib/useScheduleSummary";
import { CollectNow } from "./CollectNow";
import { CollectionCost } from "./CollectionCost";
import { CollectionLimits } from "./CollectionLimits";

/**
 * When this company's SEO data gets collected.
 *
 * **A setting the DataForSEO Planner reads, not an alarm.** The row behind it
 * is a `schedules` row in the platform's own format — the same `intervalStr`,
 * the same helpers — but it names no agent and wakes nothing. The Planner and
 * the Collector each run on their own agent schedule; on each of its runs the
 * Planner reads every company's row here and queues what has come due, and the
 * Collector sends it on its next run. Two agents, two agent schedules (Anthony,
 * 2026-09-25).
 *
 * It began as a cadence enum, an active flag and a next-run calculation of its
 * own, none of which any dispatcher read — a settings form that nothing acted
 * on. Anthony, 2026-09-21: *"why does this not work like the agent schedules —
 * I did say re-use, don't build new."* Then, until 2026-09-25, each company's
 * row named the Collector and the dispatcher woke it per company, which sent a
 * queue nothing had filled.
 */
export default function CompanyDataCollectionPage() {
  const t = useTranslations("admin.companyDataCollection");
  const tCommon = useTranslations("common");
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  const company = useQuery(api.companies.getCompanyById, { id: companyId });
  const schedule = useQuery(api.scheduler.getCompanySchedule, { companyId });
  const agents = useQuery(api.agents.list);
  const scheduleSummary = useScheduleSummary();
  const saveCompanySchedule = useMutation(api.scheduler.saveCompanySchedule);
  const action = useAdminAction({ scope: "admin-company-data" });

  const [draft, setDraft] = useState<ScheduleDraft>(createDefaultScheduleDraft());
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Adopt the server's answer during render rather than in an effect, keyed on
  // the values themselves — the effect version painted a frame of the stale
  // schedule first.
  const scheduleKey = schedule === undefined
    ? null
    : `${schedule?._id ?? "none"}|${schedule?.intervalStr ?? ""}|${schedule?.isActive ?? ""}`;
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (scheduleKey !== null && scheduleKey !== seenKey) {
    setSeenKey(scheduleKey);
    setDraft(schedule ? hydrateScheduleDraft(schedule.intervalStr) : { ...createDefaultScheduleDraft(), cadence: "weekly" });
    setIsActive(schedule?.isActive ?? false);
  }

  const handleSave = async () => {
    setError("");
    setSaved(false);

    const problem = validateScheduleDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }

    const outcome = await action.run(
      async () => {
        await saveCompanySchedule({
          companyId,
          name: t("scheduleName", { company: company?.name ?? "" }),
          intervalStr: serializeScheduleDraft(draft),
          isActive,
        });
      },
      { suppressErrorToast: true, fallbackMessage: t("errors.saveFailed") },
    );

    if (outcome.ok) setSaved(true);
    else setError(outcome.message);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Clock className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <CollectNow
            companyId={companyId}
            companyName={company?.name ?? ""}
            collecting={schedule?.isActive === true}
            agents={agents}
          />
        }
      />

      <SettingsCard title={t("settingsTitle")}>
        <SettingSwitch
          label={t("collectionLabel")}
          description={t("collectionDescription")}
          checked={isActive}
          onChange={setIsActive}
        />

        {/*
          Four cadences, not the generic builder's seven. The format underneath
          is still the platform's own, so the dispatcher reads it unchanged —
          what is narrower is the choice, because an hourly SEO pull is money
          spent on numbers that have not moved.
        */}
        <div className="border-t border-border-dim pt-5">
          <SeoScheduleFields draft={draft} onChange={setDraft} />
        </div>

        <p className="border-t border-border-dim pt-4 text-[12px] text-secondary">
          {isActive
            ? t("summary", { schedule: scheduleSummary(serializeScheduleDraft(draft)) })
            : t("notCollecting")}
        </p>

        <SaveError>{error}</SaveError>

        <div className="flex justify-end border-t border-border-dim pt-4">
          <SaveAction
            onClick={handleSave}
            isSaving={action.isBusy()}
            label={t("save")}
            savingLabel={tCommon("saving")}
            successLabel={t("saved")}
            showSuccess={saved}
          />
        </div>
      </SettingsCard>

      <CollectionLimits companyId={companyId} />

      <CollectionCost companyId={companyId} />
    </div>
  );
}
