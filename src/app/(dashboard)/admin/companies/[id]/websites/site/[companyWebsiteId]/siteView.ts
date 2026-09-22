import { formatUpToUsd } from "@/src/lib/currency";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import type { QuestionVerdict, RivalVerdict, SearchVerdict } from "@/convex/utils/trackingVerdicts";

/**
 * What the site's screens share: how a price is written, and what colour a
 * verdict wears.
 *
 * One place for both, because the same verdict appears on the Brief's cards
 * and on the Tracking rows, and two tone maps would drift the first time one
 * of them was edited in a hurry.
 */

/**
 * A monthly price, said honestly.
 *
 * Null is "never charged yet", and says so rather than printing a guess;
 * anything under a cent says so rather than rounding to a reassuring zero.
 */
export function formatMonthly(value: number | null, unknown: string): string {
  if (value === null) return unknown;
  if (value === 0) return formatUpToUsd(0, 0);
  if (value < 0.01) return `< ${formatUpToUsd(0.01, 2)}`;
  return formatUpToUsd(value, 2);
}

export const SEARCH_TONE: Record<SearchVerdict, StatusTone> = {
  TOP_THREE: "success",
  PAGE_ONE: "success",
  SLIPPING: "danger",
  RANKING: "info",
  NOT_FOUND: "warning",
  NEVER_RANKED: "warning",
  TOO_NEW: "neutral",
  NOT_CHECKED: "neutral",
};

export const QUESTION_TONE: Record<QuestionVerdict, StatusTone> = {
  EARNING: "success",
  THIN: "info",
  NEVER_LANDED: "warning",
  WARNED: "danger",
  TOO_NEW: "neutral",
  NOT_ASKED: "neutral",
};

/** Ahead is the rival's good news, so it wears the colour that asks for attention. */
export const RIVAL_TONE: Record<RivalVerdict, StatusTone> = {
  AHEAD: "danger",
  LEVEL: "info",
  BEHIND: "success",
  GONE_QUIET: "warning",
  TOO_NEW: "neutral",
  NOT_CHECKED: "neutral",
};

/** Where one of a company's sites lives. */
export function siteBase(companyId: string, companyWebsiteId: string): string {
  return `/admin/companies/${companyId}/websites/site/${companyWebsiteId}`;
}
