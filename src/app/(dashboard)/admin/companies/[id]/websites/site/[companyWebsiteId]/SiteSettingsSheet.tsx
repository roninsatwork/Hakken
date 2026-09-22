"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_LOCATION_CODE, SEO_LOCATIONS } from "@/convex/utils/seoLocations";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { ModalFormActions, ModalFormError } from "@/src/ui/components/screens/ModalForm";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldHint, FieldLabel, SettingSwitch } from "@/src/ui/components/screens/SettingsCard";
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
 * One sheet for both, opened from the site's header, where they used to be two
 * panels down the page. The schedule is built on `SeoScheduleFields`, the same
 * control the company screen uses — four cadences, no hourly pull, no list of
 * exact times, because every pull is money on a service billed per call. What
 * is stored is only the *difference* from the company: a site following its
 * company stores nothing, so changing the company moves it.
 *
 * Its data is read only while it is open. The header every tab draws carries
 * what the header says and no more.
 */
export function SiteSettingsSheet({
  isOpen,
  onClose,
  companyWebsiteId,
  host,
}: {
  isOpen: boolean;
  onClose: () => void;
  companyWebsiteId: Id<"companyWebsites">;
  host: string;
}) {
  const t = useTranslations("admin.companyWebsiteDetail");
  const tPlace = useTranslations("admin.companyWebsiteDetail.location");
  const tCommon = useTranslations("common");

  const website = useQuery(api.websites.getCompanyWebsiteById, isOpen ? { id: companyWebsiteId } : "skip");
  const scheduleSummary = useScheduleSummary();
  const setSchedule = useMutation(api.websites.setCompanyWebsiteSchedule);
  const setLocation = useMutation(api.websites.setCompanyWebsiteLocation);
  const action = useAdminAction({ scope: "admin-site-settings" });

  // Adopted once per opening, keyed on the row's id and its stored values, so
  // an edit in progress survives the query refreshing underneath it.
  const adoptKey = website
    ? `${website._id}:${website.refreshIntervalStr ?? ""}:${String(website.collectionEnabled)}:${website.locationCode ?? ""}`
    : null;
  const [adopted, setAdopted] = useState<string | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [draft, setDraft] = useState<ScheduleDraft>(createDefaultScheduleDraft());
  const [collecting, setCollecting] = useState(true);
  const [place, setPlace] = useState<number>(DEFAULT_LOCATION_CODE);
  const [error, setError] = useState("");

  if (isOpen && website && adoptKey !== adopted) {
    setAdopted(adoptKey);
    setOverriding(Boolean(website.refreshIntervalStr));
    setDraft(hydrateSeoDraft(website.refreshIntervalStr ?? website.companyIntervalStr));
    setCollecting(website.collectionEnabled ?? website.effective.active);
    setPlace(website.locationCode ?? DEFAULT_LOCATION_CODE);
    setError("");
  }

  const close = () => {
    setAdopted(null);
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!website) return;
    setError("");

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

    if (outcome.ok) close();
    else setError(outcome.message);
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
    <HakkenModal isOpen={isOpen} onClose={close} title={t("settingsTitle")} size="lg">
      <div className="mb-6 flex flex-col gap-2">
        <p className="text-[15px] text-secondary">{t("settingsSubtitle")}</p>
        <ModalFormError>{error}</ModalFormError>
      </div>

      {website === undefined ? (
        <p className="text-[13px] text-secondary">{t("loading")}</p>
      ) : website === null ? (
        <p className="text-[13px] text-destructive">{t("notFound")}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <SettingSwitch
            label={t("overrideLabel")}
            description={t("overrideDescription", { company: website.companyName ?? "" })}
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

          <div className="flex flex-col gap-2 border-t border-border-dim pt-5">
            <FieldLabel htmlFor="site-place">{tPlace("title")}</FieldLabel>
            <Select
              id="site-place"
              value={place}
              onChange={(value) => setPlace(Number(value))}
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

          <ModalFormActions
            cancelLabel={tCommon("cancel")}
            submitLabel={action.isBusy() ? tCommon("saving") : tCommon("save")}
            isSubmitting={action.isBusy()}
            onCancel={close}
          />
        </form>
      )}
    </HakkenModal>
  );
}
