"use client";

import { WikiAskScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiAskScreen";
import { AI_PATHS } from "@/src/app/(dashboard)/admin/ai/_components/aiMenu";

/** Ask the platform wiki a question and see its answer and the pages it stood on (S6). */
export default function PlatformWikiAskPage() {
  return <WikiAskScreen basePath={AI_PATHS.wiki} />;
}
