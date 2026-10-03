"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { NOT_SORTED_KIND, type ClassificationType, type KindChoice } from "@/convex/utils/pageKinds";
import { PAGE_TYPES } from "@/convex/utils/siteShapes";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";

/**
 * How a screen names a page's kind (docs/plans/active/page-groups-plan.md,
 * decision 2): Hakken's own page type, translated — or, once the website has
 * classifications of the company's own, the classification's own name, and
 * "Not sorted" for a page none catches. The reads hand each page's kind over
 * already worked out (`convex/pageKinds.ts`); this names it and offers the
 * filter's choices.
 *
 * Shared by Search Console and Sites, so it lives here, the narrowest folder
 * both reach (as `KindBars`).
 */
export type PageKindsView = {
  /** Undefined while loading; null while the website has no classifications, so its page types show. */
  choices: KindChoice[] | null | undefined;
  /** True once the website has classifications: labels, filters and charts follow them. */
  classified: boolean;
  /** A kind's words: a classification's name, Not sorted, or a translated page type. */
  label: (kind: string | null | undefined) => string;
  /** Whether a kind is one of the company's own: a classification, or Not sorted. */
  isOwn: (kind: string | null | undefined) => boolean;
  /** A kind's classification type; null for Not sorted or a page type. */
  typeOf: (kind: string | null | undefined) => ClassificationType | null;
  /** The filter's choices: each classification, then Not sorted — or Hakken's page types. */
  options: Array<{ value: string; label: string }>;
  /** Every value a kind filter may hold in the address; undefined while loading, so a link to a classification is not dropped. */
  allowed: readonly string[] | undefined;
};

/** The tone a classification's label takes, by its type; Not sorted is neutral. Words carry the meaning, never the colour alone. */
const TYPE_TONES: Record<ClassificationType, StatusTone> = {
  INFORMATIONAL: "info",
  SERVICE: "success",
  PRODUCT: "success",
  CASE_STUDY: "info",
  COMPANY: "neutral",
  LEGAL: "neutral",
  OTHER: "neutral",
};

export function kindTone(type: ClassificationType | null): StatusTone {
  return type ? TYPE_TONES[type] : "neutral";
}

const PAGE_TYPE_LIST: readonly string[] = PAGE_TYPES;

export function usePageKinds(siteId: Id<"companyWebsites"> | null | undefined): PageKindsView {
  const t = useTranslations("sites.common");
  const answer = useQuery(api.pageKinds.pageKindChoices, siteId ? { siteId } : "skip");
  const choices: KindChoice[] | null | undefined = Array.isArray(answer) ? answer : answer === null ? null : undefined;
  const byId = new Map((choices ?? []).map((choice) => [choice.id, choice]));
  const classified = Boolean(choices && choices.length > 0);
  const isOwn = (kind: string | null | undefined) => Boolean(kind) && (kind === NOT_SORTED_KIND || byId.has(kind as string));
  return {
    choices,
    classified,
    isOwn,
    label: (kind) => {
      if (!kind) return "–";
      if (kind === NOT_SORTED_KIND) return t("notSorted");
      const choice = byId.get(kind);
      if (choice) return choice.name;
      if (PAGE_TYPE_LIST.includes(kind)) return t(`pageTypes.${kind}`);
      // A classification the list does not know yet: still on its way, or just removed.
      return choices === undefined ? "…" : "–";
    },
    typeOf: (kind) => (kind ? byId.get(kind)?.type ?? null : null),
    options: classified
      ? [...(choices ?? []).map((choice) => ({ value: choice.id, label: choice.name })), { value: NOT_SORTED_KIND, label: t("notSorted") }]
      : PAGE_TYPES.map((type) => ({ value: type, label: t(`pageTypes.${type}`) })),
    allowed: choices === undefined ? undefined : classified ? [...byId.keys(), NOT_SORTED_KIND] : PAGE_TYPE_LIST,
  };
}
