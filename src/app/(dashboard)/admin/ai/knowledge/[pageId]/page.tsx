"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiPageDetailScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiPageDetailScreen";
import { AI_PATHS } from "@/src/app/(dashboard)/admin/ai/_components/aiMenu";

/** One page of the platform wiki (global-wiki-plan.md, phase 3). Its open
 * questions are settled on the wiki's Waiting on you page (S6). */
export default function PlatformWikiPageDetailPage() {
  const params = useParams();
  return (
    <WikiPageDetailScreen
      pageId={params.pageId as Id<"wikiPages">}
      basePath={AI_PATHS.wiki}
      waitingHref={AI_PATHS.wikiWaiting}
    />
  );
}
