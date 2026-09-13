"use client";

import { lazy, Suspense, use } from "react";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ToolRuleCheckboxesProps } from "./EditToolContent";

const EditToolContent = lazy(() => import("./EditToolContent"));

function ToolLoadingState() {
  return (
    <div className="flex-1 w-full h-full flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted" />
    </div>
  );
}

function ToolRuleCheckboxes({
  confirmationRequired,
  isActive,
  onConfirmationRequiredChange,
  onIsActiveChange,
}: ToolRuleCheckboxesProps) {
  const t = useTranslations("admin.aiTools.edit");

  return (
    <>
      <span className="mt-1 text-[12px] font-medium text-secondary">{t("beforeRuns")}</span>
      <label className="flex items-center gap-3 min-h-[52px] px-4 rounded-[10px] border border-border-dim text-[13px] text-secondary">
        <input
          type="checkbox"
          checked={confirmationRequired}
          onChange={(event) => onConfirmationRequiredChange(event.target.checked)}
        />
        {t("requireApproval")}
      </label>
      <label className="flex items-center gap-3 min-h-[52px] px-4 rounded-[10px] border border-border-dim text-[13px] text-secondary">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => onIsActiveChange(event.target.checked)}
        />
        {t("active")}
      </label>
    </>
  );
}

export default function EditToolPage({ params }: { params: Promise<{ id: Id<"aiTools"> }> }) {
  const { id: toolId } = use(params);
  const tool = useQuery(api.aiTools.getToolById, { id: toolId });

  if (tool === undefined) {
    return <ToolLoadingState />;
  }

  if (!tool) {
    return null;
  }

  return (
    <Suspense fallback={<ToolLoadingState />}>
      <EditToolContent RuleCheckboxes={ToolRuleCheckboxes} tool={tool} toolId={toolId} />
    </Suspense>
  );
}
