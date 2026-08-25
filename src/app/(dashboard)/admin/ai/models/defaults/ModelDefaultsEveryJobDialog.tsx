"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/src/ui/components/screens/Button";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";

type ModelDefaultsEveryJobDialogProps = {
  modelName: string;
  canCount: number;
  totalCount: number;
  jobs: string;
  cannotJobs: string;
  cannotCount: number;
  isApplying: boolean;
  onClose: () => void;
  onApply: () => void;
};

export function ModelDefaultsEveryJobDialog({
  modelName,
  canCount,
  totalCount,
  jobs,
  cannotJobs,
  cannotCount,
  isApplying,
  onClose,
  onApply,
}: ModelDefaultsEveryJobDialogProps) {
  const t = useTranslations("ai.models.defaults");

  return (
    <SonaeModal isOpen onClose={onClose} title={t("everyJobTitle")} size="sm">
      <div className="flex flex-col gap-5 px-1 pb-2">
        <p className="text-[13px] leading-relaxed text-secondary">
          {t.rich("modalTakeOver", {
            model: modelName,
            can: canCount,
            total: totalCount,
            b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
          })}
        </p>
        <p className="text-[12px] leading-relaxed text-muted">
          {t("jobsList", { jobs })}
        </p>
        {cannotCount > 0 && (
          // Named rather than silently skipped. "Apply to every job" used to
          // write all ten rows without checking, which is how a model ended up
          // set for a job it cannot do.
          <p className="text-[12px] leading-relaxed text-[#f59e0b]">
            {t("cannotDoList", { jobs: cannotJobs, count: cannotCount })}
          </p>
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
            onClick={onApply}
            disabled={isApplying}
            className="h-10 px-4 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {isApplying && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("applyToEveryJob")}
          </WriteButton>
        </div>
      </div>
    </SonaeModal>
  );
}
