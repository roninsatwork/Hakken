"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { getPresentableAssistantStage } from "@/convex/streamingService";
import { STREAM_STALE_CHECK_INTERVAL_MS } from "@/src/hooks/useStreamPresentation";

/**
 * The pre-reply status, saying only what the run is actually doing.
 *
 * Set as the opening of an assistant turn rather than as a floating bubble:
 * same seal, same label, same hairline margin the answer will use, so the
 * reply grows out of it instead of replacing a differently-shaped object.
 *
 * The text comes from the stage the run wrote as it entered each real phase.
 * When no stage is available — the run has not reached its first marker, or
 * left a stale one behind — it says "Thinking…" and nothing more specific.
 */
export function AssistantStagePill({ threadId }: { threadId: Id<"threads"> }) {
  const t = useTranslations("ai.assistant.stages");
  const settings = useSystemSettings();
  const stageData = useQuery(api.chat.getAssistantStage, { threadId });

  // Reading the clock during render is impure; tick it in an effect instead,
  // the same pattern useStreamPresentation uses. Zero reads as "not yet
  // stale", the right first impression for a live run.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!stageData?.stage) return;
    const interval = setInterval(() => setNow(Date.now()), STREAM_STALE_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [stageData?.stage]);

  const stage = getPresentableAssistantStage({
    stage: stageData?.stage,
    stageAt: stageData?.stageAt,
    now,
  });

  const labels = {
    CHECKING: t("checking"),
    READING_FILES: t("readingFiles"),
    SEARCHING_KNOWLEDGE: t("searchingKnowledge"),
    WRITING: t("writing"),
  } as const;

  return (
    <div className="flex flex-col gap-2.5 border-l border-border-dim pl-4 sm:pl-5 mb-9">
      <div className="flex items-center gap-2">
        <span className="w-[15px] h-[15px] rounded-[4px] bg-brand flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-2.5 h-2.5 text-white" />
        </span>
        <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted">
          {settings.platformName}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[14px] text-secondary" role="status">
        <Loader2 className="w-3.5 h-3.5 text-brand animate-spin flex-shrink-0" />
        <span>{stage ? labels[stage] : t("thinking")}</span>
      </div>
    </div>
  );
}
