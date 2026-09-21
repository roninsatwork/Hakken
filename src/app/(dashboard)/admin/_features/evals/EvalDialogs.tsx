"use client";

import type { ReactNode } from "react";
import { Loader2, Play, Trash2 } from "lucide-react";
import { Button } from "@/src/ui/components/screens/Button";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";

type DialogCopy = {
  body: ReactNode;
  busy: boolean;
  cancelLabel: string;
  confirmLabel: string;
  open: boolean;
  title: string;
};

type EvalDialogsProps = {
  batch: DialogCopy & {
    cappedMessage?: string;
    stayMessage: string;
  };
  deletion: DialogCopy;
  onBatchClose: () => void;
  onBatchConfirm: () => void | Promise<void>;
  onDeleteClose: () => void;
  onDeleteConfirm: () => void | Promise<void>;
};

export function EvalDialogs({
  batch,
  deletion,
  onBatchClose,
  onBatchConfirm,
  onDeleteClose,
  onDeleteConfirm,
}: EvalDialogsProps) {
  return (
    <>
      {/* Running is real provider work, so the dialog says what it will do
          before it does it. */}
      <HakkenModal isOpen={batch.open} onClose={onBatchClose} title={batch.title} size="sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-secondary">
            <p>{batch.body}</p>
            <p>{batch.stayMessage}</p>
            {batch.cappedMessage ? <p className="text-amber-200">{batch.cappedMessage}</p> : null}
          </div>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <Button
              variant="ghost"
              onClick={onBatchClose}
              disabled={batch.busy}
              className="px-4 py-2 font-semibold hover:bg-foreground/5"
            >
              {batch.cancelLabel}
            </Button>
            <Button
              variant="brand"
              onClick={onBatchConfirm}
              disabled={batch.busy}
              className="inline-flex items-center gap-2 rounded-[8px] py-2 font-semibold disabled:opacity-50"
            >
              {batch.busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {batch.confirmLabel}
            </Button>
          </div>
        </div>
      </HakkenModal>

      <HakkenModal
        isOpen={deletion.open}
        onClose={onDeleteClose}
        title={deletion.title}
        size="sm"
      >
        <div className="flex flex-col gap-6">
          <p className="text-[13px] leading-relaxed text-secondary">{deletion.body}</p>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <Button
              variant="ghost"
              onClick={onDeleteClose}
              disabled={deletion.busy}
              className="px-4 py-2 font-semibold hover:bg-foreground/5"
            >
              {deletion.cancelLabel}
            </Button>
            <WriteButton
              type="button"
              onClick={onDeleteConfirm}
              disabled={deletion.busy}
              className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {deletion.busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {deletion.confirmLabel}
            </WriteButton>
          </div>
        </div>
      </HakkenModal>
    </>
  );
}
