"use client";

import type { FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CircleCheck, Loader2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { ModalField, ModalFormActions } from "@/src/ui/components/screens/ModalForm";

type ToolServerForm = {
  name: string;
  url: string;
  secretRef: string;
};

type CheckedServer = {
  serverId: Id<"mcpServers">;
  name: string;
  ok: boolean;
  message: string;
  toolCount: number;
};

type DeletingServer = {
  _id: Id<"mcpServers">;
  name: string;
};

type ToolServerDialogsProps = {
  isAddOpen: boolean;
  onCloseAdd: () => void;
  form: ToolServerForm;
  onFormChange: (form: ToolServerForm) => void;
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  error: string;
  checked: CheckedServer | null;
  checkedTools: ReadonlyArray<{
    name: string;
    title?: string;
    description?: string;
  }> | undefined;
  onCloseChecked: () => void;
  deleting: DeletingServer | null;
  onCloseDeleting: () => void;
  isDeleting: boolean;
  onConfirmDelete: () => Promise<void>;
};

export function ToolServerDialogs({
  isAddOpen,
  onCloseAdd,
  form,
  onFormChange,
  onAdd,
  isSubmitting,
  error,
  checked,
  checkedTools,
  onCloseChecked,
  deleting,
  onCloseDeleting,
  isDeleting,
  onConfirmDelete,
}: ToolServerDialogsProps) {
  const t = useTranslations("admin.toolServers");

  return (
    <>
      <HakkenModal
        isOpen={isAddOpen}
        onClose={onCloseAdd}
        title={t("modal.title")}
      >
        <div className="flex flex-col gap-2 mb-6">
          <p className="text-secondary text-[15px]">{t("modal.description")}</p>
          {error ? <p className="text-warning text-[13px] font-medium">{error}</p> : null}
        </div>
        <form onSubmit={onAdd} className="flex flex-col gap-5">
          <ModalField
            label={t("modal.name")}
            required
            value={form.name}
            onChange={(event) => onFormChange({ ...form, name: event.target.value })}
            placeholder={t("placeholders.name")}
          />
          <ModalField
            label={t("modal.url")}
            required
            value={form.url}
            onChange={(event) => onFormChange({ ...form, url: event.target.value })}
            placeholder={t("placeholders.url")}
          />
          <ModalField
            label={t("modal.secretRef")}
            value={form.secretRef}
            onChange={(event) => onFormChange({ ...form, secretRef: event.target.value })}
            placeholder={t("placeholders.secretRef")}
          />
          <p className="text-[12px] text-muted">{t("modal.secretHint")}</p>

          <ModalFormActions
            cancelLabel={t("buttons.cancel")}
            submitLabel={isSubmitting ? t("buttons.connecting") : t("buttons.connect")}
            isSubmitting={isSubmitting}
            onCancel={onCloseAdd}
          />
        </form>
      </HakkenModal>

      {/*
        * The answer to "did that work".
        *
        * Deliberately a modal rather than a line at the top of the page: a
        * person pressed a button and is waiting. It says pass or fail in a
        * heading, gives the reason when it failed, and — when it worked — lists
        * what the server actually offers, because a count is not an answer to
        * whether the connection is worth having.
        */}
      <HakkenModal
        isOpen={!!checked}
        onClose={onCloseChecked}
        title={checked?.ok ? t("checked.passedTitle") : t("checked.failedTitle")}
      >
        <div className="flex flex-col gap-4">
          <div
            className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${
              checked?.ok ? "bg-info/10 text-info" : "bg-warning/10 text-warning"
            }`}
          >
            {checked?.ok
              ? <CircleCheck className="w-4 h-4 mt-0.5 shrink-0" />
              : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-medium">
                {checked?.ok
                  ? t("checked.passed", { name: checked?.name ?? "" })
                  : t("checked.failed", { name: checked?.name ?? "" })}
              </span>
              <span className="text-[13px] opacity-90">{checked?.message}</span>
            </div>
          </div>

          {checked?.ok ? (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-secondary">
                {t("checked.offers", { count: checked?.toolCount ?? 0 })}
              </span>
              {checkedTools === undefined ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted" />
              ) : (
                <ul className="flex flex-col gap-2 max-h-[280px] overflow-y-auto">
                  {checkedTools.map((tool) => (
                    <li key={tool.name} className="flex flex-col gap-0.5 border-l-2 border-border-dim pl-3">
                      <span className="text-[13px] text-foreground font-mono">{tool.title || tool.name}</span>
                      <span className="text-[12px] text-muted">{tool.description}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[12px] text-muted">{t("checked.nextStep")}</p>
            </div>
          ) : (
            <p className="text-[13px] text-muted">{t("checked.whatToDo")}</p>
          )}

          <div className="flex justify-end">
            <Button variant="primary" onClick={onCloseChecked}>
              {t("buttons.close")}
            </Button>
          </div>
        </div>
      </HakkenModal>

      <ConfirmationModal
        isOpen={!!deleting}
        onClose={onCloseDeleting}
        title={t("modal.disconnectTitle")}
        cancelLabel={t("buttons.cancel")}
        confirmLabel={t("buttons.disconnect")}
        isSubmitting={isDeleting}
        onConfirm={onConfirmDelete}
      >
        <p>{t("modal.disconnectConfirm", { name: deleting?.name ?? "" })}</p>
        <p className="text-[13px] text-muted">{t("modal.disconnectDetail")}</p>
      </ConfirmationModal>
    </>
  );
}
