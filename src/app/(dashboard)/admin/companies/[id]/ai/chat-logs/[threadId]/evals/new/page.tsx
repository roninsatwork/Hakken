"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ClipboardCheck, Loader2, MessageSquareText, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
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
  getSafeCompanyAiReturnTo,
} from "@/src/app/(dashboard)/admin/companies/[id]/ai/_components/CompanyAiFormPage";

type CompanyEvalCase = Doc<"companyEvalCases">;

const WHERE_OPTIONS: Array<{ value: EvalTargetSurface; label: string; hint: string }> = [
  { value: "COMPANY_CHAT", label: "Internal chat", hint: "Staff asking your AI questions" },
  { value: "WIDGET", label: "Customer widget", hint: "The public widget on your site" },
];
type EvalSeverity = CompanyEvalCase["severity"];
type EvalTargetSurface = CompanyEvalCase["targetSurface"];

const DEFAULT_EVAL_FORM = {
  name: "",
  severity: "WARNING" as EvalSeverity,
  targetSurface: "COMPANY_CHAT" as EvalTargetSurface,
  prompt: "",
  expectedBehavior: "",
};

export default function NewChatEvalPage() {
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
  const createEvalCaseFromChat = useMutation(api.companyLearningLoop.createEvalCaseFromChat);

  const selectedAssistantMessage = useMemo(() => {
    if (!messages) return undefined;
    return messages.find((message) => message._id === messageId)
      ?? [...messages].reverse().find((message) => message.role === "assistant");
  }, [messageId, messages]);
  const latestUserMessage = useMemo(() => {
    if (!messages) return undefined;
    return [...messages].reverse().find((message) => message.role === "user");
  }, [messages]);

  const [evalForm, setEvalForm] = useState(DEFAULT_EVAL_FORM);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [bannedPhrases, setBannedPhrases] = useState<string[]>([]);
  const [phraseDraft, setPhraseDraft] = useState("");

  const addPhrase = () => {
    const phrase = phraseDraft.trim();
    if (!phrase || bannedPhrases.includes(phrase)) {
      setPhraseDraft("");
      return;
    }
    setBannedPhrases((current) => [...current, phrase]);
    setPhraseDraft("");
  };
  const action = useAdminAction({ scope: "admin-company-ai" });

  // Hydrating during render rather than in an effect: React re-runs this
  // component before committing, so the fields are populated in the same
  // paint. In an effect the user sees an empty form first.
  if (thread && messages && !hasHydrated) {
      setEvalForm({
        name: thread.title ? `${thread.title.slice(0, 90)} regression` : "Chat evidence regression",
        severity: thread.widgetId ? "BLOCKER" : "WARNING",
        targetSurface: thread.widgetId ? "WIDGET" : "COMPANY_CHAT",
        prompt: latestUserMessage?.content ?? "",
        expectedBehavior: selectedAssistantMessage
          ? "Preserve the useful parts of the observed answer, stay grounded in approved company context, and avoid unsupported claims."
          : "Answer should be grounded in approved company context and avoid unsupported claims.",
      });
      setHasHydrated(true);
  }

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
      fallbackMessage: "Eval case could not be created.",
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
        title="Create Eval From Chat"
        description="Convert selected chat evidence into a regression eval on a full screen with the evidence kept visible."
        icon={<ClipboardCheck className="h-6 w-6 text-brand" />}
      />

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex items-start gap-3">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-foreground">{thread.title || "Selected chat evidence"}</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-[8px] border border-border-dim bg-background/50 p-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted">Prompt evidence</div>
                <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-secondary">
                  {latestUserMessage?.content || "No user message found."}
                </p>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-background/50 p-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted">Observed answer</div>
                <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-secondary">
                  {selectedAssistantMessage?.content || "No assistant message selected."}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-widest text-muted">
              <span>{thread.widgetId ? "widget" : "company chat"}</span>
              <span>{threadId}</span>
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col gap-5">
          <ModalFormError>{action.error}</ModalFormError>
          <ModalField
            label="Name"
            required
            value={evalForm.name}
            onChange={(event) => setEvalForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Regression name"
          />
          <ModalFormField label="Where does this apply?">
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
                    <span className="block text-[13px] font-semibold text-foreground">{option.label}</span>
                    <span className="block text-[12px] text-secondary">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </ModalFormField>

          <ModalTextAreaField
            label="What would someone ask?"
            required
            minHeightClassName="min-h-[190px]"
            value={evalForm.prompt}
            onChange={(event) => setEvalForm((current) => ({ ...current, prompt: event.target.value }))}
            placeholder="Question or task to replay as an eval."
          />
          <ModalTextAreaField
            label="What does a good answer look like?"
            required
            minHeightClassName="min-h-[190px]"
            value={evalForm.expectedBehavior}
            onChange={(event) => setEvalForm((current) => ({ ...current, expectedBehavior: event.target.value }))}
            placeholder="What a passing answer must do."
          />
          <ModalField
            label="Words it must never say"
            hint="Optional. Press Enter after each one."
            value={phraseDraft}
            onChange={(event) => setPhraseDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addPhrase();
              }
            }}
            onBlur={addPhrase}
            placeholder="enterprise is free"
          >
            {bannedPhrases.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {bannedPhrases.map((phrase) => (
                  <span key={phrase} className="inline-flex items-center gap-1.5 rounded-full border border-border-dim bg-foreground/5 px-3 py-1 text-[12px] text-foreground">
                    {phrase}
                    <button
                      type="button"
                      aria-label={`Remove ${phrase}`}
                      onClick={() => setBannedPhrases((current) => current.filter((entry) => entry !== phrase))}
                      className="text-muted transition-colors hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </ModalField>

          <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-border-dim px-3 py-2.5 transition-colors hover:bg-foreground/5">
            <input
              type="checkbox"
              checked={evalForm.severity === "BLOCKER"}
              onChange={(event) => setEvalForm((current) => ({ ...current, severity: event.target.checked ? "BLOCKER" : "ADVISORY" }))}
              className="mt-0.5 accent-brand"
            />
            <span>
              <span className="block text-[13px] font-semibold text-foreground">This must pass before the AI goes live</span>
              <span className="block text-[12px] text-secondary">Leave ticked for anything that would embarrass you in front of a customer.</span>
            </span>
          </label>

          <CompanyAiFormActions
            backHref={backHref}
            submitLabel={action.isBusy() ? "Creating..." : "Create eval"}
            isSubmitting={action.isBusy()}
          />
        </div>
      </form>
    </div>
  );
}

