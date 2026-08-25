"use client";

import type { ComponentType, FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { ClipboardCheck, MessageSquareText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useTranslations } from "next-intl";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ModalField,
  ModalFormError,
  ModalFormField,
  ModalTextAreaField,
} from "@/src/ui/components/screens/ModalForm";
import {
  CompanyAiFormActions,
  CompanyAiFormPageHeader,
} from "@/src/app/(dashboard)/admin/companies/[id]/ai/_components/CompanyAiFormPage";

type CompanyEvalCase = Doc<"companyEvalCases">;
type EvalSeverity = CompanyEvalCase["severity"];
type EvalTargetSurface = CompanyEvalCase["targetSurface"];
type ChatThread = Pick<Doc<"threads">, "title" | "widgetId">;
type ChatMessage = Pick<Doc<"messages">, "_id" | "role" | "content">;

export type RemovePhraseButtonProps = {
  label: string;
  onClick: () => void;
};

export type BlockerCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  hint: string;
};

type NewChatEvalContentProps = {
  companyId: Id<"companies">;
  threadId: Id<"threads">;
  messageId: Id<"messages"> | null;
  backHref: string;
  thread: ChatThread;
  messages: ChatMessage[];
  RemovePhraseButton: ComponentType<RemovePhraseButtonProps>;
  BlockerCheckbox: ComponentType<BlockerCheckboxProps>;
};

const WHERE_OPTIONS: Array<{ value: EvalTargetSurface; labelKey: string; hintKey: string }> = [
  { value: "COMPANY_CHAT", labelKey: "whereInternal", hintKey: "whereInternalHint" },
  { value: "WIDGET", labelKey: "whereWidget", hintKey: "whereWidgetHint" },
];

export default function NewChatEvalContent({
  companyId,
  threadId,
  messageId,
  backHref,
  thread,
  messages,
  RemovePhraseButton,
  BlockerCheckbox,
}: NewChatEvalContentProps) {
  const t = useTranslations("admin.companyDetails.chatEvalNew");
  const router = useRouter();
  const createEvalCaseFromChat = useMutation(api.companyLearningLoop.createEvalCaseFromChat);

  const selectedAssistantMessage = useMemo(() => (
    messages.find((message) => message._id === messageId)
      ?? [...messages].reverse().find((message) => message.role === "assistant")
  ), [messageId, messages]);
  const latestUserMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "user"),
    [messages],
  );

  const [evalForm, setEvalForm] = useState(() => ({
    name: thread.title ? t("defaultNameFromTitle", { title: thread.title.slice(0, 90) }) : t("defaultName"),
    severity: thread.widgetId ? "BLOCKER" as EvalSeverity : "WARNING" as EvalSeverity,
    targetSurface: thread.widgetId ? "WIDGET" as EvalTargetSurface : "COMPANY_CHAT" as EvalTargetSurface,
    prompt: latestUserMessage?.content ?? "",
    expectedBehavior: selectedAssistantMessage ? t("defaultExpectedWithAnswer") : t("defaultExpected"),
  }));
  const [bannedPhrases, setBannedPhrases] = useState<string[]>([]);
  const [phraseDraft, setPhraseDraft] = useState("");
  const action = useAdminAction({ scope: "admin-company-ai" });

  const addPhrase = () => {
    const phrase = phraseDraft.trim();
    if (!phrase || bannedPhrases.includes(phrase)) {
      setPhraseDraft("");
      return;
    }
    setBannedPhrases((current) => [...current, phrase]);
    setPhraseDraft("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await action.run(() => createEvalCaseFromChat({
      companyId,
      threadId,
      messageId: selectedAssistantMessage?._id,
      name: evalForm.name,
      severity: evalForm.severity,
      targetSurface: evalForm.targetSurface,
      prompt: evalForm.prompt,
      expectedBehavior: evalForm.expectedBehavior,
      forbiddenClaimsJson: bannedPhrases.length > 0 ? JSON.stringify(bannedPhrases) : undefined,
    }), {
      fallbackMessage: t("createFailed"),
      suppressErrorToast: true,
    });
    if (outcome.ok) router.push(backHref);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <CompanyAiFormPageHeader
        backHref={backHref}
        title={t("title")}
        description={t("description")}
        icon={<ClipboardCheck className="h-6 w-6 text-brand" />}
      />

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex items-start gap-3">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-foreground">{thread.title || t("evidenceTitle")}</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-[8px] border border-border-dim bg-background/50 p-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted">{t("promptEvidence")}</div>
                <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-secondary">
                  {latestUserMessage?.content || t("noUserMessage")}
                </p>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-background/50 p-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted">{t("observedAnswer")}</div>
                <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-secondary">
                  {selectedAssistantMessage?.content || t("noAssistantMessage")}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-widest text-muted">
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
            label={t("nameLabel")}
            required
            value={evalForm.name}
            onChange={(event) => setEvalForm((current) => ({ ...current, name: event.target.value }))}
            placeholder={t("namePlaceholder")}
          />
          <ModalFormField label={t("whereLabel")}>
            <div className="flex flex-col gap-2">
              {WHERE_OPTIONS.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-border-dim px-3 py-2.5 transition-colors hover:bg-foreground/5">
                  <input
                    type="radio"
                    name="where"
                    checked={evalForm.targetSurface === option.value}
                    onChange={() => setEvalForm((current) => ({ ...current, targetSurface: option.value }))}
                    className="mt-0.5 accent-brand"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-foreground">{t(option.labelKey)}</span>
                    <span className="block text-[12px] text-secondary">{t(option.hintKey)}</span>
                  </span>
                </label>
              ))}
            </div>
          </ModalFormField>

          <ModalTextAreaField
            label={t("promptLabel")}
            required
            minHeightClassName="min-h-[190px]"
            value={evalForm.prompt}
            onChange={(event) => setEvalForm((current) => ({ ...current, prompt: event.target.value }))}
            placeholder={t("promptPlaceholder")}
          />
          <ModalTextAreaField
            label={t("expectedLabel")}
            required
            minHeightClassName="min-h-[190px]"
            value={evalForm.expectedBehavior}
            onChange={(event) => setEvalForm((current) => ({ ...current, expectedBehavior: event.target.value }))}
            placeholder={t("expectedPlaceholder")}
          />
          <ModalField
            label={t("bannedLabel")}
            hint={t("bannedHint")}
            value={phraseDraft}
            onChange={(event) => setPhraseDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addPhrase();
              }
            }}
            onBlur={addPhrase}
            placeholder={t("bannedPlaceholder")}
          >
            {bannedPhrases.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {bannedPhrases.map((phrase) => (
                  <span key={phrase} className="inline-flex items-center gap-1.5 rounded-full border border-border-dim bg-foreground/5 px-3 py-1 text-[12px] text-foreground">
                    {phrase}
                    <RemovePhraseButton
                      label={t("removePhrase", { phrase })}
                      onClick={() => setBannedPhrases((current) => current.filter((entry) => entry !== phrase))}
                    />
                  </span>
                ))}
              </div>
            )}
          </ModalField>

          <BlockerCheckbox
            checked={evalForm.severity === "BLOCKER"}
            onChange={(checked) => setEvalForm((current) => ({
              ...current,
              severity: checked ? "BLOCKER" : "ADVISORY",
            }))}
            title={t("blockerTitle")}
            hint={t("blockerHint")}
          />

          <CompanyAiFormActions
            backHref={backHref}
            submitLabel={action.isBusy() ? t("creating") : t("create")}
            isSubmitting={action.isBusy()}
          />
        </div>
      </form>
    </div>
  );
}
