"use client";

import { UsageBreakdown } from "../_components/Breakdown";

/** Usage → By work: one kind of work's month and every charge it made (usage-credits-plan.md, board ByWork). */
export default function UsageByWorkPage() {
  return <UsageBreakdown by="work" />;
}
