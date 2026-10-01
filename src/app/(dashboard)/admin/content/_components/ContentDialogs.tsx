"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";

/**
 * The one pop-up an Admin → Content screen opens: asking before something is
 * deleted. Every editor is a page (Anthony, 2026-10-01: a pop-up is for a yes
 * or a no, never for fields).
 */
export function ContentDeleteDialog({
  isOpen,
  title,
  warning,
  error,
  isSubmitting,
  onClose,
  onConfirm,
  children,
}: {
  isOpen: boolean;
  title: string;
  warning: string;
  error: string;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  /** The sentence naming what goes, with the name picked out. */
  children: ReactNode;
}) {
  const tCommon = useTranslations("common");
  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      cancelLabel={tCommon("cancel")}
      confirmLabel={tCommon("actions.delete")}
      isSubmitting={isSubmitting}
      onConfirm={onConfirm}
      error={error}
      warning={{ description: warning }}
    >
      <p>{children}</p>
    </ConfirmationModal>
  );
}
