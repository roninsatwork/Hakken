"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { HakkenMarkdown } from "@/src/ui/components/chat/HakkenMarkdown";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { formatDay } from "../../../_components/siteFormat";

type SearchAnswer = NonNullable<FunctionReturnType<typeof api.siteAngles.keywordAngle>>["answers"][number];
type Stance = SearchAnswer["stance"];

const OWN_TONES: Record<Stance, StatusTone> = {
  RECOMMENDED: "success",
  NAMED: "success",
  WARNED_AGAINST: "danger",
  NOT_NAMED: "warning",
};

/** The answer's first words, without its markdown, for the closed row. */
function firstWords(text: string): string {
  const plain = text.replace(/[*_#`>[\]|]/g, " ").replace(/\(https?:[^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > 160 ? `${plain.slice(0, 160)}…` : plain;
}

/**
 * The answers in which an assistant ran this search, one row each, closed,
 * opening to whether it named the site and which competitors it named, then
 * the answer word for word, the site's names and its competitors' picked out
 * (Anthony, 2026-09-29: "option 2", drawn on the Fan-out queries canvas; the
 * same day, the labels moved off the closed row into the open answer). The
 * "mentioned" row above says the same across every answer.
 * Another model's writing: shown, never obeyed.
 */
export function SearchAnswers({ answers, names, host }: { answers: SearchAnswer[]; names: string[]; host: string }) {
  const t = useTranslations("sites.keywordRecord.fromAi");
  const ta = useTranslations("sites.aiAnswers");
  const engineLabel = useEngineLabel();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-2">
      {answers.map((answer) => {
        const isOpen = Boolean(open[answer.answerId]);
        const panelId = `answer-${answer.answerId}`;
        return (
          <div key={answer.answerId} className="overflow-hidden rounded-xl border border-border-dim bg-card">
            <Button
              variant="ghost"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen((was) => ({ ...was, [answer.answerId]: !isOpen }))}
              className="flex h-auto min-h-[52px] w-full flex-wrap items-center justify-start gap-x-3 gap-y-1.5 rounded-none px-4 py-3 text-left hover:bg-hover"
            >
              {isOpen
                ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted" aria-hidden="true" />
                : <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted" aria-hidden="true" />}
              <span className="text-[13px] font-semibold text-foreground">{t("answerTitle", { engine: engineLabel(answer.engine) })}</span>
              <span className="text-[12px] text-muted">{t("answerDay", { day: formatDay(answer.day) })}</span>
              {!isOpen ? <span className="min-w-0 flex-1 truncate text-[12px] font-normal text-muted">{answer.text === null ? ta("wordingNotKept") : firstWords(answer.text)}</span> : null}
            </Button>
            {isOpen ? (
              <div id={panelId} className="flex flex-col gap-3 px-4 pb-4 pl-11">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                  <StatusLabel tone={OWN_TONES[answer.stance]} size="md">{t(`you.${answer.stance}`, { host })}</StatusLabel>
                  {answer.rivals.map((rival) => (
                    <StatusLabel key={rival.host} tone="warning" size="md">{t(`rival.${rival.stance === "NOT_NAMED" ? "NAMED" : rival.stance}`, { host: rival.host })}</StatusLabel>
                  ))}
                </div>
                {answer.text === null ? (
                  // Past the 90 days its wording is kept: whom it named still shows above.
                  <p className="text-[13px] text-muted">{ta("wordingNotKept")}</p>
                ) : (
                  <div className="max-w-[75ch] text-[13px] text-secondary">
                    <HakkenMarkdown content={answer.text} highlight={names} highlightOthers={answer.rivalNames} />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
