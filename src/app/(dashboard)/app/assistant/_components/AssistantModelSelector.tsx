import type { RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import type { AssistantModel, Translate } from "./types";

type AssistantModelSelectorProps = {
  activeModels: AssistantModel[];
  effectiveSelectedModelId: string | null;
  isAutonomousMode: boolean;
  isOpen: boolean;
  isRecording: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSelectModel: (modelId: string) => void;
  selectedModelData: AssistantModel | undefined;
  selectorRef: RefObject<HTMLDivElement | null>;
  t: Translate;
};

export function AssistantModelSelector({
  activeModels,
  effectiveSelectedModelId,
  isAutonomousMode,
  isOpen,
  isRecording,
  onOpenChange,
  onSelectModel,
  selectedModelData,
  selectorRef,
  t,
}: AssistantModelSelectorProps) {
  return (
    <div className="relative" ref={selectorRef}>
      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        disabled={isRecording || activeModels.length === 0 || isAutonomousMode}
        className={`h-10 px-4 flex items-center gap-2 rounded-full transition-colors disabled:opacity-50 ${
          isOpen ? "bg-foreground/5 dark:bg-white/10 text-foreground" : "hover:bg-foreground/5 dark:hover:bg-white/10 text-muted"
        }`}
      >
        <span className="text-[14px] font-medium max-w-[140px] truncate">
          {selectedModelData
            ? selectedModelData.friendlyName || selectedModelData.displayName || selectedModelData.modelId
            : t("controls.engine.label")}
        </span>
        <ChevronDown className="w-4 h-4 flex-shrink-0" />
      </button>

      <AnimatePresence>
        {isOpen && !isRecording && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-3 w-[220px] bg-card dark:bg-[#1a1a1c] border border-border-dim dark:border-white/10 rounded-[14px] shadow-2xl p-1.5 z-50 flex flex-col max-h-[300px] overflow-y-auto custom-scrollbar"
          >
            <div className="px-3 py-2 border-b border-border-dim dark:border-white/5 mb-1 sticky top-0 bg-card z-10">
              <span className="text-[11px] font-medium text-muted tracking-widest uppercase">
                {t("controls.engine.title")}
              </span>
            </div>
            {activeModels.map((model) => (
              <button
                key={model.modelId}
                type="button"
                onClick={() => onSelectModel(model.modelId)}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-[10px] text-left transition-colors ${
                  effectiveSelectedModelId === model.modelId
                    ? "bg-foreground/5 dark:bg-white/10"
                    : "hover:bg-foreground/5 dark:hover:bg-white/5"
                }`}
              >
                <span
                  className={`text-[14px] font-medium truncate pr-3 ${
                    effectiveSelectedModelId === model.modelId ? "text-foreground" : "text-foreground/80"
                  }`}
                >
                  {model.friendlyName || model.displayName || model.modelId}
                </span>
                {effectiveSelectedModelId === model.modelId && (
                  <Check className="w-3.5 h-3.5 text-brand flex-shrink-0" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
