"use client";

import { useParams } from "next/navigation";
import { Library } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { KnowledgeManager } from "@/src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager";

export default function AgentKnowledgePage() {
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
              Agent knowledge
            </h2>
            <p className="text-[13px] text-secondary mt-1">
              Inspect and manage the tenant-scoped knowledge available to this agent.
            </p>
          </div>
        </div>
      )}
      emptyDocumentDescription="Upload documents, Markdown or an OKF folder, text, or website pages so this agent can retrieve approved tenant-scoped reference material."
      deleteDocumentDescription={(title) => (
        <>
          Are you sure you want to remove <strong>{title}</strong> from this agent&apos;s knowledge?
        </>
      )}
    />
  );
}
