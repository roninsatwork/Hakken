"use client";

import type { FormEvent } from "react";
import { useTranslations } from "next-intl";

import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { ModalFormActions, ModalFormError } from "@/src/ui/components/screens/ModalForm";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldHint, FieldLabel, SegmentedChoice } from "@/src/ui/components/screens/SettingsCard";
import { HostField } from "@/src/app/(dashboard)/admin/_components/HostField";

/** Whether the company owns a site or watches somebody else's. */
export type Holding = "OWNED" | "TRACKED";

/** One of the company's own sites, as a pairing choice. */
export type OwnedSiteOption = { companyWebsiteId: string; displayHost: string };

/** The select's value for "not paired". A real id is never empty. */
export const UNPAIRED = "";

type AddCompanyWebsiteDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  onUrlChange: (url: string) => void;
  holding: Holding;
  onHoldingChange: (holding: Holding) => void;
  againstId: string;
  onAgainstChange: (companyWebsiteId: string) => void;
  /** Undefined while loading; the pairing choice waits rather than guessing. */
  ownedSites: OwnedSiteOption[] | undefined;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  submitError: string;
};

/**
 * Put a website on a company's list, as one it owns or one it watches.
 *
 * The whole of a company's relationship to a site, and nothing more. Anthony,
 * 2026-09-22: *"in a company you set which you own and which you track. This
 * comes from the global pool or you add one new into the pool."* The host field
 * says which of those it is before anything is saved.
 *
 * A tracked site asks one further thing — which of the company's own sites it
 * is watched against — because that is what decides the day it is collected.
 * It may be none, and then it is collected on its own.
 */
export function AddCompanyWebsiteDialog({
  isOpen,
  onClose,
  url,
  onUrlChange,
  holding,
  onHoldingChange,
  againstId,
  onAgainstChange,
  ownedSites,
  onSubmit,
  isSubmitting,
  submitError,
}: AddCompanyWebsiteDialogProps) {
  const t = useTranslations("admin.companyWebsites");
  const tCommon = useTranslations("common");

  const tracking = holding === "TRACKED";
  const hasOwnSites = (ownedSites?.length ?? 0) > 0;

  return (
    <HakkenModal isOpen={isOpen} onClose={onClose} title={t("addTitle")} size="md">
      <div className="mb-6 flex flex-col gap-2">
        <p className="text-[15px] text-secondary">{t("addSubtitle")}</p>
        <ModalFormError>{submitError}</ModalFormError>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <HostField
          label={t("urlLabel")}
          placeholder={t("urlPlaceholder")}
          value={url}
          onChange={onUrlChange}
          labels={{
            savedAs: (host) => t("savedAs", { host }),
            alreadyKnown: t("alreadyKnown"),
            newWebsite: t("newWebsite"),
            inherits: (counts) => t("inherits", counts),
          }}
        />

        <div className="flex flex-col gap-2">
          <FieldLabel>{t("holdingLabel")}</FieldLabel>
          <SegmentedChoice<Holding>
            label={t("holdingLabel")}
            value={holding}
            onChange={onHoldingChange}
            options={[
              { value: "OWNED", label: t("holdingOwned") },
              { value: "TRACKED", label: t("holdingTracked") },
            ]}
          />
          <FieldHint>{tracking ? t("holdingTrackedHint") : t("holdingOwnedHint")}</FieldHint>
        </div>

        {tracking && ownedSites !== undefined ? (
          hasOwnSites ? (
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="tracked-against">{t("againstLabel")}</FieldLabel>
              <Select
                id="tracked-against"
                value={againstId}
                onChange={onAgainstChange}
                className="w-full"
                selectClassName="w-full"
              >
                {ownedSites.map((site) => (
                  <option key={site.companyWebsiteId} value={site.companyWebsiteId}>
                    {site.displayHost}
                  </option>
                ))}
                <option value={UNPAIRED}>{t("againstNone")}</option>
              </Select>
            </div>
          ) : (
            <FieldHint>{t("noOwnedSites")}</FieldHint>
          )
        ) : null}

        <ModalFormActions
          cancelLabel={tCommon("cancel")}
          submitLabel={isSubmitting ? tCommon("saving") : tracking ? t("addTracked") : t("add")}
          isSubmitting={isSubmitting}
          onCancel={onClose}
        />
      </form>
    </HakkenModal>
  );
}

type RemoveCompanyWebsiteDialogProps = {
  host: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
  error: string;
};

/**
 * Remove, which is not delete.
 *
 * The website record, its data and every competitor record survive — what goes
 * is this company's hold on them. The two actions read alike on a screen and
 * mean very different things, so this one says which it is.
 */
export function RemoveCompanyWebsiteDialog({
  host,
  onClose,
  onConfirm,
  isSubmitting,
  error,
}: RemoveCompanyWebsiteDialogProps) {
  const t = useTranslations("admin.companyWebsites");
  const tCommon = useTranslations("common");

  return (
    <ConfirmationModal
      isOpen={host !== null}
      onClose={onClose}
      title={t("removeTitle")}
      cancelLabel={tCommon("cancel")}
      confirmLabel={isSubmitting ? tCommon("deleting") : t("removeWebsite")}
      isSubmitting={isSubmitting}
      onConfirm={onConfirm}
      error={error}
      warning={{ title: t("removeWarningTitle"), description: t("removeWarningBody") }}
    >
      <p>
        {t.rich("removeConfirm", {
          host: host ?? "",
          highlight: (chunks) => (
            <strong className="font-semibold text-foreground">{chunks}</strong>
          ),
        })}
      </p>
    </ConfirmationModal>
  );
}
