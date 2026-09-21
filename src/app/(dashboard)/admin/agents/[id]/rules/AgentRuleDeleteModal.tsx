"use client";

import type { ReactNode } from "react";
import { AlertOctagon, RefreshCcw, Trash2 } from "lucide-react";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";

type AgentRuleDeleteModalProps = {
  isOpen: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
  cancelAction: ReactNode;
  title: string;
  description: string;
  warning: string;
  confirmLabel: string;
};

export default function AgentRuleDeleteModal({
  isOpen,
  isDeleting,
  onClose,
  onConfirm,
  cancelAction,
  title,
  description,
  warning,
  confirmLabel,
}: AgentRuleDeleteModalProps) {
  return (
    <HakkenModal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <AlertOctagon className="w-12 h-12 text-rose-500 mb-2 opacity-80" />
          <p className="text-[14px] text-secondary leading-relaxed">{description}</p>
          <p className="text-[13px] font-bold text-foreground mt-2">{warning}</p>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border-dim">
          {cancelAction}
          <WriteButton
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-[13px] font-medium tracking-wide bg-rose-500 hover:bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.3)] transition-all disabled:opacity-50"
          >
            {isDeleting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span>{confirmLabel}</span>
          </WriteButton>
        </div>
      </div>
    </HakkenModal>
  );
}
