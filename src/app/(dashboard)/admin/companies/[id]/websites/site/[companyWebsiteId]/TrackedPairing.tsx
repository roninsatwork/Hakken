"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Select } from "@/src/ui/components/screens/Select";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";

/** The select's value for "not paired". A real id is never empty. */
const UNPAIRED = "";

type PairedWith = {
  companyWebsiteId: Id<"companyWebsites">;
  displayHost: string;
  locationLabel: string | null;
};

/**
 * Which of the company's own sites a tracked one is watched against.
 *
 * The one setting a tracked site has that an owned one does not, and the one
 * that decides the rest: paired, it is collected on its pair's day and from its
 * pair's place, because numbers pulled in different weeks are not a
 * comparison. So while it is paired this panel says so and the schedule and
 * place controls are not drawn at all — offering them would be offering
 * settings that nothing reads, which the server now refuses anyway.
 *
 * Unpaired is a real choice rather than a broken state. A company may watch a
 * site it has nothing of its own to compare with, and then it is collected on
 * its own settings like any hold.
 */
export function TrackedPairing({
  companyId,
  companyWebsiteId,
  pairedWith,
  nextRunAt,
}: {
  companyId: Id<"companies">;
  companyWebsiteId: Id<"companyWebsites">;
  pairedWith: PairedWith | null;
  nextRunAt: number | null;
}) {
  const t = useTranslations("admin.companyWebsiteDetail.pairing");
  const tDetail = useTranslations("admin.companyWebsiteDetail");
  const tCommon = useTranslations("common");

  const owned = useQuery(api.websiteAttachments.listCompanyOwnedWebsites, { companyId });
  const setPairing = useMutation(api.websiteAttachments.setTrackedPairing);
  const action = useAdminAction({ scope: "admin-tracked-pairing" });

  const stored = pairedWith?.companyWebsiteId ?? UNPAIRED;
  // Null means "untouched", so the saved pairing shows without an effect
  // copying it into state every time it changes underneath.
  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const value = choice ?? stored;

  const handleSave = async () => {
    setError("");
    setIsSaved(false);
    const outcome = await action.run(
      () => setPairing({
        id: companyWebsiteId,
        againstCompanyWebsiteId: value === UNPAIRED ? null : (value as Id<"companyWebsites">),
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
          <Link2 className="h-3.5 w-3.5" />
          {t("title")}
        </h2>
        <p className="max-w-3xl text-[13px] text-secondary">
          {pairedWith
            ? t("pairedSubtitle", { host: pairedWith.displayHost })
            : t("unpairedSubtitle")}
        </p>
      </div>

      {pairedWith ? (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-secondary">
          <span className="text-foreground">{t("collectedWith", { host: pairedWith.displayHost })}</span>
          {nextRunAt ? <span>{tDetail("nextRun", { when: formatDateTime(nextRunAt) })}</span> : null}
          {pairedWith.locationLabel ? <span>{t("from", { place: pairedWith.locationLabel })}</span> : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={value}
          onChange={(next) => {
            setChoice(next);
            setIsSaved(false);
          }}
          disabled={owned === undefined}
          aria-label={t("title")}
          className="w-full sm:w-[320px]"
        >
          {(owned ?? []).map((site) => (
            <option key={site.companyWebsiteId} value={site.companyWebsiteId}>
              {site.displayHost}
            </option>
          ))}
          <option value={UNPAIRED}>{t("none")}</option>
        </Select>

        <SaveAction
          onClick={handleSave}
          isSaving={action.isBusy()}
          disabled={value === stored}
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
