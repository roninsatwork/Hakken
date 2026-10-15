"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { siteBase } from "../siteView";

/**
 * What the Page classification screens share (docs/plans/active/
 * page-groups-plan.md, decision 6): the types and kinds of line in the order
 * they are offered, their words, and where the pages live.
 */

export type ClassificationType = Doc<"pageClassifications">["type"];
export type LineKind = Doc<"pageClassificationLines">["kind"];

export const LINE_KINDS: readonly LineKind[] = ["STARTS_WITH", "CONTAINS", "EXACT", "SITEMAP_FILE"];

/** Where a website's Page classification lives; a classification's own page is under it, and a new one's at `/new`. */
export function classificationBase(companyId: string, companyWebsiteId: string): string {
  return `${siteBase(companyId, companyWebsiteId)}/classification`;
}

/** The Classifications view, where a classification's own page goes back to. */
export function classificationListHref(companyId: string, companyWebsiteId: string): string {
  return `${classificationBase(companyId, companyWebsiteId)}?view=classifications`;
}

/**
 * The types a classification picks from, in the order they are offered and
 * the reader's language: the one list of System Settings → Classification
 * (docs/plans/active/classification-types-plan.md). `choices` is undefined
 * while it loads.
 */
export function useClassificationTypes() {
  const language = useLocale();
  const choices = useQuery(api.classificationTypes.classificationTypeChoices, { language });
  const byKey = new Map((choices ?? []).map((choice) => [choice.key, choice]));
  return {
    choices,
    /** A type's name; "…" while the list loads. */
    nameOf: (type: ClassificationType) => byKey.get(type)?.name ?? (choices === undefined ? "…" : "–"),
  };
}

export function useClassificationWords() {
  const t = useTranslations("admin.siteView.classification");
  return {
    kind: (kind: LineKind) => t(`kinds.${kind}`),
    /** A line as a sentence reads it: "starts with /hub/". */
    line: (line: { kind: LineKind; value: string }) => `${t(`kindsInline.${line.kind}`)} ${line.value}`,
  };
}
