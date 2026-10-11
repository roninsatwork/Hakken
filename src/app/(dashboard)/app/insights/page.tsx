import { redirect } from "next/navigation";

/**
 * Insights opens on its leaderboards until the executive summary is built
 * (insights-analyst-plan.md §12, phases 4 and 5): then it opens there.
 */
export default function InsightsPage() {
  redirect("/app/insights/leaderboards");
}
