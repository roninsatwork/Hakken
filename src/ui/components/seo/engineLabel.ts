"use client";

import { useTranslations } from "next-intl";

/**
 * The AI engines' names, for any screen that shows them — admin's and the
 * client's Sites screens alike.
 *
 * The one place a screen names the engines. It began in admin's
 * `EngineChoice.tsx`; the client's Sites screens need the same names, and a
 * customer-facing route may not import admin internals, so it moved here and
 * admin re-exports it. The provider guard allows the engines to be named in
 * this file for exactly that reason.
 *
 * The labels are literal keys rather than a template over the union, because
 * the translation keys are typed and a template is not one of them.
 */
/** The order an answer's screen switches between the engines, as drawn: the apps, Google's page, then the models (discovery-local-reputation-ai-plan.md, D18). */
export const ENGINE_SCREEN_ORDER: readonly string[] = ["chatgpt", "gemini", "ai_mode", "claude", "perplexity"];

export function useEngineLabel() {
  const t = useTranslations("aiEngines");
  return (engine: string) => {
    if (engine === "chatgpt") return t("chatgpt");
    if (engine === "claude") return t("claude");
    if (engine === "gemini") return t("gemini");
    if (engine === "perplexity") return t("perplexity");
    // Google's own answer page, asked our questions (discovery-local-reputation-ai-plan.md, D17).
    if (engine === "ai_mode") return t("aiMode");
    // Not an engine asked our questions: the searches Google's AI Overviews ran (FA8).
    if (engine === "google_ai_overview") return t("googleAiOverview");
    return engine;
  };
}
