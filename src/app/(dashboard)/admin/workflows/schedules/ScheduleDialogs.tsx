"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/src/ui/components/screens/Button";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";

type ScheduleDialogsProps = {
  deletingSchedule: { name?: string } | null;
  isSubmitting: boolean;
  onCloseDelete: () => void;
  onConfirmDelete: () => Promise<void>;
  messageModal: { title: string; body: string } | null;
  onCloseMessage: () => void;
};

export function ScheduleDialogs({
  deletingSchedule,
  isSubmitting,
  onCloseDelete,
  onConfirmDelete,
  messageModal,
  onCloseMessage,
}: ScheduleDialogsProps) {
  const t = useTranslations("admin.workflows.schedules");

  return (
    <>
      <ConfirmationModal
        isOpen={!!deletingSchedule}
        onClose={onCloseDelete}
        title={t("modals.delete.title")}
        cancelLabel={t("modals.delete.cancel")}
        confirmLabel={isSubmitting ? t("modals.delete.submitting") : t("modals.delete.submit")}
        isSubmitting={isSubmitting}
        onConfirm={onConfirmDelete}
      >
        <p>
          {t("modals.delete.confirm", { name: deletingSchedule?.name ?? "" })}
        </p>
      </ConfirmationModal>

      <SonaeModal
        isOpen={!!messageModal}
        onClose={onCloseMessage}
        title={messageModal?.title || ""}
      >
        <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
          <p>{messageModal?.body}</p>
        </div>
        <div className="flex justify-end mt-8 pt-6 border-t border-border-dim">
          <Button
            variant="primary"
            onClick={onCloseMessage}
            className="px-8 py-3 font-bold tracking-widest uppercase shadow-none"
          >
            {t("modals.error.dismiss")}
          </Button>
        </div>
      </SonaeModal>
    </>
  );
}
