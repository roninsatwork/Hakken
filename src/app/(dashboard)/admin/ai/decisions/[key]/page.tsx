"use client";

import { useParams } from "next/navigation";
import { DecisionDetailScreen } from "@/src/app/(dashboard)/admin/_features/decisions/DecisionDetailScreen";

/** One Decision: its question, its answers and its last runs, platform-wide. */
export default function DecisionDetailPage() {
  const params = useParams();
  const decisionKey = decodeURIComponent(String(params.key ?? ""));
  return <DecisionDetailScreen decisionKey={decisionKey} />;
}
