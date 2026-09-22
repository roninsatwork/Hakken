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
import { SeoScheduleFields } from "@/src/app/(dashboard)/admin/_components/SeoScheduleFields";
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
  /**
   * `PAIR` is a tracked site collected on its pair's day. This control is not
   * drawn for one — it has no schedule of its own to change — but the type
   * says it can arrive rather than pretending it cannot.
   */
  source: "WEBSITE" | "COMPANY" | "NONE" | "PAIR";
  nextRunAt: number | null;
};

type WebsiteScheduleOverrideProps = {
  companyWebsiteId: Id<"companyWebsites">;
  companyName: string | null;
  companyIntervalStr: string | null;
  stored: { refreshIntervalStr?: string; collectionEnabled?: boolean };
  effective: WebsiteEffectiveSchedule;
  host: string;
};

/** The cadences the SEO control offers. Anything else cannot be drawn by it. */
const SEO_CADENCES = new Set(["daily", "weekly", "fortnightly", "monthly"]);

/**
 * Coerce whatever is stored into something this control can actually draw.
 *
 * A website may hold an interval the old generic builder wrote — hourly, or a
 * list of exact times — because that builder offered both and nothing on the
 * server refused them. Opening such a row here without this would show four
 * cadence cards with none selected, which is precisely the silent-wrong-state
 * bug this rebuild exists to remove. Weekly is the recommended cadence and the
 * one the company screen defaults to.
 */
function hydrateSeoDraft(intervalStr?: string | null): ScheduleDraft {
  const draft = hydrateScheduleDraft(intervalStr);
  if (draft.mode !== "recurring" || !SEO_CADENCES.has(draft.cadence)) {
    return { ...draft, mode: "recurring", cadence: "weekly" };
  }
  return draft;
}

/**
 * This website's own schedule, or the company's.
 *
 * **Built on `SeoScheduleFields`, the same control the company screen one level
 * up uses.** It was built on the generic `ScheduleBuilder` until 2026-09-22,
 * which was the wrong control twice over: that builder is written for workflows
 * and offers an hourly pull and a list of exact times, both of which are money
 * on a service billed per call, and the narrow SEO control exists precisely
 * because Anthony rejected it for this job — *"this goes against the webhook
 * and slower cheaper method of DataForSEO does it not."* The website screen
 * then reintroduced everything that decision removed.
 *
 * It also said the wrong word. The builder's summary is written for agents and
 * workflows, so an override announced "This **agent** will execute Weekly on
 * Monday" about a website; and fortnightly, which the company screen offers,
 * was missing from the builder's four buttons, so a fortnightly company opened
 * here showed no cadence selected and read back as daily while still saving as
 * fortnightly. The sentence below is written about the website instead, and the
 * cadences are the same four at both levels.
 *
 * What is stored is only the *difference* from the company: a website following
 * its company stores nothing, so changing the company moves it and an
 * overridden one stays put, with no backfill.
 */
export function WebsiteScheduleOverride({
  companyWebsiteId,
  companyName,
  companyIntervalStr,
  stored,
  effective,
  host,
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
    setDraft(hydrateSeoDraft(stored.refreshIntervalStr ?? companyIntervalStr));
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

  /*
    The sentence names this website, and says whether its competitors come with
    it. Both matter: a rival pulled in a different week is not a comparison, and
    the reader is deciding whether to break this site away from its company.
  */
  const draftSummary = () => {
    if (!overriding) {
      return companyIntervalStr
        ? t("summaryFollows", {
          host,
          company: companyName ?? "",
          schedule: scheduleSummary(companyIntervalStr),
        })
        : t("nothingScheduled", { host });
    }
    if (!collecting) return t("nothingScheduled", { host });
    return t("summaryOwn", { host, schedule: scheduleSummary(serializeScheduleDraft(draft)) });
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
        size="lg"
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
              {collecting ? <SeoScheduleFields draft={draft} onChange={setDraft} /> : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-border-dim pt-4">
            <p className="text-[13px] text-foreground">{draftSummary()}</p>
            <p className="text-[12px] text-muted">{t("competitorsFollow")}</p>
            <p className="text-[12px] text-muted">{t("askedLive")}</p>
          </div>

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
