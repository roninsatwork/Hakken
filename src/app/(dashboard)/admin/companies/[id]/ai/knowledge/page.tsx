"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { KnowledgeManager } from "@/src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager";
import { useTranslations } from "next-intl";

export default function CompanyKnowledgeBasePage() {
  const t = useTranslations("admin.companyDetails.knowledge");
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  return (
    <KnowledgeManager
      scope={{ type: "company", companyId }}
      header={(
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium tracking-tight">{t("title")}</h2>
            <p className="text-secondary text-[13px] mt-1">{t("subtitle")}</p>
          </div>
        </div>
      )}
      emptyDocumentDescription={t("emptyDescription")}
      getInspectDocumentHref={(documentId) => `/admin/companies/${companyId}/ai/knowledge/${documentId}`}
      deleteDocumentDescription={(title) => (
        <>
          {t.rich("deleteDescription", {
            title: title ?? "",
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </>
      )}
    />
  );
}
