"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { BrainCircuit } from "lucide-react";
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

type CompanySkill = Doc<"companySkills">;
type SkillStatus = CompanySkill["status"];
type SkillRisk = CompanySkill["riskLevel"];

const SKILL_STATUSES: Array<{ value: SkillStatus; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Draft" },
];

const SKILL_RISKS: Array<{ value: SkillRisk; label: string }> = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

const DEFAULT_SKILL_FORM = {
  name: "",
  description: "",
  category: "GENERAL",
  status: "ACTIVE" as SkillStatus,
  riskLevel: "MEDIUM" as SkillRisk,
  instruction: "",
  inputContractJson: "",
  outputContractJson: "",
  requiredToolsJson: "",
  approvalPolicyJson: "",
  recommendedKnowledgeJson: "",
  versionLabel: "v1",
};

export default function NewCompanySkillPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params.id as Id<"companies">;
  const fallbackHref = `/admin/companies/${companyId}/ai/skills`;
  const backHref = getSafeCompanyAiReturnTo(searchParams.get("returnTo"), companyId, fallbackHref);
  const createSkill = useMutation(api.companySkills.createSkill);

  const [skillForm, setSkillForm] = useState(DEFAULT_SKILL_FORM);
  const [skillError, setSkillError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateSkill = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSkillError("");
    try {
      await createSkill({
        companyId,
        name: skillForm.name,
        description: skillForm.description || undefined,
        category: skillForm.category,
        status: skillForm.status,
        riskLevel: skillForm.riskLevel,
        instruction: skillForm.instruction,
        inputContractJson: skillForm.inputContractJson || undefined,
        outputContractJson: skillForm.outputContractJson || undefined,
        requiredToolsJson: skillForm.requiredToolsJson || undefined,
        approvalPolicyJson: skillForm.approvalPolicyJson || undefined,
        recommendedKnowledgeJson: skillForm.recommendedKnowledgeJson || undefined,
        versionLabel: skillForm.versionLabel || undefined,
      });
      router.push(backHref);
    } catch (error) {
      setSkillError(error instanceof Error ? error.message : "Company skill could not be created.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <CompanyAiFormPageHeader
        backHref={backHref}
        title="New Company Skill"
        description="Create a governed company capability with room for instructions, contracts, required tools, and approval policy."
        icon={<BrainCircuit className="h-6 w-6 text-brand" />}
      />

      <form onSubmit={handleCreateSkill} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col gap-5">
          <AdminModalFormError>{skillError}</AdminModalFormError>
          <AdminModalFormField label="Name">
            <input
              className={adminModalInputClassName}
              value={skillForm.name}
              onChange={(event) => setSkillForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Proposal drafting"
            />
          </AdminModalFormField>
          <AdminModalFormField label="Description">
            <textarea
              className={`${adminModalTextareaClassName} min-h-[160px]`}
              value={skillForm.description}
              onChange={(event) => setSkillForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="What this company capability does."
            />
          </AdminModalFormField>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <AdminModalFormField label="Category">
              <input
                className={adminModalInputClassName}
                value={skillForm.category}
                onChange={(event) => setSkillForm((current) => ({ ...current, category: event.target.value }))}
                placeholder="SALES"
              />
            </AdminModalFormField>
            <AdminModalFormField label="Status">
              <select
                className={adminModalInputClassName}
                value={skillForm.status}
                onChange={(event) => setSkillForm((current) => ({ ...current, status: event.target.value as SkillStatus }))}
              >
                {SKILL_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </AdminModalFormField>
            <AdminModalFormField label="Risk">
              <select
                className={adminModalInputClassName}
                value={skillForm.riskLevel}
                onChange={(event) => setSkillForm((current) => ({ ...current, riskLevel: event.target.value as SkillRisk }))}
              >
                {SKILL_RISKS.map((risk) => <option key={risk.value} value={risk.value}>{risk.label}</option>)}
              </select>
            </AdminModalFormField>
            <AdminModalFormField label="Version">
              <input
                className={adminModalInputClassName}
                value={skillForm.versionLabel}
                onChange={(event) => setSkillForm((current) => ({ ...current, versionLabel: event.target.value }))}
                placeholder="v1"
              />
            </AdminModalFormField>
          </div>
          <AdminModalFormField label="Instruction">
            <textarea
              required
              className={`${adminModalTextareaClassName} min-h-[220px]`}
              value={skillForm.instruction}
              onChange={(event) => setSkillForm((current) => ({ ...current, instruction: event.target.value }))}
              placeholder="Governed behavior inserted when this skill is selected."
            />
          </AdminModalFormField>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <AdminModalFormField label="Required tools" hint="JSON string array">
              <textarea
                className={`${adminModalTextareaClassName} min-h-[170px] font-mono`}
                value={skillForm.requiredToolsJson}
                onChange={(event) => setSkillForm((current) => ({ ...current, requiredToolsJson: event.target.value }))}
                placeholder={'["crm.proposals.read"]'}
              />
            </AdminModalFormField>
            <AdminModalFormField label="Approval policy" hint="Optional JSON">
              <textarea
                className={`${adminModalTextareaClassName} min-h-[170px] font-mono`}
                value={skillForm.approvalPolicyJson}
                onChange={(event) => setSkillForm((current) => ({ ...current, approvalPolicyJson: event.target.value }))}
                placeholder={'{"mode":"approval_required","before":["send"]}'}
              />
            </AdminModalFormField>
            <AdminModalFormField label="Input contract" hint="Optional JSON">
              <textarea
                className={`${adminModalTextareaClassName} min-h-[170px] font-mono`}
                value={skillForm.inputContractJson}
                onChange={(event) => setSkillForm((current) => ({ ...current, inputContractJson: event.target.value }))}
                placeholder={'{"required":["brief"]}'}
              />
            </AdminModalFormField>
            <AdminModalFormField label="Output contract" hint="Optional JSON">
              <textarea
                className={`${adminModalTextareaClassName} min-h-[170px] font-mono`}
                value={skillForm.outputContractJson}
                onChange={(event) => setSkillForm((current) => ({ ...current, outputContractJson: event.target.value }))}
                placeholder={'{"type":"proposal_section"}'}
              />
            </AdminModalFormField>
          </div>
          <AdminModalFormField label="Recommended knowledge" hint="Optional JSON">
            <textarea
              className={`${adminModalTextareaClassName} min-h-[170px] font-mono`}
              value={skillForm.recommendedKnowledgeJson}
              onChange={(event) => setSkillForm((current) => ({ ...current, recommendedKnowledgeJson: event.target.value }))}
              placeholder={'{"scopes":["company"]}'}
            />
          </AdminModalFormField>
          <CompanyAiFormActions
            backHref={backHref}
            submitLabel={isSubmitting ? "Creating..." : "Create skill"}
            isSubmitting={isSubmitting}
          />
        </div>
      </form>
    </div>
  );
}

