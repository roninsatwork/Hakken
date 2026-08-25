"use client";

import { AlertOctagon, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/src/ui/components/screens/Button";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";

type RuleDeleteDialogProps = {
  isDeleting: boolean;
  labels: {
    abort: string;
    confirm: string;
    description: string;
    title: string;
    warning: string;
  };
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function RuleDeleteDialog({
  isDeleting,
  labels,
  onClose,
  onConfirm,
}: RuleDeleteDialogProps) {
  return (
    <SonaeModal isOpen onClose={onClose} title={labels.title} size="sm">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <AlertOctagon className="w-12 h-12 text-rose-500 mb-2 opacity-80" />
          <p className="text-[14px] text-secondary leading-relaxed">{labels.description}</p>
          <p className="text-[13px] font-bold text-foreground mt-2">{labels.warning}</p>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border-dim">
          <Button
            variant="quiet"
            onClick={onClose}
            className="px-5 py-2.5 rounded-full text-[13px] tracking-wide bg-transparent hover:bg-foreground/5"
          >
            {labels.abort}
          </Button>
          <WriteButton
            onClick={() => void onConfirm()}
            disabled={isDeleting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-[13px] font-medium tracking-wide bg-rose-500 hover:bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.3)] transition-all disabled:opacity-50"
          >
            {isDeleting ? (
              <RefreshCcw className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            <span>{labels.confirm}</span>
          </WriteButton>
        </div>
      </div>
    </SonaeModal>
  );
}
