"use client";

import { Button } from "@/src/ui/atoms/Button";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

type ScheduleErrorDialogProps = {
  dismissLabel: string;
  message: string;
  onClose: () => void;
  title: string;
};

export function ScheduleErrorDialog({
  dismissLabel,
  message,
  onClose,
  title,
}: ScheduleErrorDialogProps) {
  return (
    <SonaeModal isOpen onClose={onClose} title={title}>
      <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
        <p>{message}</p>
      </div>
      <div className="flex justify-end mt-8 pt-6 border-t border-border-dim">
        {/* Preserve the original solid-red hover treatment on the shared button atom. */}
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="px-8 py-3 rounded-[10px] bg-red-500/10 text-red-500 transition-all text-sm font-bold tracking-widest uppercase hover:bg-red-500 hover:text-white"
        >
          {dismissLabel}
        </Button>
      </div>
    </SonaeModal>
  );
}
