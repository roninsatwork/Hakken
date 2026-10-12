/**
 * Findings in sections (docs/plans/active/insights-intelligence-plan.md
 * phase 7): each finding filed under one section of the Insights menu, by the
 * specialist who wrote it and its pattern — Keyword cannibalisation, Enquiries
 * and pages, Search and content, AI answers, Rivals, links and reviews, and
 * Technical and measurement. Shared by the screens and the reads, so a
 * finding is in one section wherever it is listed.
 */

export const FINDING_SECTIONS = ["cannibalisation", "enquiries", "search", "ai", "rivals", "technical"] as const;
export type FindingSection = (typeof FINDING_SECTIONS)[number];

/** The patterns that are pages competing for one search, whoever wrote them. */
const COMPETING = new Set(["COMPETING_PAGES", "ownSitesCompete"]);

const BY_SPECIALIST: Record<string, FindingSection> = {
  conversion: "enquiries",
  strategy: "enquiries",
  search: "search",
  aiVisibility: "ai",
  market: "rivals",
  links: "rivals",
  local: "rivals",
  technical: "technical",
  measurement: "technical",
};

/** A finding's section. */
export function sectionOf(finding: { specialist: string; pattern: string }): FindingSection {
  if (COMPETING.has(finding.pattern)) return "cannibalisation";
  return BY_SPECIALIST[finding.specialist] ?? "enquiries";
}

export function isFindingSection(value: string): value is FindingSection {
  return (FINDING_SECTIONS as readonly string[]).includes(value);
}
