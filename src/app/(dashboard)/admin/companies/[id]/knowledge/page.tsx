"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { KnowledgeManager } from "@/src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager";
import { CompanyAiSectionNav } from "@/src/app/(dashboard)/admin/companies/[id]/ai/_components/CompanyAiSectionNav";

export default function CompanyKnowledgeBasePage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  return (
    <KnowledgeManager
      scope={{ type: "company", companyId }}
      header={(
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium tracking-tight">AI Knowledge</h2>
              <p className="text-secondary text-[13px] mt-1">Connect different data sources for the agent knowledgebase</p>
            </div>
          </div>
          <CompanyAiSectionNav />
        </div>
      )}
      emptyDocumentDescription="Upload PDF or DOCX files so the AI can securely learn about this company."
      getInspectDocumentHref={(documentId) => `/admin/companies/${companyId}/ai/knowledge/${documentId}`}
      deleteDocumentDescription={(title) => (
        <>
          Are you sure you want to remove <strong>{title}</strong> from this workspace&apos;s memory?
        </>
      )}
    />
  );
}
