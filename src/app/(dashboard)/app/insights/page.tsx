import { redirect } from "next/navigation";

/** Insights opens on its executive summary (insights-analyst-plan.md §4.1). */
export default function InsightsPage() {
  redirect("/app/insights/summary");
}
