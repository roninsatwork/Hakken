"use client";

import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { KnowledgeManager } from "@/src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager";
import { AiWorkspaceNav } from "../_components/AiWorkspaceNav";

export default function GlobalKnowledgeBasePage() {
  const t = useTranslations("ai.knowledge");

  return (
    <KnowledgeManager
      scope={{ type: "global" }}
      header={(
        <>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                <Globe className="w-6 h-6 text-brand" />
                {t("title")}
              </h1>
              <p className="text-[13px] text-secondary mt-1 tracking-wide">
                {t("subtitle")}
              </p>
            </div>
          </div>
          <AiWorkspaceNav />
        </>
      )}
      emptyDocumentDescription="Upload PDF, Word or Markdown files — or drop a whole OKF folder — so the AI can securely learn about structural system operations."
      deleteDocumentDescription={(title) => (
        <>
          Are you sure you want to remove <strong>{title}</strong> from Sonae&apos;s memory?
        </>
      )}
    />
  );
}
