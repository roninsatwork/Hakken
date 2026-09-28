"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_LOCATION_CODE, SEO_LOCATIONS } from "@/convex/utils/seoLocations";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldHint, FieldLabel, SettingsCard, SettingSwitch } from "@/src/ui/components/screens/SettingsCard";
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

/** The cadences the SEO control offers. Anything else cannot be drawn by it. */
const SEO_CADENCES = new Set(["daily", "weekly", "fortnightly", "monthly"]);

/**
 * Coerce whatever is stored into something this control can actually draw.
 *
 * A website may hold an interval the old generic builder wrote — hourly, or a
 * list of exact times — because that builder offered both and nothing on the
 * server refused them. Opening such a row without this would show four
 * cadence cards with none selected, which is the silent-wrong-state bug the
 * rebuild removed. Weekly is the recommended cadence.
 */
function hydrateSeoDraft(intervalStr?: string | null): ScheduleDraft {
  const draft = hydrateScheduleDraft(intervalStr);
  if (draft.mode !== "recurring" || !SEO_CADENCES.has(draft.cadence)) {
    return { ...draft, mode: "recurring", cadence: "weekly" };
  }
  return draft;
}

/**
 * How often this site is collected, and where from — the two settings that
 * genuinely differ between two companies watching one host.
 *
 * A card on the website's Schedule and limits page, beside how much of it is
 * kept (docs/plans/active/websites-section-menu-plan.md) — it was a dialog in
 * the website's header until 2026-09-28, one of four places its settings sat.
 * The schedule is built on `SeoScheduleFields`, the same control the company
 * screen uses — four cadences, no hourly pull, no list of exact times, because
 * every pull is money on a service billed per call. What is stored is only the
 * *difference* from the company: a site following its company stores nothing,
 * so changing the company moves it.
 */
export function SiteSchedule({
  companyWebsiteId,
  host,
}: {
  companyWebsiteId: Id<"companyWebsites">;
  host: string;
}) {
  const t = useTranslations("admin.companyWebsiteDetail");
  const tPlace = useTranslations("admin.companyWebsiteDetail.location");
  const tCommon = useTranslations("common");

  const website = useQuery(api.websites.getCompanyWebsiteById, { id: companyWebsiteId });
  const scheduleSummary = useScheduleSummary();
  const setSchedule = useMutation(api.websites.setCompanyWebsiteSchedule);
  const setLocation = useMutation(api.websites.setCompanyWebsiteLocation);
  const action = useAdminAction({ scope: "admin-site-settings" });

  // Adopted once per saved state, keyed on the row's id and its stored values,
  // so an edit in progress survives the query refreshing underneath it.
  const adoptKey = website
    ? `${website._id}:${website.refreshIntervalStr ?? ""}:${String(website.collectionEnabled)}:${website.locationCode ?? ""}`
    : null;
  const [adopted, setAdopted] = useState<string | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [draft, setDraft] = useState<ScheduleDraft>(createDefaultScheduleDraft());
  const [collecting, setCollecting] = useState(true);
  const [place, setPlace] = useState<number>(DEFAULT_LOCATION_CODE);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (website && adoptKey !== adopted) {
    setAdopted(adoptKey);
    setOverriding(Boolean(website.refreshIntervalStr));
    setDraft(hydrateSeoDraft(website.refreshIntervalStr ?? website.companyIntervalStr));
    setCollecting(website.collectionEnabled ?? website.effective.active);
    setPlace(website.locationCode ?? DEFAULT_LOCATION_CODE);
    setError("");
  }

  const handleSave = async () => {
    if (!website) return;
    setError("");
    setSaved(false);

    if (overriding) {
      const problem = validateScheduleDraft(draft);
      if (problem) {
        setError(problem);
        return;
      }
    }

    const savedPlace = website.locationCode ?? DEFAULT_LOCATION_CODE;
    const chosen = SEO_LOCATIONS.find((location) => location.code === place);
    const outcome = await action.run(
      async () => {
        await setSchedule({
          id: companyWebsiteId,
          // Absence is how a site says "follow the company", so not overriding
          // sends nothing rather than freezing it at today's company schedule.
          refreshIntervalStr: overriding ? serializeScheduleDraft(draft) : undefined,
          collectionEnabled: overriding ? collecting : undefined,
        });
        if (place !== savedPlace) {
          const isDefault = place === DEFAULT_LOCATION_CODE;
          await setLocation({
            companyWebsiteId,
            locationCode: isDefault ? null : place,
            locationLabel: isDefault ? null : chosen?.label ?? null,
          });
        }
      },
      { suppressErrorToast: true, fallbackMessage: t("errors.settingsFailed") },
    );

    if (outcome.ok) setSaved(true);
    else setError(outcome.message);
  };

  const touched = <Value,>(set: (value: Value) => void) => (value: Value) => {
    set(value);
    setSaved(false);
  };

  const summary = () => {
    if (!website) return "";
    if (!overriding) {
      return website.companyIntervalStr
        ? t("summaryFollows", {
          host,
          company: website.companyName ?? "",
          schedule: scheduleSummary(website.companyIntervalStr),
        })
        : t("nothingScheduled", { host });
    }
    if (!collecting) return t("nothingScheduled", { host });
    return t("summaryOwn", { host, schedule: scheduleSummary(serializeScheduleDraft(draft)) });
  };

  return (
    <SettingsCard title={t("settingsTitle")}>
      <p className="max-w-2xl text-[12px] leading-relaxed text-secondary">{t("settingsSubtitle")}</p>

      {website === undefined ? (
        <p className="text-[13px] text-secondary">{t("loading")}</p>
      ) : website === null ? (
        <p className="text-[13px] text-destructive">{t("notFound")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <SettingSwitch
            label={t("overrideLabel")}
            description={t("overrideDescription", { company: website.companyName ?? "" })}
            checked={overriding}
            onChange={touched(setOverriding)}
          />

          {overriding ? (
            <div className="flex flex-col gap-5 border-t border-border-dim pt-5">
              <SettingSwitch
                label={t("collectionLabel")}
                description={t("collectionDescription")}
                checked={collecting}
                onChange={touched(setCollecting)}
              />
              {collecting ? <SeoScheduleFields draft={draft} onChange={touched(setDraft)} /> : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-border-dim pt-5">
            <FieldLabel htmlFor="site-place">{tPlace("title")}</FieldLabel>
            <Select
              id="site-place"
              value={place}
              onChange={(value) => touched(setPlace)(Number(value))}
              className="w-full sm:w-[320px]"
            >
              {SEO_LOCATIONS.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.label}
                </option>
              ))}
            </Select>
            <FieldHint>{tPlace("subtitle")}</FieldHint>
          </div>

          <div className="flex flex-col gap-2 border-t border-border-dim pt-4">
            <p className="text-[13px] text-foreground">{summary()}</p>
            <p className="text-[12px] text-muted">{t("competitorsFollow")}</p>
            <p className="text-[12px] text-muted">{t("askedLive")}</p>
          </div>

          <SaveError>{error}</SaveError>

          <div className="flex justify-end border-t border-border-dim pt-4">
            <SaveAction
              onClick={handleSave}
              isSaving={action.isBusy()}
              label={tCommon("save")}
              savingLabel={tCommon("saving")}
              successLabel={t("saved")}
              showSuccess={saved}
            />
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
