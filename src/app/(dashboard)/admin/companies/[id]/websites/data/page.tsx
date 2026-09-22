"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Clock, Info } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
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
import { CollectionCost } from "./CollectionCost";

/**
 * When this company's SEO data gets collected.
 *
 * **This is the ordinary schedule system, looked at from the company.** The row
 * behind it is a `schedules` row like any other: the same dispatcher wakes it,
 * the same `intervalStr` format describes it, the same `ScheduleBuilder` edits
 * it, and the run it starts appears in the agent's runs, logs and costs
 * alongside every other run.
 *
 * It did not begin that way. The first version invented a cadence enum, an
 * active flag and a next-run calculation of its own, none of which any
 * dispatcher read — a settings form that nothing acted on. Anthony, 2026-09-21:
 * *"why does this not work like the agent schedules — I did say re-use, don't
 * build new."* The parallel machinery was deleted rather than wired up.
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
  const createSchedule = useMutation(api.scheduler.createSchedule);
  const updateSchedule = useMutation(api.scheduler.updateSchedule);
  const createAgentFromTemplate = useMutation(api.agents.createAgentFromTemplate);
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

  // The fetcher is an ordinary agent, found by the name its template gives it,
  // so this screen needs no notion of its own about which agent collects data.
  const collectorAgent = agents?.find((agent) => agent.name === "DataForSEO Agent");
  const canSchedule = Boolean(schedule || collectorAgent);

  /**
   * Create the collecting agent from its template.
   *
   * It arrives inactive, like every agent created from a template, so nothing
   * starts spending the moment this is pressed. The schedule below is what
   * turns collection on, and it is a separate deliberate act.
   */
  const handleCreateAgent = async () => {
    setError("");

    const outcome = await action.run(
      async () => {
        await createAgentFromTemplate({ templateId: "dataforseo-agent" });
      },
      {
        key: "create-agent",
        suppressErrorToast: true,
        fallbackMessage: t("errors.createAgentFailed"),
      },
    );

    if (!outcome.ok) setError(outcome.message);
  };

  const handleSave = async () => {
    setError("");
    setSaved(false);

    const problem = validateScheduleDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    if (!schedule && !collectorAgent) {
      setError(t("noAgentBody"));
      return;
    }

    const intervalStr = serializeScheduleDraft(draft);
    const outcome = await action.run(
      async () => {
        if (schedule) {
          await updateSchedule({
            scheduleId: schedule._id,
            name: schedule.name,
            agentId: schedule.agentId,
            companyId,
            intervalStr,
            isActive,
          });
          return;
        }
        await createSchedule({
          name: t("scheduleName", { company: company?.name ?? "" }),
          agentId: collectorAgent!._id,
          companyId,
          intervalStr,
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
      />

      {/*
        The banner used to end at "create one from its template in the Agents
        section", which was an instruction nobody could follow: the template
        picker was taken off the new-agent screen, so no screen created an
        agent from a template at all. The button is here rather than a link
        because there is exactly one template this screen can mean, and asking
        someone to go and find it is asking them to do the lookup the screen
        has already done.
      */}
      {!canSchedule ? (
        <div className="flex flex-wrap items-start gap-3 rounded-[12px] border border-border-dim bg-card/40 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="flex min-w-[16rem] flex-1 flex-col gap-1">
            <span className="text-[13px] font-medium text-foreground">{t("noAgentTitle")}</span>
            <span className="max-w-2xl text-[12px] leading-relaxed text-muted">{t("noAgentBody")}</span>
          </div>
          <Button
            variant="accent"
            className="ml-auto shrink-0 px-3 py-1.5 text-[12px]"
            onClick={handleCreateAgent}
            disabled={action.isBusy("create-agent")}
          >
            {t("createAgent")}
          </Button>
        </div>
      ) : null}

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

      <CollectionCost companyId={companyId} />
    </div>
  );
}
