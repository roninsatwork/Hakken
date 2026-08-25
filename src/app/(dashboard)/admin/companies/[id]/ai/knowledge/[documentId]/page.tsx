"use client";

import { lazy, Suspense, use } from "react";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const loadKnowledgeDocumentContent = () => import("./KnowledgeDocumentContent");
const KnowledgeDocumentContent = lazy(() =>
  loadKnowledgeDocumentContent().then((module) => ({
    default: module.KnowledgeDocumentContent,
  })),
);

type InspectKnowledgeDocumentPageProps = {
  params: Promise<{
    id: Id<"companies">;
    documentId: Id<"knowledgeDocuments">;
  }>;
};

function LoadingState() {
  return (
    <div className="min-h-[420px] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-brand" />
    </div>
  );
}

export default function InspectKnowledgeDocumentPage({
  params,
}: InspectKnowledgeDocumentPageProps) {
  const { id: companyId, documentId } = use(params);
  const inspection = useQuery(api.knowledge.inspectDocument, { documentId });

  if (inspection === undefined) {
    return <LoadingState />;
  }

  return (
    <Suspense fallback={<LoadingState />}>
      <KnowledgeDocumentContent
        companyId={companyId}
        documentId={documentId}
        inspection={inspection}
      />
    </Suspense>
  );
}
