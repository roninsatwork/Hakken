"use client";

import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { Notice } from "@/src/ui/components/screens/Notice";
import type { EnquiryCheck } from "@/convex/utils/insightEnquiryCheck";
import { formatNumber } from "../../sites/_components/siteFormat";

/**
 * The enquiry check, said where enquiries are counted (insights-analyst-plan.md
 * I42): when Hakken isn't sure each real enquiry counts once, the page says
 * why in plain words, so no figure built on the count reads surer than it is.
 */
export function EnquiryCheckNotice({ check }: { check: EnquiryCheck | null | undefined }) {
  const t = usePlatformTranslations("insights.enquiryCheck");
  if (!check || check.ok) return null;
  const said = check.problems.map((problem) => t(problem.code, { event: problem.event, other: problem.other ?? "", a: formatNumber(problem.a), b: formatNumber(problem.b) }));
  return <Notice tone="warning">{t("intro", { problems: said.join(" ") })}</Notice>;
}
