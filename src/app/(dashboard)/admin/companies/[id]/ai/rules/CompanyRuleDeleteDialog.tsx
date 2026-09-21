"use client";

import { AlertOctagon, RefreshCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/src/ui/components/screens/Button";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";

export function CompanyRuleDeleteDialog({
  isOpen,
  isDeleting,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("admin.companyDetails.rules");

  return (
    <HakkenModal isOpen={isOpen} onClose={onClose} title={t("deleteTitle")} size="sm">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <AlertOctagon className="mb-2 h-12 w-12 text-rose-500 opacity-80" />
          <p className="text-[14px] leading-relaxed text-secondary">{t("deleteBody")}</p>
          <p className="mt-2 text-[13px] font-bold text-foreground">{t("deleteWarning")}</p>
        </div>

        <div className="flex justify-end gap-3 border-t border-border-dim pt-4">
          <Button
            variant="quiet"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-full bg-transparent px-5 py-2.5 text-[13px] tracking-wide hover:bg-foreground/5"
          >
            {t("cancel")}
          </Button>
          <WriteButton
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 rounded-full bg-rose-500 px-6 py-2.5 text-[13px] font-medium tracking-wide text-white shadow-[0_0_20px_rgba(244,63,94,0.3)] transition-all hover:bg-rose-600 disabled:opacity-50"
          >
            {isDeleting ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            <span>{t("deleteConfirm")}</span>
          </WriteButton>
        </div>
      </div>
    </HakkenModal>
  );
}
