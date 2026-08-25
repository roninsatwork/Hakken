"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/src/ui/atoms/Button";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { formatModelTag } from "../_components/modelAdminUtils";

type ProviderUsage = {
  globalUseCases: string[];
  companyCount: number;
  isPartial: boolean;
};

type ModelProviderDisableDialogProps = {
  providerName: string;
  disableUsage: ProviderUsage | undefined;
  isDisabling: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ModelProviderDisableDialog({
  providerName,
  disableUsage,
  isDisabling,
  onClose,
  onConfirm,
}: ModelProviderDisableDialogProps) {
  const t = useTranslations("ai.models.providers");

  return (
    <SonaeModal
      isOpen
      onClose={onClose}
      title={t("switchOffTitle", { provider: providerName })}
      size="sm"
    >
      <div className="flex flex-col gap-5 px-1 pb-2">
        {/* This has to survive `disableUsage` being absent or a shape it does
            not recognise — not only the "still loading" case. A crash here
            takes the whole screen down, which is how this was found. */}
        {!disableUsage || !Array.isArray(disableUsage.globalUseCases) ? (
          <div className="flex items-center gap-2 text-[13px] text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("checkingUsage")}
          </div>
        ) : disableUsage.globalUseCases.length === 0 && !disableUsage.companyCount ? (
          <p className="text-[13px] leading-relaxed text-secondary">
            {t("disableSafe")}
          </p>
        ) : (
          <>
            {/* The old behaviour was the opposite of alarming: disabling a
                provider changed nothing at run time, so the button was safe
                and meaningless. Now it does what it says, this has to be
                said out loud. */}
            <p className="text-[13px] leading-relaxed text-secondary">
              {t.rich("disableWorking", {
                b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
              })}
            </p>
            {disableUsage.globalUseCases.length > 0 && (
              <p className="text-[12px] leading-relaxed text-muted">
                {t("platformJobs", { jobs: disableUsage.globalUseCases.map(formatModelTag).join(", ") })}
              </p>
            )}
            {disableUsage.companyCount > 0 && (
              <p className="text-[12px] leading-relaxed text-muted">
                {t("alsoChosen", { count: disableUsage.companyCount })}
              </p>
            )}
            {disableUsage.isPartial && (
              <p className="text-[12px] leading-relaxed text-muted">
                {t("maybeMore", { limit: 200 })}
              </p>
            )}
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="quiet"
            onClick={onClose}
            className="h-10 px-4 text-[13px] font-normal bg-transparent hover:bg-transparent"
          >
            {t("cancel")}
          </Button>
          <WriteButton
            type="button"
            onClick={onConfirm}
            disabled={isDisabling}
            className="h-10 px-4 rounded-[8px] bg-red-500 text-white text-[13px] font-medium hover:bg-red-600 disabled:opacity-50 flex items-center gap-2"
          >
            {isDisabling && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("switchItOff")}
          </WriteButton>
        </div>
      </div>
    </SonaeModal>
  );
}
