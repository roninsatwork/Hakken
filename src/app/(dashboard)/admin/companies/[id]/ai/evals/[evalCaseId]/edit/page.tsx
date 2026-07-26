"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ClipboardCheck, Loader2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
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

type EvalTargetSurface = Doc<"companyEvalCases">["targetSurface"];

const WHERE_OPTIONS: Array<{ value: EvalTargetSurface; label: string; hint: string }> = [
  { value: "COMPANY_CHAT", label: "Internal chat", hint: "Staff asking your AI questions" },
  { value: "WIDGET", label: "Customer widget", hint: "The public widget on your site" },
];

function parsePhrases(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Editing a check.
 *
 * There was no way to do this at all: a typo meant archiving the check and starting
 * again, which lost its history too. Same five questions as creating one, so there is
 * one shape to learn.
 */
export default function EditCompanyEvalPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params.id as Id<"companies">;
  const evalCaseId = params.evalCaseId as Id<"companyEvalCases">;
  const fallbackHref = `/admin/companies/${companyId}/ai/evals`;
  const backHref = getSafeCompanyAiReturnTo(searchParams.get("returnTo"), companyId, fallbackHref);

  const evalCase = useQuery(api.companyEvals.getCaseById, { evalCaseId });
  const updateCase = useMutation(api.companyEvals.updateCase);
  const action = useAdminAction({ scope: "admin-company-eval-edit" });

  // The stored check is the value until the reader changes something, at which point
  // the draft takes over. Copying the query into state inside an effect would fight
  // the reader's typing every time the query refreshed, which is why the codebase
  // forbids it.
  type CheckForm = {
    name: string;
    prompt: string;
    expectedBehavior: string;
    targetSurface: EvalTargetSurface;
    mustPass: boolean;
  };
  const [draft, setDraft] = useState<CheckForm | null>(null);
  const [phraseDraftList, setPhraseDraftList] = useState<string[] | null>(null);
  const [phraseDraft, setPhraseDraft] = useState("");

  const stored: CheckForm = {
    name: evalCase?.name ?? "",
    prompt: evalCase?.prompt ?? "",
    expectedBehavior: evalCase?.expectedBehavior ?? "",
    targetSurface: evalCase?.targetSurface === "WIDGET" ? "WIDGET" : "COMPANY_CHAT",
    mustPass: evalCase?.severity === "BLOCKER",
  };
  const form = draft ?? stored;
  const bannedPhrases = phraseDraftList ?? parsePhrases(evalCase?.forbiddenClaimsJson);
  const setForm = (update: (current: CheckForm) => CheckForm) => setDraft(update(form));
  const setBannedPhrases = (update: (current: string[]) => string[]) => setPhraseDraftList(update(bannedPhrases));

  const addPhrase = () => {
    const phrase = phraseDraft.trim();
    if (!phrase || bannedPhrases.includes(phrase)) {
      setPhraseDraft("");
      return;
    }
    setBannedPhrases((current) => [...current, phrase]);
    setPhraseDraft("");
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await action.run(() => updateCase({
      evalCaseId,
      name: form.name,
      severity: form.mustPass ? "BLOCKER" : "ADVISORY",
      targetSurface: form.targetSurface,
      prompt: form.prompt,
      expectedBehavior: form.expectedBehavior,
      forbiddenClaimsJson: bannedPhrases.length > 0 ? JSON.stringify(bannedPhrases) : "",
    }), {
      fallbackMessage: "The check could not be saved.",
      suppressErrorToast: true,
    });
    if (outcome.ok) router.push(backHref);
  };

  if (evalCase === undefined) {
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
        title="Edit check"
        description="Changing the question or what a good answer must do retires this check's earlier results, so run it again afterwards."
        icon={<ClipboardCheck className="h-6 w-6 text-brand" />}
      />

      <form onSubmit={handleSave} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col gap-5">
          <AdminModalFormError>{action.error}</AdminModalFormError>

          <AdminModalFormField label="Name this check">
            <input
              className={adminModalInputClassName}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </AdminModalFormField>

          <AdminModalFormField label="What would someone ask?">
            <textarea
              required
              className={`${adminModalTextareaClassName} min-h-[110px]`}
              value={form.prompt}
              onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
            />
          </AdminModalFormField>

          <AdminModalFormField
            label="What does a good answer look like?"
            hint="Plain English. This is what the marking AI reads."
          >
            <textarea
              required
              className={`${adminModalTextareaClassName} min-h-[130px]`}
              value={form.expectedBehavior}
              onChange={(event) => setForm((current) => ({ ...current, expectedBehavior: event.target.value }))}
            />
          </AdminModalFormField>

          <AdminModalFormField label="Words it must never say" hint="Optional. Press Enter after each one.">
            <div className="flex flex-col gap-2">
              <input
                className={adminModalInputClassName}
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
              />
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
            </div>
          </AdminModalFormField>

          <AdminModalFormField label="Where does this apply?">
            <div className="flex flex-col gap-2">
              {WHERE_OPTIONS.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-border-dim px-3 py-2.5 transition-colors hover:bg-foreground/5">
                  <input
                    type="radio"
                    name="where"
                    checked={form.targetSurface === option.value}
                    onChange={() => setForm((current) => ({ ...current, targetSurface: option.value }))}
                    className="mt-0.5 accent-brand"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-foreground">{option.label}</span>
                    <span className="block text-[12px] text-secondary">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </AdminModalFormField>

          <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-border-dim px-3 py-2.5 transition-colors hover:bg-foreground/5">
            <input
              type="checkbox"
              checked={form.mustPass}
              onChange={(event) => setForm((current) => ({ ...current, mustPass: event.target.checked }))}
              className="mt-0.5 accent-brand"
            />
            <span>
              <span className="block text-[13px] font-semibold text-foreground">This must pass before the AI goes live</span>
              <span className="block text-[12px] text-secondary">Leave ticked for anything that would embarrass you in front of a customer.</span>
            </span>
          </label>

          <CompanyAiFormActions
            backHref={backHref}
            submitLabel={action.isBusy() ? "Saving…" : "Save check"}
            isSubmitting={action.isBusy()}
          />
        </div>
      </form>
    </div>
  );
}
