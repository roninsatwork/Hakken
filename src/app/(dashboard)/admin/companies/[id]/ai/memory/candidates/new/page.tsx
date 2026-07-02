"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { Clock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminModalFormError } from "@/src/app/(dashboard)/admin/_components/AdminModalForm";
import {
  CompanyAiFormActions,
  CompanyAiFormPageHeader,
  getSafeCompanyAiReturnTo,
} from "@/src/app/(dashboard)/admin/companies/[id]/ai/_components/CompanyAiFormPage";
import {
  CompanyMemoryFormFields,
  type CompanyMemoryFormData,
} from "@/src/app/(dashboard)/admin/companies/[id]/ai/memory/_components/CompanyMemoryFormFields";

const DEFAULT_FORM: CompanyMemoryFormData = {
  title: "",
  content: "",
  category: "FACT",
  confidence: "0.65",
  reason: "",
};

export default function NewCompanyMemoryCandidatePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params.id as Id<"companies">;
  const fallbackHref = `/admin/companies/${companyId}/ai/memory`;
  const backHref = getSafeCompanyAiReturnTo(searchParams.get("returnTo"), companyId, fallbackHref);
  const createCandidate = useMutation(api.companyMemories.createCandidate);

  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");
    try {
      await createCandidate({
        companyId,
        title: formData.title || undefined,
        content: formData.content,
        category: formData.category,
        reason: formData.reason || undefined,
        confidence: Number(formData.confidence),
      });
      router.push(backHref);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Memory suggestion could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <CompanyAiFormPageHeader
        backHref={backHref}
        title="Suggest Memory"
        description="Propose company context for review. It will not become trusted memory until someone approves it."
        icon={<Clock className="h-6 w-6 text-brand" />}
      />
      <form onSubmit={handleSubmit} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col gap-5">
          <AdminModalFormError>{submitError}</AdminModalFormError>
          <CompanyMemoryFormFields formData={formData} setFormData={setFormData} showReason titleHint="Optional" />
          <CompanyAiFormActions
            backHref={backHref}
            submitLabel={isSubmitting ? "Saving..." : "Save suggestion"}
            isSubmitting={isSubmitting}
          />
        </div>
      </form>
    </div>
  );
}
