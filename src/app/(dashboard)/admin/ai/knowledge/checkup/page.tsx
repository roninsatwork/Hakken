"use client";

import { WikiCheckupPage } from "@/src/app/(dashboard)/admin/_features/wiki/WikiCheckupPage";
import { AI_PATHS } from "@/src/app/(dashboard)/admin/ai/_components/aiMenu";

/** The platform wiki's nightly check-up and its week, on a page of their own (S6, S8). */
export default function PlatformWikiCheckupPage() {
  return <WikiCheckupPage waitingHref={AI_PATHS.wikiWaiting} />;
}
