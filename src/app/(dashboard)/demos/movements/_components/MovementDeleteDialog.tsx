"use client";

import { Trash2 } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

type MovementDeleteDialogProps = {
  isOpen: boolean;
  movement: Doc<"movements"> | null;
  onClose: () => void;
  onConfirm: () => void;
};

export default function MovementDeleteDialog({
  isOpen,
  movement,
  onClose,
  onConfirm,
}: MovementDeleteDialogProps) {
  return (
    <SonaeModal isOpen={isOpen} onClose={onClose} title="Delete Routine">
      <div className="flex flex-col gap-6">
        <p className="text-secondary text-sm">
          Are you sure you want to delete{" "}
          <strong className="text-foreground">{movement?.title}</strong>? This action cannot be
          undone.
        </p>
        <div className="flex items-center gap-3 w-full mt-2">
          <button
            onClick={onClose}
            className="flex-1 bg-foreground/5 hover:bg-foreground/10 text-foreground py-3 rounded-xl transition-colors font-medium text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 py-3 rounded-xl transition-colors font-medium text-sm flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Routine
          </button>
        </div>
      </div>
    </SonaeModal>
  );
}
