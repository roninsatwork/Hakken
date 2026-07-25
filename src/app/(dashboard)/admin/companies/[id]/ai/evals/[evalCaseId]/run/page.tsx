"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ClipboardCheck, Loader2, Play } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import { useAdminAction } from "@/src/hooks/useAdminAction";

const DEFAULT_RUN_FORM = {
  answer: "",
  evidenceJson: "",
  resolvedModelId: "",
  resolvedUseCase: "chat",
  judgeNotes: "",
};

function formatPercent(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function buildEvidenceJson(evidenceJson: string, selectedSkillIds: Array<Id<"companySkills">>) {
  const trimmedEvidence = evidenceJson.trim();
  const evidence = trimmedEvidence ? JSON.parse(trimmedEvidence) : {};
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("Evidence JSON must be a JSON object.");
  }

  const existingSkillIds = Array.isArray((evidence as { skillIds?: unknown }).skillIds)
    ? (evidence as { skillIds: unknown[] }).skillIds.filter((skillId): skillId is string => typeof skillId === "string")
    : [];
  const skillIds = Array.from(new Set([...existingSkillIds, ...selectedSkillIds]));
  const mergedEvidence = skillIds.length > 0 ? { ...evidence, skillIds } : evidence;
  return Object.keys(mergedEvidence).length > 0 ? JSON.stringify(mergedEvidence) : undefined;
}

export default function RunCompanyEvalPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params.id as Id<"companies">;
  const evalCaseId = params.evalCaseId as Id<"companyEvalCases">;
  const fallbackHref = `/admin/companies/${companyId}/ai/evals`;
  const backHref = getSafeCompanyAiReturnTo(searchParams.get("returnTo"), companyId, fallbackHref);
  const evalCase = useQuery(api.companyEvals.getCaseById, { evalCaseId });
  const runCase = useMutation(api.companyEvals.runCase);
  const activeSkills = usePaginatedQuery(
    api.companySkills.getSkillsForCompany,
    { companyId, status: "ACTIVE" },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );

  const [runForm, setRunForm] = useState(DEFAULT_RUN_FORM);
  const [evidenceSkillIds, setEvidenceSkillIds] = useState<Array<Id<"companySkills">>>([]);
  const [validationError, setValidationError] = useState("");
  const [runFeedback, setRunFeedback] = useState("");
  const action = useAdminAction({ scope: "admin-company-eval-run" });

  const toggleEvidenceSkill = (skillId: Id<"companySkills">) => {
    setEvidenceSkillIds((current) =>
      current.includes(skillId)
        ? current.filter((id) => id !== skillId)
        : [...current, skillId]
    );
  };

  const handleRunCase = async (event: FormEvent) => {
    event.preventDefault();
    setValidationError("");
    setRunFeedback("");

    // Parsing the evidence field is the author's own typing being checked, not
    // a server failure, so it stays out of the runner — otherwise a stray comma
    // would be reported to error tracking as an incident.
    let evidenceJson: string | undefined;
    try {
      evidenceJson = buildEvidenceJson(runForm.evidenceJson, evidenceSkillIds);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Evidence JSON could not be read.");
      return;
    }

    const outcome = await action.run(
      () => runCase({
        evalCaseId,
        answer: runForm.answer,
        evidenceJson,
        resolvedModelId: runForm.resolvedModelId || undefined,
        resolvedUseCase: runForm.resolvedUseCase || undefined,
        judgeNotes: runForm.judgeNotes || undefined,
      }),
      { fallbackMessage: "Eval run could not be recorded.", suppressErrorToast: true },
    );
    if (!outcome.ok) return;

    if (outcome.data.status === "FAILED") {
      setRunFeedback(`Run recorded as failed at ${formatPercent(outcome.data.score)}. Stay here to adjust evidence or go back to the eval list.`);
      return;
    }
    router.push(backHref);
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
        title="Run Eval"
        description="Record answer and runtime evidence on a full page so deterministic checks are easy to review."
        icon={<Play className="h-6 w-6 text-brand" />}
      />

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex items-start gap-3">
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">{evalCase.name}</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-secondary">{evalCase.prompt}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">{evalCase.expectedBehavior}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-widest text-muted">
              <span>{evalCase.category}</span>
              <span>{evalCase.severity}</span>
              <span>{evalCase.targetSurface}</span>
              {evalCase.expectedModelUseCase && <span>model: {evalCase.expectedModelUseCase}</span>}
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={handleRunCase} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col gap-5">
          <AdminModalFormError>{validationError || action.error}</AdminModalFormError>
          {runFeedback && (
            <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">
              {runFeedback}
            </div>
          )}
          <AdminModalFormField label="Answer">
            <textarea
              required
              className={`${adminModalTextareaClassName} min-h-[240px]`}
              value={runForm.answer}
              onChange={(event) => setRunForm((current) => ({ ...current, answer: event.target.value }))}
              placeholder="Answer produced by the company AI."
            />
          </AdminModalFormField>
          <AdminModalFormField label="Evidence JSON" hint="sourceIds and memoryIds; selected skills are added automatically">
            <textarea
              className={`${adminModalTextareaClassName} min-h-[190px] font-mono`}
              value={runForm.evidenceJson}
              onChange={(event) => setRunForm((current) => ({ ...current, evidenceJson: event.target.value }))}
              placeholder={'{"sourceIds":[],"memoryIds":[]}'}
            />
          </AdminModalFormField>
          <AdminModalFormField label="Skill evidence" hint={`${evidenceSkillIds.length} selected from active central skills available to this company`}>
            <CompanySkillCheckboxPicker
              skills={activeSkills.results}
              selectedSkillIds={evidenceSkillIds}
              status={activeSkills.status}
              emptyMessage="No active central skills are available to this company."
              onToggleSkill={toggleEvidenceSkill}
              onLoadMore={() => activeSkills.loadMore(ADMIN_PAGE_SIZE)}
            />
          </AdminModalFormField>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <AdminModalFormField label="Resolved model">
              <input
                className={adminModalInputClassName}
                value={runForm.resolvedModelId}
                onChange={(event) => setRunForm((current) => ({ ...current, resolvedModelId: event.target.value }))}
                placeholder="model-id"
              />
            </AdminModalFormField>
            <AdminModalFormField label="Resolved use case">
              <input
                className={adminModalInputClassName}
                value={runForm.resolvedUseCase}
                onChange={(event) => setRunForm((current) => ({ ...current, resolvedUseCase: event.target.value }))}
                placeholder="chat"
              />
            </AdminModalFormField>
          </div>
          <AdminModalFormField label="Judge notes" hint="Optional">
            <textarea
              className={`${adminModalTextareaClassName} min-h-[180px]`}
              value={runForm.judgeNotes}
              onChange={(event) => setRunForm((current) => ({ ...current, judgeNotes: event.target.value }))}
              placeholder="Manual notes until LLM judge is wired."
            />
          </AdminModalFormField>
          <CompanyAiFormActions
            backHref={backHref}
            submitLabel={action.isBusy() ? "Running..." : "Record run"}
            isSubmitting={action.isBusy()}
          />
        </div>
      </form>
    </div>
  );
}
