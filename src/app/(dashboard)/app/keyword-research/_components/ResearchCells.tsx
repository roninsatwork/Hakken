"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { PageSection } from "../../_components/PageSection";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { PositionCell } from "../../sites/_components/SiteCells";
import { formatNumber } from "../../sites/_components/siteFormat";
import { COUNTRY_KEYS, VERDICT_TONES, difficultyWord, isIntent, type Verdict } from "./researchWords";
import type { ResearchProblem } from "@/convex/utils/researchProblems";

/**
 * The cells Keyword research's tables share, so a difficulty, an intent, a
 * position and a verdict read the same on every one of its screens
 * (docs/plans/active/keyword-research-plan.md, boards 1, 2 and 7). Built on
 * the kit's labels and Sites' own cells.
 */

/** A difficulty: its number, then its word, quietly — "64 Hard". */
export function DifficultyCell({ value }: { value: number | null }) {
  const t = useTranslations("keywordResearch.difficulty");
  if (value === null) return <NoFigure />;
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono text-[12px] tabular-nums text-foreground">{value}</span>{" "}
      <span className="text-[11px] text-muted">{t(difficultyWord(value))}</span>
    </span>
  );
}

/** What searchers want, as plain words: a kind, so the kit's `TagLabel`, as drawn. */
export function IntentWord({ intent }: { intent: string | null }) {
  const t = useTranslations("keywordResearch.intents");
  if (!isIntent(intent)) return <NoFigure />;
  return <TagLabel>{t(intent)}</TagLabel>;
}

/**
 * Where the website stands on Google for a keyword: its place, "Not in the
 * top 100" when Google's top 100 was read and it is not there, and a dash
 * when nothing was measured.
 */
export function ResearchPositionCell({ position, notInTop100 }: { position: number | null; notInTop100: boolean }) {
  if (position !== null || notInTop100) return <PositionCell position={position} />;
  return <NoFigure />;
}

/** One of the four answers, or "Not judged yet" where the figures it needs are missing. */
export function VerdictLabel({ verdict, size }: { verdict: Verdict | null; size?: "sm" | "md" }) {
  const t = useTranslations("keywordResearch.verdicts");
  if (!verdict) return <StatusLabel tone="neutral" size={size}>{t("NONE")}</StatusLabel>;
  return <StatusLabel tone={VERDICT_TONES[verdict]} size={size}>{t(verdict)}</StatusLabel>;
}

/** A plain number in a table, in the figures' type. */
export function FigureCell({ value, text }: { value: number | null; text?: string }) {
  if (value === null) return <NoFigure />;
  return <span className="font-mono text-[12px] tabular-nums text-foreground">{text ?? formatNumber(value)}</span>;
}

/** A section's title above what it holds: the app's shared `PageSection`, as drawn for Past lookups and Research lists. */
export function ResearchSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <PageSection title={title} description={description}>{children}</PageSection>;
}

/** The country a lookup is in, in the reader's language where we have its name. */
export function useCountryName(): (code: number, fallback: string) => string {
  const t = useTranslations("keywordResearch.countries");
  return (code, fallback) => {
    const key = COUNTRY_KEYS[code];
    return key && t.has(key) ? t(key) : fallback;
  };
}

/** "in the United Kingdom", "nel Regno Unito": a country as a sentence says where. */
/** Why a part of a lookup failed, in the screen's own words: the server sends a code, never a sentence of its own. */
export function useProblemWords(): (problem: ResearchProblem | null, fallback: string) => string {
  const t = useTranslations("keywordResearch.problems");
  return (problem, fallback) => (problem ? t(problem) : fallback);
}

export function usePlaceIn(): (code: number, fallback: string) => string {
  const t = useTranslations("keywordResearch");
  const countryName = useCountryName();
  return (code, fallback) => {
    const key = COUNTRY_KEYS[code];
    return key && t.has(`placeIn.${key}`) ? t(`placeIn.${key}`) : t("placeInOther", { country: countryName(code, fallback) });
  };
}
