"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, Share2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Field } from "@/src/ui/components/screens/Field";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { BrandNames } from "./BrandNames";

/**
 * What this website is: its names, and what it does.
 *
 * Both are facts about the host by the same test — two companies watching it
 * would write down the same answer — so both are shared with every client
 * attached, and the notice at the top says so rather than leaving anyone to
 * find out. What is *not* shared is who is watching, which is why that list is
 * a tab of its own and nothing here names a company.
 */
export default function WebsiteProfilePage() {
  const t = useTranslations("admin.websiteDetail");
  const tProfile = useTranslations("admin.websiteDetail.profile");
  const tCommon = useTranslations("common");
  const params = useParams();
  const websiteId = params.websiteId as Id<"websites">;

  const website = useQuery(api.websites.getWebsiteById, { id: websiteId });
  const setProfile = useMutation(api.websiteCanonical.setWebsiteProfile);
  const action = useAdminAction({ scope: "admin-website-profile" });

  const [sector, setSector] = useState("");
  const [marketLabel, setMarketLabel] = useState("");
  const [error, setError] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  // Adopted during render, keyed on the values themselves, rather than in an
  // effect: the effect version paints a frame of the stale profile first, and
  // cascades a second render to correct it.
  const [seenKey, setSeenKey] = useState<string | null>(null);
  const savedKey = website === undefined
    ? null
    : `${website?.sector ?? ""}|${website?.marketLabel ?? ""}`;
  if (savedKey !== null && savedKey !== seenKey) {
    setSeenKey(savedKey);
    setSector(website?.sector ?? "");
    setMarketLabel(website?.marketLabel ?? "");
  }

  if (website === undefined) {
    return <p className="text-[13px] text-secondary">{t("loading")}</p>;
  }
  if (website === null) {
    return <p className="text-[13px] text-destructive">{t("notFound")}</p>;
  }

  const handleSave = async () => {
    setError("");
    setIsSaved(false);

    const outcome = await action.run(
      () => setProfile({
        websiteId,
        // Empty clears it. Somebody who does not know the sector should be
        // able to say so, and a wrong one is worse than none.
        sector: sector.trim().length > 0 ? sector : null,
        marketLabel: marketLabel.trim().length > 0 ? marketLabel : null,
      }),
      { suppressErrorToast: true, fallbackMessage: tProfile("errors.saveFailed") },
    );

    if (outcome.ok) setIsSaved(true);
    else setError(outcome.message);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <div className="flex items-start gap-3 rounded-[12px] border border-border-dim bg-card/40 px-4 py-3">
        <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <p className="text-[13px] leading-relaxed text-secondary">{t("sharedNotice")}</p>
      </div>

      <BrandNames websiteId={websiteId} saved={website.brandNames ?? []} />

      <PageHeader
        icon={<Building2 className="h-6 w-6 text-brand" />}
        title={tProfile("title")}
        description={tProfile("subtitle")}
      />

      <div className="flex flex-col gap-4 rounded-[12px] border border-border-dim bg-card/40 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="website-sector"
            label={tProfile("sectorLabel")}
            value={sector}
            placeholder={tProfile("sectorPlaceholder")}
            onChange={(event) => {
              setSector(event.target.value);
              setIsSaved(false);
            }}
          />
          <Field
            id="website-market"
            label={tProfile("marketLabel")}
            value={marketLabel}
            placeholder={tProfile("marketPlaceholder")}
            onChange={(event) => {
              setMarketLabel(event.target.value);
              setIsSaved(false);
            }}
          />
        </div>

        <SaveError>{error}</SaveError>

        <div className="flex justify-end">
          <SaveAction
            onClick={handleSave}
            isSaving={action.isBusy()}
            label={tProfile("save")}
            savingLabel={tCommon("saving")}
            successLabel={tProfile("saved")}
            showSuccess={isSaved}
          />
        </div>
      </div>
    </div>
  );
}
