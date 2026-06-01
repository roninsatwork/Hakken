import type { RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import type { Translate } from "./types";
import { THINKING_LEVELS, type ThinkingLevelId } from "./assistantWelcomeUtils";

type AssistantThinkingSelectorProps = {
  isAutonomousMode: boolean;
  isOpen: boolean;
  isRecording: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSelectThinking: (thinkingId: ThinkingLevelId) => void;
  selectedThinkingId: ThinkingLevelId;
  selectorRef: RefObject<HTMLDivElement | null>;
  t: Translate;
};

export function AssistantThinkingSelector({
  isAutonomousMode,
  isOpen,
  isRecording,
  onOpenChange,
  onSelectThinking,
  selectedThinkingId,
  selectorRef,
  t,
}: AssistantThinkingSelectorProps) {
  return (
    <div className="relative" ref={selectorRef}>
      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        disabled={isRecording || isAutonomousMode}
        className={`h-10 px-4 flex items-center gap-2 rounded-full transition-colors disabled:opacity-50 ${
          isOpen ? "bg-foreground/5 dark:bg-white/10 text-foreground" : "hover:bg-foreground/5 dark:hover:bg-white/10 text-muted"
        }`}
      >
        <span className="text-[14px] font-medium">{t(`controls.reasoning.levels.${selectedThinkingId}`)}</span>
        <ChevronDown className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {isOpen && !isRecording && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-3 w-[260px] sm:w-[300px] bg-card dark:bg-[#1a1a1c] border border-border-dim dark:border-white/10 rounded-[24px] shadow-2xl p-2 z-50 flex flex-col"
          >
            <div className="px-4 py-3 pb-2 border-b border-border-dim dark:border-white/5 mb-1">
              <span className="text-[12px] font-medium text-muted tracking-widest uppercase">
                {t("controls.reasoning.title")}
              </span>
            </div>
            {THINKING_LEVELS.map((level) => (
              <button
                key={level.id}
                type="button"
                onClick={() => onSelectThinking(level.id)}
                className={`flex items-center justify-between w-full p-4 rounded-[16px] text-left transition-colors ${
                  selectedThinkingId === level.id
                    ? "bg-foreground/5 dark:bg-white/10"
                    : "hover:bg-foreground/5 dark:hover:bg-white/5"
                }`}
              >
                <div className="flex flex-col gap-1 pr-4 min-w-0">
                  <span
                    className={`text-[15px] font-medium truncate ${
                      selectedThinkingId === level.id ? "text-foreground" : "text-foreground/80"
                    }`}
                  >
                    {t(`controls.reasoning.levels.${level.id}`)}
                  </span>
                  <span className="text-[13px] text-muted font-light truncate">
                    {t(`controls.reasoning.descriptions.${level.id}`)}
                  </span>
                </div>
                {selectedThinkingId === level.id && (
                  <div className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-brand" />
                  </div>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
