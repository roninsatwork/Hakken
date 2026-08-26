"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Library } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { KnowledgeManager } from "@/src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager";

export default function AgentKnowledgePage() {
  const t = useTranslations("admin.agents.details.knowledge.agent");
  const params = useParams();
  const agentId = params.id as Id<"agents">;

  return (
    <KnowledgeManager
      scope={{ type: "agent", agentId }}
      header={(
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold text-foreground tracking-tight flex items-center gap-2">
              <Library className="w-5 h-5 text-brand" />
              {t("headerTitle")}
            </h2>
            <p className="text-[13px] text-secondary mt-1">
              {t("headerDescription")}
            </p>
          </div>
        </div>
      )}
      emptyDocumentDescription={t("emptyDescription")}
      deleteDocumentDescription={(title) => t.rich("deleteDescription", {
        title: title ?? "",
        highlight: (chunks) => <strong>{chunks}</strong>,
      })}
    />
  );
}
