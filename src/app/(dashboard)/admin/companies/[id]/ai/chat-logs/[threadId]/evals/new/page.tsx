"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ClipboardCheck, Loader2, MessageSquareText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  AdminModalFormError,
  AdminModalFormField,
  adminModalInputClassName,
  adminModalTextareaClassName,
} from "@/src/app/(dashboard)/admin/_components/AdminModalForm";
import {
  CompanyAiFormActions,
  CompanyAiFormPageHeader,
  getSafeCompanyAiReturnTo,
} from "@/src/app/(dashboard)/admin/companies/[id]/ai/_components/CompanyAiFormPage";

type CompanyEvalCase = Doc<"companyEvalCases">;
type EvalCategory = CompanyEvalCase["category"];
type EvalSeverity = CompanyEvalCase["severity"];
type EvalTargetSurface = CompanyEvalCase["targetSurface"];

const EVAL_CATEGORIES: Array<{ value: EvalCategory; label: string }> = [
  { value: "KNOWLEDGE_RETRIEVAL", label: "Knowledge retrieval" },
  { value: "MEMORY_USAGE", label: "Memory usage" },
  { value: "RULE_COMPLIANCE", label: "Rule compliance" },
  { value: "BRAND_TONE", label: "Brand tone" },
  { value: "SKILL_ROUTING", label: "Skill routing" },
  { value: "MODEL_ROUTING", label: "Model routing" },
  { value: "NO_HALLUCINATION", label: "No hallucination" },
  { value: "TENANT_ISOLATION", label: "Tenant isolation" },
  { value: "WIDGET_READINESS", label: "Widget readiness" },
  { value: "AGENT_INHERITANCE", label: "Agent inheritance" },
];

const EVAL_SEVERITIES: Array<{ value: EvalSeverity; label: string }> = [
  { value: "BLOCKER", label: "Blocker" },
  { value: "WARNING", label: "Warning" },
  { value: "ADVISORY", label: "Advisory" },
];

const EVAL_TARGETS: Array<{ value: EvalTargetSurface; label: string }> = [
  { value: "COMPANY_CHAT", label: "Company chat" },
  { value: "WIDGET", label: "Widget" },
  { value: "AGENT", label: "Agent" },
  { value: "WORKFLOW", label: "Workflow" },
  { value: "APP_KIT", label: "App kit" },
];

const DEFAULT_EVAL_FORM = {
  name: "",
  category: "NO_HALLUCINATION" as EvalCategory,
  severity: "WARNING" as EvalSeverity,
  targetSurface: "COMPANY_CHAT" as EvalTargetSurface,
  prompt: "",
  expectedBehavior: "",
  forbiddenClaimsJson: "",
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
  const [evalError, setEvalError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!thread || !messages || hasHydrated) return;
    setEvalForm({
      name: thread.title ? `${thread.title.slice(0, 90)} regression` : "Chat evidence regression",
      category: thread.widgetId ? "WIDGET_READINESS" : "NO_HALLUCINATION",
      severity: thread.widgetId ? "BLOCKER" : "WARNING",
      targetSurface: thread.widgetId ? "WIDGET" : "COMPANY_CHAT",
      prompt: latestUserMessage?.content ?? "",
      expectedBehavior: selectedAssistantMessage
        ? "Preserve the useful parts of the observed answer, stay grounded in approved company context, and avoid unsupported claims."
        : "Answer should be grounded in approved company context and avoid unsupported claims.",
      forbiddenClaimsJson: "",
    });
    setHasHydrated(true);
  }, [hasHydrated, latestUserMessage, messages, selectedAssistantMessage, thread]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setEvalError("");
    try {
      await createEvalCaseFromChat({
        companyId,
        threadId,
        messageId: selectedAssistantMessage?._id,
        name: evalForm.name,
        category: evalForm.category,
        severity: evalForm.severity,
        targetSurface: evalForm.targetSurface,
        prompt: evalForm.prompt,
        expectedBehavior: evalForm.expectedBehavior,
        forbiddenClaimsJson: evalForm.forbiddenClaimsJson || undefined,
      });
      router.push(backHref);
    } catch (error) {
      setEvalError(error instanceof Error ? error.message : "Eval case could not be created.");
    } finally {
      setIsSubmitting(false);
    }
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
          <AdminModalFormError>{evalError}</AdminModalFormError>
          <AdminModalFormField label="Name">
            <input
              required
              className={adminModalInputClassName}
              value={evalForm.name}
              onChange={(event) => setEvalForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Regression name"
            />
          </AdminModalFormField>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <AdminModalFormField label="Category">
              <select
                className={adminModalInputClassName}
                value={evalForm.category}
                onChange={(event) => setEvalForm((current) => ({ ...current, category: event.target.value as EvalCategory }))}
              >
                {EVAL_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </AdminModalFormField>
            <AdminModalFormField label="Severity">
              <select
                className={adminModalInputClassName}
                value={evalForm.severity}
                onChange={(event) => setEvalForm((current) => ({ ...current, severity: event.target.value as EvalSeverity }))}
              >
                {EVAL_SEVERITIES.map((severity) => <option key={severity.value} value={severity.value}>{severity.label}</option>)}
              </select>
            </AdminModalFormField>
            <AdminModalFormField label="Surface">
              <select
                className={adminModalInputClassName}
                value={evalForm.targetSurface}
                onChange={(event) => setEvalForm((current) => ({ ...current, targetSurface: event.target.value as EvalTargetSurface }))}
              >
                {EVAL_TARGETS.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}
              </select>
            </AdminModalFormField>
          </div>
          <AdminModalFormField label="Prompt">
            <textarea
              required
              className={`${adminModalTextareaClassName} min-h-[190px]`}
              value={evalForm.prompt}
              onChange={(event) => setEvalForm((current) => ({ ...current, prompt: event.target.value }))}
              placeholder="Question or task to replay as an eval."
            />
          </AdminModalFormField>
          <AdminModalFormField label="Expected behavior">
            <textarea
              required
              className={`${adminModalTextareaClassName} min-h-[190px]`}
              value={evalForm.expectedBehavior}
              onChange={(event) => setEvalForm((current) => ({ ...current, expectedBehavior: event.target.value }))}
              placeholder="What a passing answer must do."
            />
          </AdminModalFormField>
          <AdminModalFormField label="Forbidden claims" hint="JSON string array">
            <textarea
              className={`${adminModalTextareaClassName} min-h-[160px] font-mono`}
              value={evalForm.forbiddenClaimsJson}
              onChange={(event) => setEvalForm((current) => ({ ...current, forbiddenClaimsJson: event.target.value }))}
              placeholder={'["enterprise is free"]'}
            />
          </AdminModalFormField>
          <CompanyAiFormActions
            backHref={backHref}
            submitLabel={isSubmitting ? "Creating..." : "Create eval"}
            isSubmitting={isSubmitting}
          />
        </div>
      </form>
    </div>
  );
}

