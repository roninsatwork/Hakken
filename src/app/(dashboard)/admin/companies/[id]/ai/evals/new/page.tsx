"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, usePaginatedQuery } from "convex/react";
import { ClipboardCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { CompanySkillCheckboxPicker } from "@/src/app/(dashboard)/admin/_components/CompanySkillCheckboxPicker";
import {
  AdminModalFormError,
  AdminModalFormField,
  adminModalInputClassName,
  adminModalTextareaClassName,
} from "@/src/app/(dashboard)/admin/_components/AdminModalForm";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
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

const DEFAULT_CASE_FORM = {
  name: "",
  category: "NO_HALLUCINATION" as EvalCategory,
  severity: "BLOCKER" as EvalSeverity,
  targetSurface: "COMPANY_CHAT" as EvalTargetSurface,
  prompt: "",
  expectedBehavior: "",
  forbiddenClaimsJson: "",
  requiredSourcesJson: "",
  requiredMemoriesJson: "",
  expectedModelUseCase: "chat",
  judgeRubric: "",
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

  const [caseForm, setCaseForm] = useState(DEFAULT_CASE_FORM);
  const [requiredSkillIds, setRequiredSkillIds] = useState<Array<Id<"companySkills">>>([]);
  const action = useAdminAction({ scope: "admin-company-ai" });

  const toggleRequiredSkill = (skillId: Id<"companySkills">) => {
    setRequiredSkillIds((current) =>
      current.includes(skillId)
        ? current.filter((id) => id !== skillId)
        : [...current, skillId]
    );
  };

  const handleCreateCase = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await action.run(() => createCase({
          companyId,
          name: caseForm.name,
          category: caseForm.category,
          severity: caseForm.severity,
          targetSurface: caseForm.targetSurface,
          prompt: caseForm.prompt,
          expectedBehavior: caseForm.expectedBehavior,
          forbiddenClaimsJson: caseForm.forbiddenClaimsJson || undefined,
          requiredSourcesJson: caseForm.requiredSourcesJson || undefined,
          requiredMemoriesJson: caseForm.requiredMemoriesJson || undefined,
          requiredSkillsJson: requiredSkillIds.length > 0 ? JSON.stringify(requiredSkillIds) : undefined,
          expectedModelUseCase: caseForm.expectedModelUseCase || undefined,
          judgeRubric: caseForm.judgeRubric || undefined,
      }), {
      fallbackMessage: "Eval case could not be created.",
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
        title="New Eval"
        description="Create a company readiness test with full room for prompts, expected behavior, deterministic JSON checks, and future judge notes."
        icon={<ClipboardCheck className="h-6 w-6 text-brand" />}
      />

      <form onSubmit={handleCreateCase} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col gap-5">
          <AdminModalFormError>{action.error}</AdminModalFormError>
          <AdminModalFormField label="Name">
            <input
              className={adminModalInputClassName}
              value={caseForm.name}
              onChange={(event) => setCaseForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Widget does not invent pricing"
            />
          </AdminModalFormField>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <AdminModalFormField label="Category">
              <select
                className={adminModalInputClassName}
                value={caseForm.category}
                onChange={(event) => setCaseForm((current) => ({ ...current, category: event.target.value as EvalCategory }))}
              >
                {EVAL_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </AdminModalFormField>
            <AdminModalFormField label="Severity">
              <select
                className={adminModalInputClassName}
                value={caseForm.severity}
                onChange={(event) => setCaseForm((current) => ({ ...current, severity: event.target.value as EvalSeverity }))}
              >
                {EVAL_SEVERITIES.map((severity) => <option key={severity.value} value={severity.value}>{severity.label}</option>)}
              </select>
            </AdminModalFormField>
            <AdminModalFormField label="Surface">
              <select
                className={adminModalInputClassName}
                value={caseForm.targetSurface}
                onChange={(event) => setCaseForm((current) => ({ ...current, targetSurface: event.target.value as EvalTargetSurface }))}
              >
                {EVAL_TARGETS.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}
              </select>
            </AdminModalFormField>
          </div>
          <AdminModalFormField label="Prompt">
            <textarea
              required
              className={`${adminModalTextareaClassName} min-h-[190px]`}
              value={caseForm.prompt}
              onChange={(event) => setCaseForm((current) => ({ ...current, prompt: event.target.value }))}
              placeholder="Question or task the company AI must handle."
            />
          </AdminModalFormField>
          <AdminModalFormField label="Expected behavior">
            <textarea
              required
              className={`${adminModalTextareaClassName} min-h-[190px]`}
              value={caseForm.expectedBehavior}
              onChange={(event) => setCaseForm((current) => ({ ...current, expectedBehavior: event.target.value }))}
              placeholder="Describe what a passing answer must do."
            />
          </AdminModalFormField>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <AdminModalFormField label="Forbidden claims" hint="JSON string array">
              <textarea
                className={`${adminModalTextareaClassName} min-h-[160px] font-mono`}
                value={caseForm.forbiddenClaimsJson}
                onChange={(event) => setCaseForm((current) => ({ ...current, forbiddenClaimsJson: event.target.value }))}
                placeholder={'["enterprise is free"]'}
              />
            </AdminModalFormField>
            <AdminModalFormField label="Expected model use case">
              <input
                className={adminModalInputClassName}
                value={caseForm.expectedModelUseCase}
                onChange={(event) => setCaseForm((current) => ({ ...current, expectedModelUseCase: event.target.value }))}
                placeholder="chat"
              />
            </AdminModalFormField>
            <AdminModalFormField label="Required sources" hint="JSON string array">
              <textarea
                className={`${adminModalTextareaClassName} min-h-[160px] font-mono`}
                value={caseForm.requiredSourcesJson}
                onChange={(event) => setCaseForm((current) => ({ ...current, requiredSourcesJson: event.target.value }))}
                placeholder={'["source-id"]'}
              />
            </AdminModalFormField>
            <AdminModalFormField label="Required memories" hint="JSON string array">
              <textarea
                className={`${adminModalTextareaClassName} min-h-[160px] font-mono`}
                value={caseForm.requiredMemoriesJson}
                onChange={(event) => setCaseForm((current) => ({ ...current, requiredMemoriesJson: event.target.value }))}
                placeholder={'["memory-id"]'}
              />
            </AdminModalFormField>
          </div>
          <AdminModalFormField label="Required skills" hint={`${requiredSkillIds.length} selected from active central skills available to this company`}>
            <CompanySkillCheckboxPicker
              skills={activeSkills.results}
              selectedSkillIds={requiredSkillIds}
              status={activeSkills.status}
              emptyMessage="No active central skills are available to this company. Add a skill from Skill Center first."
              onToggleSkill={toggleRequiredSkill}
              onLoadMore={() => activeSkills.loadMore(ADMIN_PAGE_SIZE)}
            />
          </AdminModalFormField>
          <AdminModalFormField label="Judge rubric" hint="Optional, qualitative judge planned">
            <textarea
              className={`${adminModalTextareaClassName} min-h-[170px]`}
              value={caseForm.judgeRubric}
              onChange={(event) => setCaseForm((current) => ({ ...current, judgeRubric: event.target.value }))}
              placeholder="Notes for later qualitative judging."
            />
          </AdminModalFormField>
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
