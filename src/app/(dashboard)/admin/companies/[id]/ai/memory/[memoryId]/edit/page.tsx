"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { BrainCircuit, Loader2 } from "lucide-react";
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
  type MemoryCategory,
} from "@/src/app/(dashboard)/admin/companies/[id]/ai/memory/_components/CompanyMemoryFormFields";

const DEFAULT_FORM: CompanyMemoryFormData = {
  title: "",
  content: "",
  category: "FACT",
  confidence: "0.8",
  reason: "",
};

export default function EditCompanyMemoryPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params.id as Id<"companies">;
  const memoryId = params.memoryId as Id<"companyMemories">;
  const fallbackHref = `/admin/companies/${companyId}/ai/memory`;
  const backHref = getSafeCompanyAiReturnTo(searchParams.get("returnTo"), companyId, fallbackHref);
  const memory = useQuery(api.companyMemories.getMemoryById, { memoryId });
  const updateMemory = useMutation(api.companyMemories.updateMemory);

  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!memory || hasHydrated) return;
    setFormData({
      title: memory.title,
      content: memory.content,
      category: memory.category as MemoryCategory,
      confidence: String(memory.confidence),
      reason: "",
    });
    setHasHydrated(true);
  }, [hasHydrated, memory]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");
    try {
      await updateMemory({
        memoryId,
        title: formData.title,
        content: formData.content,
        category: formData.category,
        confidence: Number(formData.confidence),
      });
      router.push(backHref);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Company memory could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (memory === undefined || !hasHydrated) {
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
        title="Edit Memory"
        description="Review and adjust approved company context on a full screen before it returns to runtime evidence."
        icon={<BrainCircuit className="h-6 w-6 text-brand" />}
      />
      <form onSubmit={handleSubmit} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col gap-5">
          <AdminModalFormError>{submitError}</AdminModalFormError>
          <CompanyMemoryFormFields formData={formData} setFormData={setFormData} />
          <CompanyAiFormActions
            backHref={backHref}
            submitLabel={isSubmitting ? "Saving..." : "Save memory"}
            isSubmitting={isSubmitting}
          />
        </div>
      </form>
    </div>
  );
}

