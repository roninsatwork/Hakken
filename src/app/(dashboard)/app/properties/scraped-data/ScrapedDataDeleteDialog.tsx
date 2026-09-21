"use client";

import { useTranslations } from "next-intl";

import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";

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
  const t = useTranslations("properties.scrapedData");

  return (
    <HakkenModal isOpen onClose={onClose} title={t("deleteTitle")}>
      <p className="text-secondary mb-6 text-[15px] leading-relaxed">
        {t.rich("deleteBody", {
          address: property.address,
          highlight: (chunks) => <strong className="text-foreground">{chunks}</strong>,
        })}
      </p>
      <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
        <Button
          variant="ghost"
          onClick={onClose}
          className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
        >
          {t("cancel")}
        </Button>
        <Button
          variant="ghost"
          onClick={onConfirm}
          className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20"
        >
          {t("delete")}
        </Button>
      </div>
    </HakkenModal>
  );
}
