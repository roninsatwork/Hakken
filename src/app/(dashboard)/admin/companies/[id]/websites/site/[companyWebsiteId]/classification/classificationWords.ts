"use client";

import { useTranslations } from "next-intl";

import type { Doc } from "@/convex/_generated/dataModel";
import { siteBase } from "../siteView";

/**
 * What the Page classification screens share (docs/plans/active/
 * page-groups-plan.md, decision 6): the types and kinds of line in the order
 * they are offered, their words, and where the pages live.
 */

export type ClassificationType = Doc<"pageClassifications">["type"];
export type LineKind = Doc<"pageClassificationLines">["kind"];

/** Reports add up across classifications by type. */
export const CLASSIFICATION_TYPES: readonly ClassificationType[] = ["INFORMATIONAL", "SERVICE", "PRODUCT", "CASE_STUDY", "COMPANY", "LEGAL", "OTHER"];

export const LINE_KINDS: readonly LineKind[] = ["STARTS_WITH", "CONTAINS", "EXACT", "SITEMAP_FILE"];

/** Where a website's Page classification lives; a classification's own page is under it, and a new one's at `/new`. */
export function classificationBase(companyId: string, companyWebsiteId: string): string {
  return `${siteBase(companyId, companyWebsiteId)}/classification`;
}

/** The Classifications view, where a classification's own page goes back to. */
export function classificationListHref(companyId: string, companyWebsiteId: string): string {
  return `${classificationBase(companyId, companyWebsiteId)}?view=classifications`;
}

export function useClassificationWords() {
  const t = useTranslations("admin.siteView.classification");
  return {
    type: (type: ClassificationType) => t(`types.${type}`),
    kind: (kind: LineKind) => t(`kinds.${kind}`),
    /** A line as a sentence reads it: "starts with /hub/". */
    line: (line: { kind: LineKind; value: string }) => `${t(`kindsInline.${line.kind}`)} ${line.value}`,
  };
}
