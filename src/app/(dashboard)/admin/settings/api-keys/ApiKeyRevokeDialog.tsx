"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/src/ui/components/screens/Button";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field } from "@/src/ui/components/screens/Field";

type ApiKeyRevokeDialogProps = {
  body: ReactNode;
  busy: boolean;
  cancelLabel: string;
  confirmLabel: string;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  onReasonChange: (reason: string) => void;
  reason: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  title: string;
};

export function ApiKeyRevokeDialog({
  body,
  busy,
  cancelLabel,
  confirmLabel,
  error,
  onClose,
  onConfirm,
  onReasonChange,
  reason,
  reasonLabel,
  reasonPlaceholder,
  title,
}: ApiKeyRevokeDialogProps) {
  return (
    <SonaeModal isOpen onClose={onClose} title={title} size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-secondary">{body}</p>
        <Field
          id="api-key-revoke-reason"
          label={reasonLabel}
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder={reasonPlaceholder}
        />
        {error ? <p className="text-[13px] text-rose-300">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button
            variant="quiet"
            onClick={onClose}
            className="inline-flex h-9 items-center px-4 text-[13px] text-foreground bg-transparent hover:bg-foreground/5"
          >
            {cancelLabel}
          </Button>
          <WriteButton
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-rose-500 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </WriteButton>
        </div>
      </div>
    </SonaeModal>
  );
}
