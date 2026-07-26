"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, usePaginatedQuery } from "convex/react";
import { ClipboardCheck, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  AdminModalFormError,
  AdminModalFormField,
  adminModalInputClassName,
  adminModalTextareaClassName,
} from "@/src/app/(dashboard)/admin/_components/AdminModalForm";
import { CompanySkillCheckboxPicker } from "@/src/app/(dashboard)/admin/_components/CompanySkillCheckboxPicker";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import {
  CompanyAiFormActions,
  CompanyAiFormPageHeader,
  getSafeCompanyAiReturnTo,
} from "@/src/app/(dashboard)/admin/companies/[id]/ai/_components/CompanyAiFormPage";

type CompanyEvalCase = Doc<"companyEvalCases">;
type EvalTargetSurface = CompanyEvalCase["targetSurface"];

/**
 * Five fields, and nothing to type in code.
 *
 * This form had fifteen, three of them raw JSON textareas and one a ten-option
 * dropdown of machine constants that fed a field nothing ever read. A capable
 * person who does not build software could not fill it in, and a misplaced bracket
 * failed quietly.
 *
 * What survives is what a check actually is: a question, a description of a good
 * answer, optionally some phrases it must never say, whether it gates going live,
 * and where it applies. Category is gone entirely. Severity is a checkbox. The
 * "judge rubric" box is merged into the description of a good answer, because two
 * boxes asking the same question is why neither got filled in.
 */
const WHERE_OPTIONS: Array<{ value: EvalTargetSurface; label: string; hint: string }> = [
  { value: "COMPANY_CHAT", label: "Internal chat", hint: "Staff asking your AI questions" },
  { value: "WIDGET", label: "Customer widget", hint: "The public widget on your site" },
];

const DEFAULT_FORM = {
  name: "",
  prompt: "",
  expectedBehavior: "",
  targetSurface: "COMPANY_CHAT" as EvalTargetSurface,
  mustPass: true,
};

export default function NewCompanyEvalPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params.id as Id<"companies">;
  const fallbackHref = `/admin/companies/${companyId}/ai/evals`;
  const backHref = getSafeCompanyAiReturnTo(searchParams.get("returnTo"), companyId, fallbackHref);
  const createCase = useMutation(api.companyEvals.createCase);
  const activeSkills = usePaginatedQuery(
    api.companySkills.getSkillsForCompany,
    { companyId, status: "ACTIVE" },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );

  const [form, setForm] = useState(DEFAULT_FORM);
  const [requiredSkillIds, setRequiredSkillIds] = useState<Array<Id<"companySkills">>>([]);
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

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await action.run(() => createCase({
      companyId,
      name: form.name,
      // Category no longer appears on screen. The field is still required by the
      // mutation until the migration drops it, so it is stamped with the one value
      // that describes every check here: the answer must be right.
      category: "NO_HALLUCINATION",
      severity: form.mustPass ? "BLOCKER" : "ADVISORY",
      targetSurface: form.targetSurface,
      prompt: form.prompt,
      expectedBehavior: form.expectedBehavior,
      // Built from the tag list, so nobody types JSON.
      forbiddenClaimsJson: bannedPhrases.length > 0 ? JSON.stringify(bannedPhrases) : undefined,
      requiredSkillsJson: requiredSkillIds.length > 0 ? JSON.stringify(requiredSkillIds) : undefined,
    }), {
      fallbackMessage: "The check could not be created.",
      // The form renders the message itself, so a toast would repeat it.
      suppressErrorToast: true,
    });
    if (outcome.ok) router.push(backHref);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <CompanyAiFormPageHeader
        backHref={backHref}
        title="New check"
        description="A question, and what a good answer looks like. Running it asks your AI and has a second AI mark the reply."
        icon={<ClipboardCheck className="h-6 w-6 text-brand" />}
      />

      <form onSubmit={handleCreate} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col gap-5">
          <AdminModalFormError>{action.error}</AdminModalFormError>

          <AdminModalFormField label="Name this check">
            <input
              className={adminModalInputClassName}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Doesn't invent pricing"
            />
          </AdminModalFormField>

          <AdminModalFormField label="What would someone ask?">
            <textarea
              required
              className={`${adminModalTextareaClassName} min-h-[110px]`}
              value={form.prompt}
              onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
              placeholder="How much does your enterprise plan cost?"
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
              placeholder="Should say pricing isn't published and offer to put them in touch with sales. Must never quote a figure."
            />
          </AdminModalFormField>

          {/* A tag list, not a JSON array. The old form asked for ["enterprise is
              free"] typed by hand, brackets and quotes included. */}
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

          {/* Collapsed, so the form still reads as five questions. Requiring a skill
              only became meaningful once runs started recording which skills reached
              the model; before that, such a check could never pass. */}
          <details className="rounded-[8px] border border-border-dim px-3 py-2.5">
            <summary className="cursor-pointer text-[13px] font-semibold text-foreground">
              Advanced
            </summary>
            <div className="mt-4">
              <AdminModalFormField
                label="The answer must use these skills"
                hint={`${requiredSkillIds.length} selected. Leave empty unless you are testing that a particular skill gets used.`}
              >
                <CompanySkillCheckboxPicker
                  skills={activeSkills.results}
                  selectedSkillIds={requiredSkillIds}
                  status={activeSkills.status}
                  emptyMessage="No skills are available to this company yet. Add one from the Skill Center first."
                  onToggleSkill={(skillId) => setRequiredSkillIds((current) =>
                    current.includes(skillId)
                      ? current.filter((id) => id !== skillId)
                      : [...current, skillId]
                  )}
                  onLoadMore={() => activeSkills.loadMore(ADMIN_PAGE_SIZE)}
                />
              </AdminModalFormField>
            </div>
          </details>

          <CompanyAiFormActions
            backHref={backHref}
            submitLabel={action.isBusy() ? "Creating…" : "Create check"}
            isSubmitting={action.isBusy()}
          />
        </div>
      </form>
    </div>
  );
}
