"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatModelTag } from "../_components/modelAdminUtils";
import { Button } from "@/src/ui/components/screens/Button";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";

type DefaultModelConfirmationProps = {
  allJobs: readonly string[];
  isEnabled: boolean;
  isOpen: boolean;
  isSubmitting: boolean;
  modelName: string;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DefaultModelConfirmation({
  allJobs,
  isEnabled,
  isOpen,
  isSubmitting,
  modelName,
  onClose,
  onConfirm,
}: DefaultModelConfirmationProps) {
  const t = useTranslations("ai.models.detail");

  return (
    <HakkenModal isOpen={isOpen} onClose={onClose} title={t("modalTitle")} size="sm">
      <div className="flex flex-col gap-5 px-1 pb-2">
        <p className="text-[13px] leading-relaxed text-secondary">
          {t.rich("modalWillHandle", {
            model: modelName,
            b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
          })}
        </p>
        <p className="text-[12px] leading-relaxed text-muted">
          {t("modalJobs", { jobs: allJobs.map(formatModelTag).join(", ") })}
        </p>
        <p className="text-[12px] leading-relaxed text-secondary">
          {t("modalEmbedding")}
          {!isEnabled && t("modalAlsoEnable")}
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="quiet"
            onClick={onClose}
            className="h-10 px-4 text-[13px] font-normal bg-transparent hover:bg-transparent"
          >
            {t("cancel")}
          </Button>
          <Button
            variant="brand"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="h-10 rounded-[8px] disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("makeItDefault")}
          </Button>
        </div>
      </div>
    </HakkenModal>
  );
}
