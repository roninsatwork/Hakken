"use client";

import { WikiNewGoalScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiNewGoalScreen";
import { AI_PATHS } from "@/src/app/(dashboard)/admin/ai/_components/aiMenu";

/** A new goal in the platform wiki, on a page of its own rather than a pop-up (S6). */
export default function PlatformWikiNewGoalPage() {
  return <WikiNewGoalScreen basePath={AI_PATHS.wiki} />;
}
