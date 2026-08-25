"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { BrainCircuit, MessageSquareText } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import {
  ModalField,
  ModalFormError,
  ModalFormField,
  modalTextareaClassName,
} from "@/src/ui/components/screens/ModalForm";
import {
  CompanyAiFormActions,
  CompanyAiFormPageHeader,
  getSafeCompanyAiReturnTo,
} from "@/src/app/(dashboard)/admin/companies/[id]/ai/_components/CompanyAiFormPage";
import {
  MemoryApplyModeChoice,
  MemoryContentField,
  type MemoryApplyMode,
} from "@/src/app/(dashboard)/admin/_components/MemoryFields";

type ChatMemoryFormData = {
  title: string;
  content: string;
  applyMode: MemoryApplyMode;
  reason: string;
};

type SelectedMessage = {
  _id: Id<"messages">;
  content: string;
  role: string;
};

type ChatMemoryCandidateContentProps = {
  companyId: Id<"companies">;
  threadId: Id<"threads">;
  threadTitle: string;
  isWidgetThread: boolean;
  selectedMessage: SelectedMessage;
  returnTo: string | null;
};

export default function ChatMemoryCandidateContent({
  companyId,
  threadId,
  threadTitle,
  isWidgetThread,
  selectedMessage,
  returnTo,
}: ChatMemoryCandidateContentProps) {
  const t = useTranslations("admin.companyDetails.chatMemoryNew");
  const router = useRouter();
  const fallbackHref = `/admin/companies/${companyId}/ai/chat-logs`;
  const backHref = getSafeCompanyAiReturnTo(returnTo, companyId, fallbackHref);
  const createMemoryCandidateFromChat = useMutation(api.companyLearningLoop.createMemoryCandidateFromChat);
  const [formData, setFormData] = useState<ChatMemoryFormData>(() => ({
    title: threadTitle ? t("defaultTitle", { title: threadTitle.slice(0, 70) }) : "",
    content: selectedMessage.content,
    applyMode: "WHEN_RELEVANT",
    reason: t("defaultReason", { threadId }),
  }));
  const action = useAdminAction({ scope: "admin-company-ai" });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await action.run(() => createMemoryCandidateFromChat({
      companyId,
      threadId,
      messageId: selectedMessage._id,
      title: formData.title || undefined,
      content: formData.content,
      applyMode: formData.applyMode,
      reason: formData.reason || undefined,
    }), {
      fallbackMessage: t("createFailed"),
      // The form renders the message itself, so a toast would repeat it.
      suppressErrorToast: true,
    });
    // The filled-in form stays on screen if the save failed.
    if (outcome.ok) router.push(backHref);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <CompanyAiFormPageHeader
        backHref={backHref}
        title={t("title")}
        description={t("description")}
        icon={<BrainCircuit className="h-6 w-6 text-brand" />}
      />

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex items-start gap-3">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-foreground">{threadTitle || t("evidenceTitle")}</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-secondary whitespace-pre-wrap">
              {selectedMessage.content || t("noContent")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-widest text-muted">
              <span>{selectedMessage.role || t("message")}</span>
              <span>{isWidgetThread ? t("surfaceWidget") : t("surfaceCompanyChat")}</span>
              <span>{threadId}</span>
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col gap-5">
          <ModalFormError>{action.error}</ModalFormError>
          <ModalField
            label={t("titleLabel")}
            hint={t("optional")}
            type="text"
            value={formData.title}
            onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))}
            placeholder={t("titlePlaceholder")}
          />
          <MemoryContentField
            value={formData.content}
            onChange={(content) => setFormData((current) => ({ ...current, content }))}
          />
          <MemoryApplyModeChoice
            value={formData.applyMode}
            onChange={(applyMode) => setFormData((current) => ({ ...current, applyMode }))}
          />
          <ModalFormField label={t("whyLabel")} hint={t("whyHint")}>
            <textarea
              value={formData.reason}
              onChange={(event) => setFormData((current) => ({ ...current, reason: event.target.value }))}
              className={modalTextareaClassName}
              placeholder={t("whyPlaceholder")}
            />
          </ModalFormField>
          <CompanyAiFormActions
            backHref={backHref}
            submitLabel={action.isBusy() ? t("saving") : t("suggest")}
            isSubmitting={action.isBusy()}
          />
        </div>
      </form>
    </div>
  );
}
