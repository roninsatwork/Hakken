"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Select } from "@/src/ui/components/screens/Select";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { DEFAULT_LOCATION_CODE, SEO_LOCATIONS } from "@/convex/utils/seoLocations";

/**
 * Where this company watches this website from.
 *
 * **On the company's view rather than the shared website record, because here
 * two companies genuinely do differ.** A London agency and a Manchester one
 * tracking the same host care about different places, which is the opposite of
 * brand names and is why the two settings live on different screens.
 *
 * A picked list rather than a free-text box. DataForSEO's own catalogue runs to
 * tens of thousands of places, and a typed code that does not exist returns
 * nothing while still being charged for.
 */
export function WatchLocation({
  companyWebsiteId,
  savedCode,
}: {
  companyWebsiteId: Id<"companyWebsites">;
  savedCode: number | undefined;
}) {
  const t = useTranslations("admin.companyWebsiteDetail.location");
  const tCommon = useTranslations("common");
  const setLocation = useMutation(api.websites.setCompanyWebsiteLocation);
  const action = useAdminAction({ scope: "admin-website-location" });

  // Null means "untouched", so the saved place shows without an effect
  // copying it into state after paint — which drew one frame of the old value
  // every time it changed underneath.
  const [choice, setChoice] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const code = choice ?? savedCode ?? DEFAULT_LOCATION_CODE;

  const handleSave = async () => {
    setError("");
    setIsSaved(false);

    const chosen = SEO_LOCATIONS.find((location) => location.code === code);
    // Choosing the default is how a website goes back to inheriting it, so it
    // is stored as absence rather than as the code itself.
    const isDefault = code === DEFAULT_LOCATION_CODE;

    const outcome = await action.run(
      () => setLocation({
        companyWebsiteId,
        locationCode: isDefault ? null : code,
        locationLabel: isDefault ? null : chosen?.label ?? null,
      }),
      { suppressErrorToast: true, fallbackMessage: t("errors.saveFailed") },
    );

    if (outcome.ok) {
      setChoice(null);
      setIsSaved(true);
    } else {
      setError(outcome.message);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-border-dim bg-card/40 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          <MapPin className="h-3.5 w-3.5" />
          {t("title")}
        </h2>
        <p className="max-w-3xl text-[13px] text-secondary">{t("subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={code}
          onChange={(value) => {
            setChoice(Number(value));
            setIsSaved(false);
          }}
          aria-label={t("title")}
          className="w-full sm:w-[280px]"
        >
          {SEO_LOCATIONS.map((location) => (
            <option key={location.code} value={location.code}>
              {location.label}
            </option>
          ))}
        </Select>

        <SaveAction
          onClick={handleSave}
          isSaving={action.isBusy()}
          label={t("save")}
          savingLabel={tCommon("saving")}
          successLabel={t("saved")}
          showSuccess={isSaved}
        />
      </div>

      <SaveError>{error}</SaveError>
    </div>
  );
}
