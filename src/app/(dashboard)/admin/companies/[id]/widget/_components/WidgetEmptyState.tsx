import { AppWindow, Loader2, Plus } from "lucide-react";

type WidgetEmptyStateProps = {
  isSaving: boolean;
  onInitialize: () => void;
};

export function WidgetEmptyState({ isSaving, onInitialize }: WidgetEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
      <AppWindow className="w-10 h-10 text-brand mb-4 opacity-80" />
      <h3 className="text-sm font-medium text-foreground mb-1">Unconfigured Integrations</h3>
      <p className="text-[13px] text-secondary max-w-sm mb-6">
        Establish a secure embeddable widget to let your clients chat directly with your company intelligence.
      </p>
      <button
        onClick={onInitialize}
        disabled={isSaving}
        className="flex items-center gap-2 px-6 py-3 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        <span>Initialize Master Widget</span>
      </button>
    </div>
  );
}
