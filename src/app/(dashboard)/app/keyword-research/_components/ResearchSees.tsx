"use client";

import type { Seen } from "@/convex/utils/hakkenSees";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { useSeenWords } from "../../sites/_components/SiteSees";

/**
 * A Keyword research screen's What Hakken sees box (discovery-detail-and-
 * hakken-sees-plan.md §6): the codes its rules worked out, in this screen's
 * words (`keywordResearch.seen.<screen>`). Its steps lead by address — a
 * lookup's screens, or a website's record of a search — never to a purchase.
 * Nothing while the screen is loading.
 */
export function ResearchSees({ screen, seen }: { screen: string; seen: Seen | null | undefined }) {
  const { words, linkWords } = useSeenWords("keywordResearch.seen", screen);
  if (!seen || seen.says.length === 0) return null;
  const steps: HakkenSeesStep[] = seen.steps.map((step) => ({
    words: words(step),
    link: linkWords(step.link),
    href: step.to.url ?? "",
    ...(step.to.url && !step.to.url.startsWith("/") ? { external: true } : {}),
  }));
  return <HakkenSees says={seen.says.map(words)} steps={steps} />;
}
