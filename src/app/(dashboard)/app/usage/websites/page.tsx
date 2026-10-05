"use client";

import { UsageBreakdown } from "../_components/Breakdown";

/** Usage → By website: one website's month, owned or tracked, and every charge made for it (usage-credits-plan.md, board ByWebsite). */
export default function UsageByWebsitePage() {
  return <UsageBreakdown by="website" />;
}
