"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { IdCard } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { Notice } from "@/src/ui/components/screens/Notice";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { HoldBrandNames } from "./HoldBrandNames";

/** What the business does, at most: every judgment about the site carries it. */
const MAX_DESCRIPTION = 600;

/**
 * Profile: what this company says about one of its websites
 * (docs/plans/active/company-level-website-facts-plan.md, CL7) — the names
 * AI answers are read for, and for its own websites what the business is,
 * which the AI judgments read. This company's own: no other company watching
 * the website sees them. Until 2026-09-28 both sat on the shared website
 * record, set once for everyone watching the host.
 */
export default function CompanySiteProfilePage() {
  const t = useTranslations("admin.siteView.profile");
  const tCommon = useTranslations("common");
  const params = useParams();
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const profile = useQuery(api.holdProfiles.getHoldProfile, { companyWebsiteId });
  const setProfile = useMutation(api.holdProfiles.setHoldBusinessProfile);
  const action = useAdminAction({ scope: "admin-hold-profile" });

  const [sector, setSector] = useState("");
  const [marketLabel, setMarketLabel] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  // Adopted during render, keyed on the saved values, rather than in an effect.
  const [seenKey, setSeenKey] = useState<string | null>(null);
  const savedKey = profile ? `${profile.sector ?? ""}|${profile.marketLabel ?? ""}|${profile.businessDescription ?? ""}` : null;
  if (savedKey !== null && savedKey !== seenKey) {
    setSeenKey(savedKey);
    setSector(profile?.sector ?? "");
    setMarketLabel(profile?.marketLabel ?? "");
    setDescription(profile?.businessDescription ?? "");
  }

  if (profile === undefined) return null;
  if (profile === null) return <p className="text-[13px] text-destructive">{t("notFound")}</p>;

  const handleSave = async () => {
    setError("");
    setIsSaved(false);
    const outcome = await action.run(
      () => setProfile({
        companyWebsiteId,
        sector: sector.trim().length > 0 ? sector : null,
        marketLabel: marketLabel.trim().length > 0 ? marketLabel : null,
        description: description.trim().length > 0 ? description : null,
      }),
      { suppressErrorToast: true, fallbackMessage: t("business.errors.saveFailed") },
    );
    if (outcome.ok) setIsSaved(true);
    else setError(outcome.message);
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        icon={<IdCard className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={profile.owned ? t("subtitle") : t("subtitleCompetitor", { host: profile.host })}
      />

      <Notice>{t("ownNotice", { host: profile.host })}</Notice>

      <HoldBrandNames companyWebsiteId={companyWebsiteId} saved={profile.brandNames} />

      {profile.owned ? (
        <SettingsCard title={t("business.title")}>
          <p className="max-w-2xl text-[12px] leading-relaxed text-secondary">{t("business.subtitle")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="hold-sector"
              label={t("business.sectorLabel")}
              value={sector}
              placeholder={t("business.sectorPlaceholder")}
              onChange={(event) => {
                setSector(event.target.value);
                setIsSaved(false);
              }}
            />
            <Field
              id="hold-market"
              label={t("business.marketLabel")}
              value={marketLabel}
              placeholder={t("business.marketPlaceholder")}
              onChange={(event) => {
                setMarketLabel(event.target.value);
                setIsSaved(false);
              }}
            />
          </div>
          <TextAreaField
            id="hold-description"
            label={t("business.descriptionLabel")}
            hint={t("business.descriptionHint")}
            rows={3}
            maxLength={MAX_DESCRIPTION}
            value={description}
            placeholder={t("business.descriptionPlaceholder")}
            onChange={(event) => {
              setDescription(event.target.value);
              setIsSaved(false);
            }}
          />
          <SaveError>{error}</SaveError>
          <div className="flex justify-end">
            <SaveAction
              onClick={handleSave}
              isSaving={action.isBusy()}
              label={t("business.save")}
              savingLabel={tCommon("saving")}
              successLabel={t("business.saved")}
              showSuccess={isSaved}
            />
          </div>
        </SettingsCard>
      ) : null}
    </div>
  );
}
