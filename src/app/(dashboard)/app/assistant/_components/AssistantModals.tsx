import { AlertTriangle } from "lucide-react";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import type { Translate } from "./types";

type AssistantModalsProps = {
  onClearUploadError: () => void;
  onPermissionErrorClose: () => void;
  permissionError: boolean;
  platformName: string;
  t: Translate;
  tCommon: Translate;
  uploadError: string | null;
};

export function AssistantModals({
  onClearUploadError,
  onPermissionErrorClose,
  permissionError,
  platformName,
  t,
  tCommon,
  uploadError,
}: AssistantModalsProps) {
  return (
    <>
      <HakkenModal isOpen={permissionError} onClose={onPermissionErrorClose} title={t("errors.mic.title")}>
        <div className="flex flex-col gap-5 pt-2">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <AlertTriangle className="w-6 h-6 text-red-500 opacity-80" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[16px] font-semibold tracking-wide">{t("errors.mic.subtitle")}</span>
            <p className="text-[14px] text-secondary font-light leading-relaxed">
              {t("errors.mic.description", { platformName })}
            </p>
          </div>
          <div className="bg-foreground/[0.03] border border-border-dim rounded-[12px] p-4 text-[13px] text-muted font-mono tracking-wide mt-2">
            {t("errors.mic.instruction")}
          </div>
          <div className="w-full flex justify-end mt-2">
            <button
              onClick={onPermissionErrorClose}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-6 py-2.5 rounded-full text-[13px] font-bold tracking-widest uppercase transition-colors"
            >
              {tCommon("actions.dismiss")}
            </button>
          </div>
        </div>
      </HakkenModal>

      <HakkenModal isOpen={!!uploadError} onClose={onClearUploadError} title={t("errors.upload.title")}>
        <div className="flex flex-col gap-5 pt-2">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <AlertTriangle className="w-6 h-6 text-red-500 opacity-80" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[16px] font-semibold tracking-wide">{t("errors.upload.subtitle")}</span>
            <p className="text-[14px] text-secondary font-light leading-relaxed">{uploadError}</p>
          </div>
          <div className="bg-foreground/[0.03] border border-border-dim rounded-[12px] p-4 text-[13px] text-muted font-mono tracking-wide mt-2">
            {t("errors.upload.tip")}
          </div>
          <div className="w-full flex justify-end mt-2">
            <button
              onClick={onClearUploadError}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-6 py-2.5 rounded-full text-[13px] font-bold tracking-widest uppercase transition-colors"
            >
              {t("errors.upload.clear")}
            </button>
          </div>
        </div>
      </HakkenModal>
    </>
  );
}
