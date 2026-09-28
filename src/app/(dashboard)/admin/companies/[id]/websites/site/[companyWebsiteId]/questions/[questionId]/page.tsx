"use client";

import { useParams } from "next/navigation";

import type { Id } from "@/convex/_generated/dataModel";
import { PromptFanOut } from "../../../../ai-searches/_components/PromptFanOut";

/** One prompt's fan-out queries, opened from one website's Your prompts (docs/plans/active/prompt-fan-out-queries-plan.md). */
export default function WebsitePromptFanOutPage() {
  const params = useParams();
  return (
    <PromptFanOut
      questionId={params.questionId as Id<"websiteQuestions">}
      companyWebsiteId={params.companyWebsiteId as Id<"companyWebsites">}
    />
  );
}
