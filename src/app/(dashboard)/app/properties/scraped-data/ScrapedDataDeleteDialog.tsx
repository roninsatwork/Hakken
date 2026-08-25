"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/atoms/Button";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

export type DeletingProperty = {
  _id: Id<"properties">;
  address: string;
};

type ScrapedDataDeleteDialogProps = {
  property: DeletingProperty;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export default function ScrapedDataDeleteDialog({
  property,
  onClose,
  onConfirm,
}: ScrapedDataDeleteDialogProps) {
  return (
    <SonaeModal isOpen onClose={onClose} title="Delete Property">
      <p className="text-secondary mb-6 text-[15px] leading-relaxed">
        Are you sure you want to delete <strong className="text-foreground">{property.address}</strong>? This action cannot be undone.
      </p>
      <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
        <Button
          variant="ghost"
          onClick={onClose}
          className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
        >
          Cancel
        </Button>
        <Button
          variant="ghost"
          onClick={onConfirm}
          className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20"
        >
          Delete
        </Button>
      </div>
    </SonaeModal>
  );
}
