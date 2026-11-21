"use client";

import { WikiWaitingScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiWaitingScreen";
import { AI_PATHS } from "@/src/app/(dashboard)/admin/ai/_components/aiMenu";

/** What the platform wiki is waiting on you for: imports to review and open questions (S6). */
export default function PlatformWikiWaitingPage() {
  return <WikiWaitingScreen basePath={AI_PATHS.wiki} />;
}
