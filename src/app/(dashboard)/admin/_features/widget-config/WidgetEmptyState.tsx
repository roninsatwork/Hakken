import { AppWindow, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/src/ui/components/screens/Button";

type WidgetEmptyStateProps = {
  actionLabel?: string;
  description?: string;
  isSaving: boolean;
  onInitialize: () => void;
  title?: string;
};

export function WidgetEmptyState({
  actionLabel,
  description,
  isSaving,
  onInitialize,
  title,
}: WidgetEmptyStateProps) {
  const t = useTranslations("ai.widget.emptyState");
  actionLabel ??= t("action");
  description ??= t("description");
  title ??= t("title");
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
      <AppWindow className="w-10 h-10 text-brand mb-4 opacity-80" />
      <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>
      <p className="text-[13px] text-secondary max-w-sm mb-6">
        {description}
      </p>
      <Button
        variant="pill"
        onClick={onInitialize}
        disabled={isSaving}
        className="px-6 font-medium shadow-[0_0_20px_rgba(255,255,255,0.05)]"
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        <span>{actionLabel}</span>
      </Button>
    </div>
  );
}
