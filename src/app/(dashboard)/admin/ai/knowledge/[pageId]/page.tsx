"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiPageDetailScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiPageDetailScreen";

/** One page of the platform wiki (global-wiki-plan.md, phase 3). */
export default function PlatformWikiPageDetailPage() {
  const params = useParams();
  return (
    <WikiPageDetailScreen
      pageId={params.pageId as Id<"wikiPages">}
      basePath="/admin/ai/knowledge"
    />
  );
}
