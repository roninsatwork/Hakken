"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { Button } from "@/src/ui/components/screens/Button";
import { ModalFormActions, ModalFormError } from "@/src/ui/components/screens/ModalForm";
import { SettingSwitch } from "@/src/ui/components/screens/SettingsCard";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";
import ScheduleBuilder from "@/src/app/(dashboard)/admin/_components/ScheduleBuilder";
import {
  createDefaultScheduleDraft,
  hydrateScheduleDraft,
  serializeScheduleDraft,
  validateScheduleDraft,
  type ScheduleDraft,
} from "@/src/app/(dashboard)/admin/_lib/scheduleConfig";
import { useScheduleSummary } from "@/src/app/(dashboard)/admin/_lib/useScheduleSummary";

export type WebsiteEffectiveSchedule = {
  active: boolean;
  intervalStr: string | null;
  source: "WEBSITE" | "COMPANY" | "NONE";
  nextRunAt: number | null;
};

type WebsiteScheduleOverrideProps = {
  companyWebsiteId: Id<"companyWebsites">;
  companyName: string | null;
  companyIntervalStr: string | null;
  stored: { refreshIntervalStr?: string; collectionEnabled?: boolean };
  effective: WebsiteEffectiveSchedule;
};

/**
 * This website's own schedule, or the company's.
 *
 * Built on the same `ScheduleBuilder` and the same `intervalStr` format the
 * Schedules screens use — one schedule vocabulary in the product, not two. What
 * is stored here is only the *difference* from the company: a website following
 * its company stores nothing, so changing the company moves it and an
 * overridden one stays put, with no backfill.
 *
 * The row says where its schedule came from, because a setting whose value is
 * inherited has to announce that. Otherwise the next person changes the
 * company, watches this website not move, and has nowhere to look.
 */
export function WebsiteScheduleOverride({
  companyWebsiteId,
  companyName,
  companyIntervalStr,
  stored,
  effective,
}: WebsiteScheduleOverrideProps) {
  const t = useTranslations("admin.companyWebsiteDetail");
  const tCommon = useTranslations("common");

  const scheduleSummary = useScheduleSummary();
  const setSchedule = useMutation(api.websites.setCompanyWebsiteSchedule);
  const action = useAdminAction({ scope: "admin-company-website-schedule" });

  const [isOpen, setIsOpen] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [draft, setDraft] = useState<ScheduleDraft>(createDefaultScheduleDraft());
  const [collecting, setCollecting] = useState(true);
  const [error, setError] = useState("");

  const open = () => {
    const hasOwn = Boolean(stored.refreshIntervalStr);
    setOverriding(hasOwn);
    setDraft(
      hydrateScheduleDraft(stored.refreshIntervalStr ?? companyIntervalStr ?? undefined),
    );
    setCollecting(stored.collectionEnabled ?? effective.active);
    setError("");
    setIsOpen(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (overriding) {
      const problem = validateScheduleDraft(draft);
      if (problem) {
        setError(problem);
        return;
      }
    }

    const outcome = await action.run(
      () => setSchedule({
        id: companyWebsiteId,
        // Absence is how a website says "follow the company", so not
        // overriding sends nothing rather than sending the company's current
        // value — sending it would freeze this website at today's schedule.
        refreshIntervalStr: overriding ? serializeScheduleDraft(draft) : undefined,
        collectionEnabled: overriding ? collecting : undefined,
      }),
      { suppressErrorToast: true, fallbackMessage: t("errors.settingsFailed") },
    );

    if (outcome.ok) setIsOpen(false);
    else setError(outcome.message);
  };

  const sourceLabel = () => {
    if (effective.source === "WEBSITE") return t("sourceWebsite");
    if (effective.source === "COMPANY") return t("sourceCompany", { company: companyName ?? "" });
    return t("sourceNone");
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border-dim bg-card/40 px-4 py-3">
        <Clock className="h-4 w-4 shrink-0 text-muted" />
        <StatusPill tone={effective.active ? "success" : "neutral"}>
          {effective.active ? t("collecting") : t("notCollecting")}
        </StatusPill>
        <span className="text-[13px] text-foreground">
          {effective.intervalStr ? scheduleSummary(effective.intervalStr) : t("noSchedule")}
        </span>
        <span className="text-[12px] text-muted">{sourceLabel()}</span>
        {effective.nextRunAt ? (
          <span className="text-[12px] text-secondary">
            {t("nextRun", { when: formatDateTime(effective.nextRunAt) })}
          </span>
        ) : null}
        <Button variant="ghost" onClick={open} className="ml-auto px-3 py-1 text-[12px]">
          {t("editSettings")}
        </Button>
      </div>

      <HakkenModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t("settingsTitle")}
        size="md"
      >
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-[15px] text-secondary">{t("settingsSubtitle")}</p>
          <ModalFormError>{error}</ModalFormError>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <SettingSwitch
            label={t("overrideLabel")}
            description={t("overrideDescription", { company: companyName ?? "" })}
            checked={overriding}
            onChange={setOverriding}
          />

          {overriding ? (
            <div className="flex flex-col gap-5 border-t border-border-dim pt-5">
              <SettingSwitch
                label={t("collectionLabel")}
                description={t("collectionDescription")}
                checked={collecting}
                onChange={setCollecting}
              />
              <ScheduleBuilder draft={draft} onChange={setDraft} targetKind="agent" />
            </div>
          ) : null}

          <ModalFormActions
            cancelLabel={tCommon("cancel")}
            submitLabel={action.isBusy() ? tCommon("saving") : tCommon("save")}
            isSubmitting={action.isBusy()}
            onCancel={() => setIsOpen(false)}
          />
        </form>
      </HakkenModal>
    </>
  );
}
