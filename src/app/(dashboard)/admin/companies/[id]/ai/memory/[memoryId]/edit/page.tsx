"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { BrainCircuit, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
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
  const action = useAdminAction({ scope: "admin-company-ai" });

  // Hydrating during render rather than in an effect: React re-runs this
  // component before committing, so the fields are populated in the same
  // paint. In an effect the user sees an empty form first.
  if (memory && !hasHydrated) {
      setFormData({
        title: memory.title,
        content: memory.content,
        category: memory.category as MemoryCategory,
        confidence: String(memory.confidence),
        reason: "",
      });
      setHasHydrated(true);
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await action.run(() => updateMemory({
          memoryId,
          title: formData.title,
          content: formData.content,
          category: formData.category,
          confidence: Number(formData.confidence),
      }), {
      fallbackMessage: "Company memory could not be saved.",
      // The form renders the message itself, so a toast would repeat it.
      suppressErrorToast: true,
    });
    // The filled-in form stays on screen if the save failed.
    if (outcome.ok) router.push(backHref);
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
          <AdminModalFormError>{action.error}</AdminModalFormError>
          <CompanyMemoryFormFields formData={formData} setFormData={setFormData} />
          <CompanyAiFormActions
            backHref={backHref}
            submitLabel={action.isBusy() ? "Saving..." : "Save memory"}
            isSubmitting={action.isBusy()}
          />
        </div>
      </form>
    </div>
  );
}

