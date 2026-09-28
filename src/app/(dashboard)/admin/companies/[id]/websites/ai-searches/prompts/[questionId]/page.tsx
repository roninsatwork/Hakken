"use client";

import { useParams } from "next/navigation";

import type { Id } from "@/convex/_generated/dataModel";
import { PromptFanOut } from "../../_components/PromptFanOut";

/** One prompt's fan-out queries, opened from Your prompts for All websites (docs/plans/active/prompt-fan-out-queries-plan.md). */
export default function PromptFanOutPage() {
  const params = useParams();
  return <PromptFanOut questionId={params.questionId as Id<"websiteQuestions">} />;
}
