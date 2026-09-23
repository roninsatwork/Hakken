import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import type { RivalVerdict, SearchVerdict } from "@/convex/utils/trackingVerdicts";

/**
 * What the site's screens share: what colour a verdict wears, and where a
 * site lives.
 */

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
