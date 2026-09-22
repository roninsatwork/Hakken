"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";

/**
 * Which AI engines a question is put to — the one place the screens name them.
 *
 * Picking fewer engines is the cheapest lever in the citations feature: every
 * engine is a paid answer on every collection. Two screens pick them now, the
 * website record's Questions tab and a client's Tracking tab, so the choice
 * and the names live here once rather than in both. The provider guard allows
 * the engines to be named in this file for exactly that reason.
 *
 * The labels are literal keys rather than a template over the union, because
 * the translation keys are typed and a template is not one of them.
 */
export function useEngineLabel() {
  const t = useTranslations("admin.websiteDetail.questions");
  return (engine: string) => {
    if (engine === "chatgpt") return t("engines.chatgpt");
    if (engine === "claude") return t("engines.claude");
    if (engine === "gemini") return t("engines.gemini");
    if (engine === "perplexity") return t("engines.perplexity");
    return engine;
  };
}

/**
 * The engines a new question will be put to.
 *
 * Holds the *exclusions* rather than the selection: absent means "all of
 * them", which is what the mutation does with an empty list too, and it lets
 * the engine list arrive from the server without an effect seeding state.
 */
export function useEngineChoice() {
  const all = useQuery(api.websiteCanonical.listEngines, {}) ?? [];
  const [dropped, setDropped] = useState<string[]>([]);
  const chosen = all.filter((engine) => !dropped.includes(engine));
  const toggle = (engine: string) => {
    setDropped((current) => (
      current.includes(engine) ? current.filter((entry) => entry !== engine) : [...current, engine]
    ));
  };
  return { all, chosen, toggle };
}

/**
 * The chips themselves, with a tick on the chosen ones.
 *
 * Not a colour alone. Seen in the browser on 2026-09-22: a chip just switched
 * off keeps its focus ring, and a focus ring in the brand colour read exactly
 * like "on" — so the one choice that changes the bill could not be read back.
 */
export function EngineChips({
  all,
  chosen,
  onToggle,
}: {
  all: readonly string[];
  chosen: readonly string[];
  onToggle: (engine: string) => void;
}) {
  const engineLabel = useEngineLabel();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {all.map((engine) => {
        const isChosen = chosen.includes(engine);
        return (
          <Button
            key={engine}
            variant="outline"
            role="checkbox"
            aria-checked={isChosen}
            className={`rounded-full px-3 py-1 text-[12px] ${
              isChosen ? "border-brand bg-brand/10 text-brand" : "border-dashed text-muted"
            }`}
            onClick={() => onToggle(engine)}
          >
            {isChosen ? <Check className="mr-1 inline h-3 w-3" aria-hidden="true" /> : null}
            {engineLabel(engine)}
          </Button>
        );
      })}
    </div>
  );
}
