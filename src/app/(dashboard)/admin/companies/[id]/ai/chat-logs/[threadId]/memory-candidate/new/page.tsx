"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { BrainCircuit, Loader2, MessageSquareText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useTranslations } from "next-intl";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import type { Id } from "@/convex/_generated/dataModel";
import { ModalField, ModalFormError } from "@/src/ui/components/screens/ModalForm";
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
import {
  ModalFormField,
  modalTextareaClassName,
} from "@/src/ui/components/screens/ModalForm";

type ChatMemoryFormData = {
  title: string;
  content: string;
  applyMode: MemoryApplyMode;
  reason: string;
};

const DEFAULT_FORM: ChatMemoryFormData = {
  title: "",
  content: "",
  applyMode: "WHEN_RELEVANT",
  reason: "",
};

export default function NewChatMemoryCandidatePage() {
  const t = useTranslations("admin.companyDetails.chatMemoryNew");
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params.id as Id<"companies">;
  const threadId = params.threadId as Id<"threads">;
  const messageId = searchParams.get("messageId") as Id<"messages"> | null;
  const fallbackHref = `/admin/companies/${companyId}/ai/chat-logs`;
  const backHref = getSafeCompanyAiReturnTo(searchParams.get("returnTo"), companyId, fallbackHref);
  const thread = useQuery(api.chatAdmin.getCompanyThreadById, { companyId, threadId });
  const messages = useQuery(api.chatAdmin.getAdminThreadMessages, { threadId });
  const createMemoryCandidateFromChat = useMutation(api.companyLearningLoop.createMemoryCandidateFromChat);

  const selectedMessage = useMemo(() => {
    if (!messages) return undefined;
    return messages.find((message) => message._id === messageId)
      ?? [...messages].reverse().find((message) => message.role === "assistant")
      ?? messages[messages.length - 1];
  }, [messageId, messages]);

  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [hasHydrated, setHasHydrated] = useState(false);
  const action = useAdminAction({ scope: "admin-company-ai" });

  // Hydrating during render rather than in an effect: React re-runs this
  // component before committing, so the fields are populated in the same
  // paint. In an effect the user sees an empty form first.
  if (thread && selectedMessage && !hasHydrated) {
      setFormData({
        title: thread.title ? t("defaultTitle", { title: thread.title.slice(0, 70) }) : "",
        content: selectedMessage.content,
        applyMode: "WHEN_RELEVANT",
        reason: t("defaultReason", { threadId }),
      });
      setHasHydrated(true);
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await action.run(() => createMemoryCandidateFromChat({
          companyId,
          threadId,
          messageId: selectedMessage?._id,
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

  if (thread === undefined || messages === undefined || !hasHydrated) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

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
            <h2 className="text-[14px] font-semibold text-foreground">{thread.title || t("evidenceTitle")}</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-secondary whitespace-pre-wrap">
              {selectedMessage?.content || t("noContent")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-widest text-muted">
              <span>{selectedMessage?.role || t("message")}</span>
              <span>{thread.widgetId ? t("surfaceWidget") : t("surfaceCompanyChat")}</span>
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

